import { ADDR_MAX, OPCODE } from '../constants.js';
import { InstructionDecoder } from './instruction-decoder.js';
import { ControlUnit } from './control-unit.js';
import { ALU } from './alu.js';
import { InternalBus } from './internal-bus.js';

/**
 * CPU Pipeline - Version 3.0
 *
 * Micro-architectural Pipelined Datapath with Central Internal Tri-State Bus:
 *   - InternalBus: 16-bit central bus linking Latches (PC, IR, MAR, MDR, PSR) and RegisterFile (R0-R7).
 *   - Tri-State Gating: Only ONE component drives the bus at a time (GatePC, GateMDR, GateALU, GateMARMUX).
 *   - Gated Loading: Destination registers latch bus contents on enable (LD_MAR, LD_IR, LD_REG, LD_CC).
 *
 * Orchestrates the sequential execution of 5 micro-architectural phases:
 *   1. phaseFetch()     (IF)  - GatePC drives BUS -> LD_MAR captures -> MemRead loads MDR -> GateMDR drives BUS -> LD_IR captures -> PC incremented.
 *   2. phaseDecode()    (ID)  - Opcode decode, Control Unit asserts wire signals & bus gates, Register File dual read ports.
 *   3. phaseExecute()   (EX)  - ALUSrc MUX operand selection, ALU arithmetic computation, address addition, flag calculation.
 *   4. phaseMemory()    (MEM) - GateMARMUX drives BUS -> LD_MAR captures -> MemoryBusInterface read/write cycle.
 *   5. phaseWriteBack() (WB)  - GateMDR or GateALU drives BUS -> LD_REG latches into RegisterFile[DR] -> LD_CC latches into PSR.
 */
export class CpuPipeline {
  /**
   * @param {object} vm - Virtual Machine instance containing latches, regFile, and bus
   */
  constructor(vm) {
    this.vm = vm;
    this.latches = vm.latches;
    this.regFile = vm.regFile;
    this.bus = vm.bus;
    this.internalBus = new InternalBus();

    // Pipeline Inter-Stage Registers
    this.stageRegisters = {
      IF: null,
      ID: null,
      EX: null,
      MEM: null,
      WB: null,
    };
  }

  /**
   * Resets inter-stage pipeline registers and central internal bus.
   */
  reset() {
    this.internalBus.reset();
    this.stageRegisters = {
      IF: null,
      ID: null,
      EX: null,
      MEM: null,
      WB: null,
    };
  }

  /**
   * PHASE 1: INSTRUCTION FETCH (IF)
   *
   * Central Internal Bus Flow:
   * 1. GatePC = 1    -> Central Bus <= PC (fetchPc).
   * 2. LD_MAR = 1    -> MAR <= Central Bus (fetchPc). MAR drives external Address Bus.
   * 3. MemRead = 1   -> External Memory Bus read cycle: RAM[MAR] -> Data Bus -> MDR.
   * 4. GateMDR = 1   -> Central Bus <= MDR (instruction word).
   * 5. LD_IR = 1     -> IR <= Central Bus.
   * 6. PC <= (PC + 1) & 0xFFFF.
   *
   * @returns {object} IF Stage pipeline packet
   */
  phaseFetch() {
    const fetchPc = this.latches.PC;

    // 1. GatePC: PC drives Central Internal Bus
    this.internalBus.drive('PC', fetchPc);

    // 2. LD_MAR: MAR latches from Central Internal Bus
    this.latches.latchMAR(this.internalBus.read());

    // 3. Memory Bus Interface read cycle: External Address Bus <= MAR, RAM[MAR] -> Data Bus -> MDR
    const rawInstruction = this.bus.readCycle(this.latches, true);

    // 4. GateMDR: MDR drives Central Internal Bus
    this.internalBus.drive('MDR', rawInstruction);

    // 5. LD_IR: IR latches instruction word from Central Internal Bus
    this.latches.latchIR(this.internalBus.read());

    // 6. PC is incremented to next sequential address
    const nextPc = (fetchPc + 1) & ADDR_MAX;
    this.latches.latchPC(nextPc);

    const hardwareEvents = [
      `[IF Stage]  Central Internal Bus: GatePC=1 -> BUS <= PC (${fetchPc})`,
      `[IF Stage]  Memory Address Register (MAR) <= BUS (${fetchPc}) (LD_MAR: ENABLED, driving Address Bus)`,
      `[IF Stage]  Memory Bus Interface: Read Cycle active (MemRead: ENABLED) -> Data Bus <= 0b${rawInstruction.toString(2).padStart(16, '0')} -> MDR <= 0x${rawInstruction.toString(16).padStart(4, '0').toUpperCase()}`,
      `[IF Stage]  Central Internal Bus: GateMDR=1 -> BUS <= MDR (0x${rawInstruction.toString(16).padStart(4, '0').toUpperCase()})`,
      `[IF Stage]  Instruction Register (IR) <= BUS (LD_IR: ENABLED, instruction latched)`,
      `[IF Stage]  Program Counter (PC) <= ${nextPc} (Incremented PC)`,
    ];

    const ifPacket = {
      stage: 'IF',
      pc: fetchPc,
      nextPc,
      rawInstruction,
      hardwareEvents,
    };

    this.stageRegisters.IF = ifPacket;
    return ifPacket;
  }

  /**
   * PHASE 2: INSTRUCTION DECODE & REGISTER READ (ID)
   *
   * Hardware operations:
   * 1. Decodes IR bitfields (DR, SR1, SR2 / imm5, pcOffset9).
   * 2. Control Unit evaluates opcode & mode to emit control wire signals and bus gating lines.
   * 3. Register File read ports:
   *    - Port A reads SR1.
   *    - Port B reads SR2 (if register mode).
   * 4. Sign-Extension Unit (SEXT5 / SEXT9).
   *
   * @param {object} [ifStage] - Previous IF stage packet
   * @returns {object} ID Stage pipeline packet
   */
  phaseDecode(ifStage = this.stageRegisters.IF) {
    const rawInstruction = ifStage ? ifStage.rawInstruction : this.latches.IR;
    const currentPc = ifStage ? ifStage.pc : this.latches.PC;
    const nextPc = ifStage ? ifStage.nextPc : (this.latches.PC + 1) & ADDR_MAX;

    // 1. Decode instruction fields
    const decoded = InstructionDecoder.decode(rawInstruction);

    // 2. Control Unit evaluates opcode to assert control wire signals
    const control = ControlUnit.generateSignals(decoded);

    // 3. Register File read ports
    let sr1Val = 0;
    let sr2Val = 0;

    if (decoded.sr1 !== undefined) {
      sr1Val = this.regFile.readPortA(decoded.sr1);
    }
    if (decoded.sr2 !== undefined && !decoded.immFlag) {
      sr2Val = this.regFile.readPortB(decoded.sr2);
    }

    // 4. Trace hardware events
    const busGatesSummary = `GateALU=${control.GateALU ? 1 : 0}, GateMDR=${control.GateMDR ? 1 : 0}, LD_REG=${control.LD_REG ? 1 : 0}, LD_CC=${control.LD_CC ? 1 : 0}`;
    const hardwareEvents = [
      `[ID Stage]  Control Unit: RegWrite=${control.RegWrite ? 1 : 0}, ALUSrc=${control.ALUSrc}, MemRead=${control.MemRead ? 1 : 0}, MemWrite=${control.MemWrite ? 1 : 0}, ALUOp=${control.ALUOp}`,
      `[ID Stage]  Control Unit Bus Gates: ${busGatesSummary}`,
    ];

    if (decoded.opcode === OPCODE.ADD) {
      hardwareEvents.push(`[ID Stage]  Register File (GPR): Read Port A <= R${decoded.sr1} (${sr1Val})`);
      if (decoded.immFlag) {
        const immStr = decoded.imm5 >= 0 ? `+${decoded.imm5}` : `${decoded.imm5}`;
        hardwareEvents.push(`[ID Stage]  Sign-Extension Unit (SEXT5): Imm5 <= ${immStr}`);
      } else {
        hardwareEvents.push(`[ID Stage]  Register File (GPR): Read Port B <= R${decoded.sr2} (${sr2Val})`);
      }
    } else if (decoded.opcode === OPCODE.LD) {
      const offsetStr = decoded.pcOffset9 >= 0 ? `+${decoded.pcOffset9}` : `${decoded.pcOffset9}`;
      hardwareEvents.push(`[ID Stage]  Sign-Extension Unit (SEXT9): PCoffset9 <= ${offsetStr}`);
    }

    const idPacket = {
      stage: 'ID',
      pc: currentPc,
      nextPc,
      rawInstruction,
      decoded,
      control,
      sr1Val,
      sr2Val,
      hardwareEvents,
    };

    this.stageRegisters.ID = idPacket;
    return idPacket;
  }

  /**
   * PHASE 3: EXECUTION & EFFECTIVE ADDRESS CALCULATION (EX)
   *
   * Hardware operations:
   * 1. ALUSrc Multiplexer selects ALU operand B:
   *    - For ADD Register Mode: selects Register File Port B.
   *    - For ADD Immediate Mode: selects SEXT5 immediate.
   * 2. Arithmetic Logic Unit (ALU):
   *    - Computes 16-bit operation (ADD).
   *    - For LD: Address Adder calculates Effective Address = PC + SEXT9(pcOffset9).
   * 3. Computes result condition flags (Negative, Zero, Positive).
   *
   * @param {object} [idStage] - Previous ID stage packet
   * @returns {object} EX Stage pipeline packet
   */
  phaseExecute(idStage = this.stageRegisters.ID) {
    const { decoded, control, sr1Val, sr2Val, nextPc } = idStage;
    const hardwareEvents = [];

    let aluInputA = 0;
    let aluInputB = 0;
    let aluOutput = null;
    let effectiveAddress = null;

    if (decoded.opcode === OPCODE.ADD) {
      aluInputA = sr1Val;
      aluInputB = control.ALUSrc === 'IMM' ? decoded.imm5 : sr2Val;
      aluOutput = ALU.compute(aluInputA, aluInputB, control.ALUOp);

      const immStr = decoded.imm5 >= 0 ? `+${decoded.imm5}` : `${decoded.imm5}`;
      const aluSrcDesc = decoded.immFlag
        ? `ALUSrc MUX <= SEXT5 Imm5 (${immStr})`
        : `ALUSrc MUX <= RegFile Port B (R${decoded.sr2} = ${sr2Val})`;

      hardwareEvents.push(`[EX Stage]  ${aluSrcDesc}`);
      hardwareEvents.push(
        `[EX Stage]  ALU Execution: ${sr1Val} ${control.ALUOp} ${aluInputB} = ${aluOutput.result} (Flags: N=${aluOutput.flags.negative ? 1 : 0}, Z=${aluOutput.flags.zero ? 1 : 0}, P=${aluOutput.flags.positive ? 1 : 0})`
      );
    } else if (decoded.opcode === OPCODE.LD) {
      // Address calculation using ALU / Address Adder: PC (after fetch) + pcOffset9
      aluInputA = nextPc;
      aluInputB = decoded.pcOffset9;
      aluOutput = ALU.compute(aluInputA, aluInputB, control.ALUOp);
      effectiveAddress = aluOutput.result;

      const offsetStr = decoded.pcOffset9 >= 0 ? `+${decoded.pcOffset9}` : `${decoded.pcOffset9}`;
      hardwareEvents.push(
        `[EX Stage]  Address Adder: PC (${nextPc}) + Offset (${offsetStr}) -> Effective Address: ${effectiveAddress}`
      );
    }

    const exPacket = {
      ...idStage,
      stage: 'EX',
      aluInputA,
      aluInputB,
      aluOutput,
      effectiveAddress,
      hardwareEvents,
    };

    this.stageRegisters.EX = exPacket;
    return exPacket;
  }

  /**
   * PHASE 4: MEMORY ACCESS (MEM)
   *
   * Central Internal Bus Flow:
   * 1. If MemRead is asserted (e.g. LD):
   *    - GateMARMUX = 1 -> Central Bus <= Effective Address.
   *    - LD_MAR = 1     -> MAR <= Central Bus.
   *    - External MemoryBusInterface performs read cycle -> MDR <= RAM[MAR].
   * 2. If neither (e.g. ADD):
   *    - External Memory Bus remains IDLE.
   *
   * @param {object} [exStage] - Previous EX stage packet
   * @returns {object} MEM Stage pipeline packet
   */
  phaseMemory(exStage = this.stageRegisters.EX) {
    const { control, effectiveAddress } = exStage;
    const hardwareEvents = [];
    let loadedValue = null;

    if (control.MemRead) {
      // 1. GateMARMUX: Address Adder drives Central Internal Bus
      this.internalBus.drive('MARMUX', effectiveAddress);

      // 2. LD_MAR: MAR latches from Central Internal Bus
      this.latches.latchMAR(this.internalBus.read());
      hardwareEvents.push(
        `[MEM Stage] Central Internal Bus: GateMARMUX=1 -> BUS <= ${effectiveAddress} -> LD_MAR=1 -> MAR <= BUS (${effectiveAddress})`
      );

      // 3. External Memory Bus Interface read cycle: RAM[MAR] -> Data Bus -> MDR
      loadedValue = this.bus.readCycle(this.latches, true);
      hardwareEvents.push(
        `[MEM Stage] Memory Bus Interface: Read Cycle active (MemRead: ENABLED) -> Data Bus <= ${loadedValue} -> MDR <= ${loadedValue}`
      );
    } else if (control.MemWrite) {
      this.internalBus.drive('MARMUX', effectiveAddress);
      this.latches.latchMAR(this.internalBus.read());
      hardwareEvents.push(
        `[MEM Stage] Central Internal Bus: GateMARMUX=1 -> BUS <= ${effectiveAddress} -> LD_MAR=1 -> MAR <= BUS (${effectiveAddress})`
      );
      this.bus.writeCycle(this.latches, true);
      hardwareEvents.push(
        `[MEM Stage] Memory Bus Interface: Write Cycle active (MemWrite: ENABLED) -> MDR <= ${this.latches.MDR} -> RAM[${effectiveAddress}]`
      );
    } else {
      // Memory Bus is idle for non-memory instructions (e.g. ADD)
      this.bus.readCycle(this.latches, false);
      hardwareEvents.push(
        `[MEM Stage] Memory Bus Interface: IDLE (MemRead=0, MemWrite=0; Address and Data buses inactive)`
      );
    }

    const memPacket = {
      ...exStage,
      stage: 'MEM',
      loadedValue,
      hardwareEvents,
    };

    this.stageRegisters.MEM = memPacket;
    return memPacket;
  }

  /**
   * PHASE 5: WRITE-BACK & STATUS UPDATE (WB)
   *
   * Central Internal Bus Flow:
   * 1. Source drives Central Internal Bus:
   *    - If GateMDR = 1 (LD)  : Central Bus <= MDR.
   *    - If GateALU = 1 (ADD) : Central Bus <= ALU_Out.
   * 2. Destination latches from Central Internal Bus:
   *    - LD_REG = 1 : RegisterFile[DR] <= Central Bus.
   *    - LD_CC  = 1 : PSR <= EvaluateFlags(Central Bus).
   *
   * @param {object} [memStage] - Previous MEM stage packet
   * @returns {object} WB Stage pipeline packet
   */
  phaseWriteBack(memStage = this.stageRegisters.MEM) {
    const { control, decoded, aluOutput } = memStage;
    const hardwareEvents = [];

    // 1. Tri-State Gating onto Central Internal Bus
    let writeData = 0;
    if (control.GateMDR) {
      // MDR drives Central Internal Bus
      writeData = this.internalBus.drive('MDR', this.latches.MDR);
      hardwareEvents.push(
        `[WB Stage]  Central Internal Bus: GateMDR=1 -> BUS <= MDR (${writeData})`
      );
    } else if (control.GateALU) {
      // ALU Output drives Central Internal Bus
      writeData = this.internalBus.drive('ALU', aluOutput.result);
      hardwareEvents.push(
        `[WB Stage]  Central Internal Bus: GateALU=1 -> BUS <= ALU_Out (${writeData})`
      );
    } else {
      writeData = control.MemToReg ? this.latches.MDR : (aluOutput ? aluOutput.result : 0);
      this.internalBus.drive('ALU', writeData);
    }

    // 2. Gated Register File Write from Central Internal Bus
    const writeRecord = this.regFile.write(decoded.dr, writeData, control.LD_REG || control.RegWrite);
    hardwareEvents.push(
      `[WB Stage]  Register File (GPR): Write Port R${decoded.dr} <= BUS (${writeData}) (LD_REG: ${control.LD_REG ? 'ENABLED' : 'DISABLED'})`
    );

    // 3. Condition Codes / Status Register update from Central Internal Bus
    if (control.LD_CC || control.SetCC) {
      const flags = control.GateMDR ? ALU.evaluateFlags(writeData) : aluOutput.flags;
      this.latches.latchPSR(flags.psrFlag);
      hardwareEvents.push(
        `[WB Stage]  PSR Latch <= 0b${this.latches.PSR.toString(2).padStart(3, '0')} (LD_CC: ENABLED, updated from BUS value ${writeData})`
      );
    }

    const wbPacket = {
      ...memStage,
      stage: 'WB',
      writeData,
      writeRecord,
      hardwareEvents,
    };

    this.stageRegisters.WB = wbPacket;
    return wbPacket;
  }

  /**
   * Orchestrates the sequential execution of all 5 distinct phases for a single instruction:
   *   1. phaseFetch()
   *   2. phaseDecode()
   *   3. phaseExecute()
   *   4. phaseMemory()
   *   5. phaseWriteBack()
   *
   * @returns {object} Aggregated execution and stage pipeline metadata
   */
  step() {
    // 1. FETCH
    const ifStage = this.phaseFetch();

    // 2. DECODE
    const idStage = this.phaseDecode(ifStage);

    // 3. EXECUTE
    const exStage = this.phaseExecute(idStage);

    // 4. MEMORY
    const memStage = this.phaseMemory(exStage);

    // 5. WRITE-BACK
    const wbStage = this.phaseWriteBack(memStage);

    // Group all hardware events in sequential order
    const allHardwareEvents = [
      ...ifStage.hardwareEvents,
      ...idStage.hardwareEvents,
      ...exStage.hardwareEvents,
      ...memStage.hardwareEvents,
      ...wbStage.hardwareEvents,
    ];

    const mode = idStage.decoded.immFlag ? 'IMMEDIATE' : 'REGISTER';
    const execution = {
      mode,
      dr: idStage.decoded.dr,
      sr1: idStage.decoded.sr1,
      sr1Val: idStage.sr1Val,
      sr2: idStage.decoded.sr2,
      sr2Val: idStage.sr2Val,
      imm5: idStage.decoded.imm5,
      pcOffset9: idStage.decoded.pcOffset9,
      effectiveAddress: exStage.effectiveAddress,
      loadedValue: memStage.loadedValue,
      result: exStage.aluOutput ? exStage.aluOutput.result : wbStage.writeData,
      controlSignals: idStage.control,
      aluOutput: exStage.aluOutput,
      writeRecord: wbStage.writeRecord,
      hardwareEvents: [
        ...idStage.hardwareEvents,
        ...exStage.hardwareEvents,
        ...memStage.hardwareEvents,
        ...wbStage.hardwareEvents,
      ],
      allHardwareEvents,
    };

    return {
      pc: ifStage.pc,
      instruction: ifStage.rawInstruction,
      decoded: idStage.decoded,
      controlSignals: idStage.control,
      execution,
      stages: {
        IF: ifStage,
        ID: idStage,
        EX: exStage,
        MEM: memStage,
        WB: wbStage,
      },
      internalBus: this.internalBus.lastTransaction,
    };
  }

  /**
   * Alias for step() - executes one instruction across all 5 phases.
   */
  executeInstruction() {
    return this.step();
  }
}
