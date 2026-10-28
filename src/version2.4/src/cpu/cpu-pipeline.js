import { ADDR_MAX, OPCODE } from '../constants.js';
import { InstructionDecoder } from './instruction-decoder.js';
import { ControlUnit } from './control-unit.js';
import { ALU } from './alu.js';

/**
 * CPU Pipeline - Version 2.4
 *
 * Orchestrates the sequential execution of the 5 distinct micro-architectural phases:
 *   1. phaseFetch()     (IF)  - Memory read cycle via MAR/MDR, IR latched, PC incremented.
 *   2. phaseDecode()    (ID)  - Opcode decode, Control Unit signals assertion, Register File dual-port read, sign-extension.
 *   3. phaseExecute()   (EX)  - ALUSrc MUX operand selection, ALU arithmetic computation, address addition, flag calculation.
 *   4. phaseMemory()    (MEM) - MemoryBusInterface transaction strictly gated by MemRead/MemWrite via MAR and MDR.
 *   5. phaseWriteBack() (WB)  - MemToReg MUX destination data routing, Register File gated write, PSR status update.
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

    // Pipeline Inter-Stage Registers (storing state across phase transitions)
    this.stageRegisters = {
      IF: null,
      ID: null,
      EX: null,
      MEM: null,
      WB: null,
    };
  }

  /**
   * Resets inter-stage pipeline registers.
   */
  reset() {
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
   * Hardware operations:
   * 1. Drives Address Bus with current PC: MAR <= PC.
   * 2. Asserts MemRead on Control Bus, triggering a Memory Bus read cycle.
   * 3. Memory places instruction on Data Bus; latched into MDR.
   * 4. Instruction word latched from MDR into Instruction Register (IR).
   * 5. Increments Program Counter (PC <= (PC + 1) & 0xFFFF).
   *
   * @returns {object} IF Stage pipeline packet
   */
  phaseFetch() {
    const fetchPc = this.latches.PC;

    // 1. MAR latches current PC (drives Address Bus)
    this.latches.latchMAR(fetchPc);

    // 2. Memory Bus Interface read cycle: RAM[MAR] -> Data Bus -> MDR
    // Active control line: MemRead = true
    const rawInstruction = this.bus.readCycle(this.latches, true);

    // 3. IR latches instruction word from MDR
    this.latches.latchIR(rawInstruction);

    // 4. PC is incremented to next instruction address
    const nextPc = (fetchPc + 1) & ADDR_MAX;
    this.latches.latchPC(nextPc);

    const hardwareEvents = [
      `[IF Stage]  Memory Address Register (MAR) <= ${fetchPc} (Driving Address Bus from PC)`,
      `[IF Stage]  Memory Bus Interface: Read Cycle active (MemRead: ENABLED) -> Data Bus <= 0b${rawInstruction.toString(2).padStart(16, '0')} -> MDR <= 0x${rawInstruction.toString(16).padStart(4, '0').toUpperCase()}`,
      `[IF Stage]  Instruction Register (IR) <= MDR (Instruction word latched into IR)`,
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
   * 1. Decodes 16-bit instruction word from IR into bitfields (opcode, dr, sr1, sr2, immFlag, imm5, pcOffset9).
   * 2. Control Unit asserts control lines (RegWrite, ALUSrc, MemRead, MemWrite, MemToReg, ALUOp, SetCC).
   * 3. Dual-port Register File read:
   *    - Port A reads SR1 (or DR if needed).
   *    - Port B reads SR2 (if register mode).
   * 4. Sign-Extension Unit (SEXT) extends 5-bit or 9-bit immediate values.
   *
   * @param {object} [ifStage] - Previous IF stage packet (defaults to this.stageRegisters.IF)
   * @returns {object} ID Stage pipeline packet
   */
  phaseDecode(ifStage = this.stageRegisters.IF) {
    const rawInstruction = ifStage ? ifStage.rawInstruction : this.latches.IR;
    const currentPc = ifStage ? ifStage.pc : this.latches.PC;
    const nextPc = ifStage ? ifStage.nextPc : (this.latches.PC + 1) & ADDR_MAX;

    // 1. Decode instruction fields
    const decoded = InstructionDecoder.decode(rawInstruction);

    // 2. Control Unit evaluates opcode & mode to emit control wire signals
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
    const hardwareEvents = [
      `[ID Stage]  Control Unit: RegWrite=${control.RegWrite ? 1 : 0}, ALUSrc=${control.ALUSrc}, MemRead=${control.MemRead ? 1 : 0}, MemWrite=${control.MemWrite ? 1 : 0}, MemToReg=${control.MemToReg ? 1 : 0}, ALUOp=${control.ALUOp}`,
    ];

    if (decoded.opcode === OPCODE.ADD) {
      hardwareEvents.push(`[ID Stage]  Register File: Read Port A <= R${decoded.sr1} (${sr1Val})`);
      if (decoded.immFlag) {
        const immStr = decoded.imm5 >= 0 ? `+${decoded.imm5}` : `${decoded.imm5}`;
        hardwareEvents.push(`[ID Stage]  Sign-Extension Unit (SEXT5): Imm5 <= ${immStr}`);
      } else {
        hardwareEvents.push(`[ID Stage]  Register File: Read Port B <= R${decoded.sr2} (${sr2Val})`);
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
   * @param {object} [idStage] - Previous ID stage packet (defaults to this.stageRegisters.ID)
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
      // Address calculation using ALU: PC (after fetch) + pcOffset9
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
   * Hardware operations:
   * 1. If MemRead is asserted (e.g. LD):
   *    - Drives Address Bus: MAR <= Effective Address.
   *    - MemoryBusInterface performs read cycle: RAM[MAR] -> Data Bus -> MDR.
   * 2. If MemWrite is asserted (e.g. ST):
   *    - Drives Address Bus: MAR <= Effective Address.
   *    - MemoryBusInterface performs write cycle: MDR -> Data Bus -> RAM[MAR].
   * 3. If neither (e.g. ADD):
   *    - Memory bus remains IDLE (MemRead=0, MemWrite=0).
   *
   * @param {object} [exStage] - Previous EX stage packet (defaults to this.stageRegisters.EX)
   * @returns {object} MEM Stage pipeline packet
   */
  phaseMemory(exStage = this.stageRegisters.EX) {
    const { control, effectiveAddress } = exStage;
    const hardwareEvents = [];
    let loadedValue = null;

    if (control.MemRead) {
      // 1. MAR latches effective memory address
      this.latches.latchMAR(effectiveAddress);
      hardwareEvents.push(
        `[MEM Stage] Memory Address Register (MAR) <= ${effectiveAddress} (Driving Address Bus)`
      );

      // 2. Memory Bus Interface mediates access strictly via MAR and MDR
      loadedValue = this.bus.readCycle(this.latches, true);
      hardwareEvents.push(
        `[MEM Stage] Memory Bus Interface: Read Cycle active (MemRead: ENABLED) -> Data Bus <= ${loadedValue} -> MDR <= ${loadedValue}`
      );
    } else if (control.MemWrite) {
      this.latches.latchMAR(effectiveAddress);
      hardwareEvents.push(
        `[MEM Stage] Memory Address Register (MAR) <= ${effectiveAddress} (Driving Address Bus)`
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
   * Hardware operations:
   * 1. MemToReg Multiplexer selects register write source:
   *    - If MemToReg == 1: selects MDR (loaded value from memory).
   *    - If MemToReg == 0: selects ALU_Out (computed arithmetic result).
   * 2. Register File Write:
   *    - If RegWrite is asserted: routes writeData to Register File write port for DR.
   * 3. Processor Status Register (PSR):
   *    - If SetCC is asserted: latches condition flags (N, Z, P) into PSR.
   *
   * @param {object} [memStage] - Previous MEM stage packet (defaults to this.stageRegisters.MEM)
   * @returns {object} WB Stage pipeline packet
   */
  phaseWriteBack(memStage = this.stageRegisters.MEM) {
    const { control, decoded, aluOutput, loadedValue } = memStage;
    const hardwareEvents = [];

    // 1. MemToReg Multiplexer
    const writeData = control.MemToReg ? this.latches.MDR : aluOutput.result;
    hardwareEvents.push(
      `[WB Stage]  MemToReg MUX <= ${control.MemToReg ? `MDR (${writeData})` : `ALU_Out (${writeData})`}`
    );

    // 2. Gated Register File Write
    const writeRecord = this.regFile.write(decoded.dr, writeData, control.RegWrite);
    hardwareEvents.push(
      `[WB Stage]  Register File: Write Port R${decoded.dr} <= ${writeData} (RegWrite: ${control.RegWrite ? 'ENABLED' : 'DISABLED'})`
    );

    // 3. Condition Codes / Status Register update
    if (control.SetCC) {
      if (control.MemToReg) {
        const flags = ALU.evaluateFlags(writeData);
        this.latches.latchPSR(flags.psrFlag);
      } else {
        this.latches.latchPSR(aluOutput.flags.psrFlag);
      }
      hardwareEvents.push(
        `[WB Stage]  PSR Latch <= 0b${this.latches.PSR.toString(2).padStart(3, '0')} (Updated from ${control.MemToReg ? 'loaded value' : 'ALU'} flags)`
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

    // Build execution details object compatible with InstructionDescriber and VM tests
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
    };
  }

  /**
   * Alias for step() - executes one instruction across all 5 phases.
   */
  executeInstruction() {
    return this.step();
  }
}
