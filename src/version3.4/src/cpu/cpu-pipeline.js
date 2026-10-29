import { ADDR_MAX, OPCODE } from '../constants.js';
import { InstructionDecoder } from './instruction-decoder.js';
import { ControlUnit } from './control-unit.js';
import { ALU } from './alu.js';
import { InternalBus } from './internal-bus.js';
import { MicroSequencer, CONTROL_STORE_ROM, COND } from './micro-sequencer.js';

/**
 * CPU Pipeline & Microcoded FSM Engine - Version 3.2
 *
 * Micro-architectural multi-cycle CPU engine driven by:
 *   - MicroSequencer: Maintains Micro-Program Counter (uPC) and evaluates micro-branching.
 *   - ControlStoreROM: Authentic LC-3 microcode state machine ROM.
 *   - ClockGenerator: Physical quartz oscillator pulsing discrete clock cycles.
 *   - InternalBus: 16-bit Central Internal Datapath Bus with tri-state gating.
 *
 * Micro-State Sequence (LC-3 Standard):
 *   - State 18: FETCH-1 (GatePC -> BUS -> MAR, MemRead=1)
 *   - State 33: FETCH-2 (External Memory Bus read completes -> MDR)
 *   - State 35: FETCH-3 (GateMDR -> BUS -> IR, PC increment)
 *   - State 32: DECODE  (IR decode, RegFile read, SEXT, micro-branch on opcode)
 *   - State 1 : ADD Execution & WB (ALU add -> GateALU -> RegFile[DR], LD_CC -> Return to State 18) [5 cycles]
 *   - State 2 : LD Address Calc (Address Adder -> GateMARMUX -> MAR, MemRead=1 -> Next State 25)
 *   - State 25: LD Memory Read & WB (RAM -> MDR -> GateMDR -> RegFile[DR], LD_CC -> Return to State 18) [6 cycles]
 */
export class CpuPipeline {
  /**
   * @param {object} vm - Virtual Machine instance containing latches, regFile, bus, and clock
   */
  constructor(vm) {
    this.vm = vm;
    this.latches = vm.latches;
    this.regFile = vm.regFile;
    this.bus = vm.bus;
    this.clock = vm.clock;
    this.internalBus = new InternalBus();
    this.microSequencer = new MicroSequencer();

    // In-flight instruction micro-state
    this.currentInstruction = this._createEmptyInstructionState();
  }

  _createEmptyInstructionState() {
    return {
      fetchPc: 0,
      rawInstruction: 0,
      nextPc: 0,
      decoded: null,
      control: null,
      sr1Val: 0,
      sr2Val: 0,
      aluOutput: null,
      effectiveAddress: null,
      loadedValue: null,
      writeRecord: null,
      hardwareEvents: [],
      cycleRecords: [],
    };
  }

  /**
   * Resets the pipeline and micro-sequencer.
   */
  reset() {
    this.internalBus.reset();
    this.microSequencer.reset();
    this.currentInstruction = this._createEmptyInstructionState();
  }

  /**
   * Returns current Micro-Program Counter value.
   */
  get uPC() {
    return this.microSequencer.uPC;
  }

  /**
   * Advances the CPU by a single physical clock cycle (Micro-step)
   * executing the micro-instruction at Control Store ROM[uPC].
   *
   * @returns {object|null} Micro-cycle record with event trace and completion status
   */
  tick() {
    if (this.vm.halted) {
      return null;
    }

    // At entry state 18, check if program has reached codeEnd
    if (this.microSequencer.uPC === this.microSequencer.ENTRY_STATE && this.currentInstruction.cycleRecords.length === 0) {
      if (this.vm.codeEnd !== undefined && this.latches.PC >= this.vm.codeEnd) {
        this.vm.halted = true;
        return null;
      }
      this.currentInstruction = this._createEmptyInstructionState();
    }

    const clockResult = this.clock.tick();
    const cycleNum = clockResult.cycle;
    const currentUPC = this.microSequencer.uPC;
    const microInst = this.microSequencer.currentMicroInstruction;
    const cycleEvents = [];
    let instructionComplete = false;
    let finishedInstructionData = null;

    switch (currentUPC) {
      // -------------------------------------------------------------
      // STATE 18: FETCH-1 (GatePC -> BUS -> MAR, MemRead=1)
      // -------------------------------------------------------------
      case 18: {
        const fetchPc = this.latches.PC;
        this.currentInstruction.fetchPc = fetchPc;

        // GatePC: Drive PC onto Central Internal Bus using 3-bit Gate Code (0b001)
        this.internalBus.driveWithGate(microInst.gateCode, fetchPc);

        // LD_MAR=1: MAR latches from Central Bus
        this.latches.latchMAR(this.internalBus.read());

        // Address Decoder monitors MAR on 16-bit System Address Bus
        const decodeInfo = this.bus.addressDecoder.decode(fetchPc);

        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 18 (${microInst.name})] Central Bus: GateCode=0b001 (GatePC=1) -> BUS <= PC (${fetchPc})`,
          `[Clock ${cycleNum} | uPC: 18 (${microInst.name})] Central Bus: LD_MAR=1 -> MAR <= BUS (${fetchPc})`,
          `[Clock ${cycleNum} | uPC: 18 (${microInst.name})] System Address Bus (16-bit): Lines = 0x${fetchPc.toString(16).padStart(4, '0').toUpperCase()}`,
          `[Clock ${cycleNum} | uPC: 18 (${microInst.name})] Address Decoder: ${decodeInfo.description} -> Assert ${decodeInfo.ramChipSelect ? 'RAM_CS=1' : 'IO_CS=1'}`,
          `[Clock ${cycleNum} | uPC: 18 (${microInst.name})] System Control Bus: Strobe MEM_READ=1 (1-bit control wire)`
        );

        this.microSequencer.step();
        break;
      }

      // -------------------------------------------------------------
      // STATE 33: FETCH-2 (External Memory Bus read completes -> MDR)
      // -------------------------------------------------------------
      case 33: {
        const rawInstruction = this.bus.readCycle(this.latches, 1);
        this.currentInstruction.rawInstruction = rawInstruction;
        const lastTx = this.bus.lastTransaction;

        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 33 (${microInst.name})] System Data Bus (16-bit): Lines <= ${lastTx.dataBusDesc} -> LD_MDR=1 -> MDR <= 0x${rawInstruction.toString(16).padStart(4, '0').toUpperCase()}`,
          `[Clock ${cycleNum} | uPC: 33 (${microInst.name})] System Control Bus: MEM_READY=1 detected -> Read strobe cleared`
        );

        this.microSequencer.step();
        break;
      }

      // -------------------------------------------------------------
      // STATE 35: FETCH-3 (GateMDR -> BUS -> IR, PC increment)
      // -------------------------------------------------------------
      case 35: {
        // GateMDR: Drive MDR onto Central Internal Bus using 3-bit Gate Code (0b010)
        this.internalBus.driveWithGate(microInst.gateCode, this.currentInstruction.rawInstruction);

        // LD_IR=1: IR latches from Central Internal Bus
        this.latches.latchIR(this.internalBus.read());

        // Increment PC (LD_PC=1)
        const nextPc = (this.currentInstruction.fetchPc + 1) & ADDR_MAX;
        this.currentInstruction.nextPc = nextPc;
        this.latches.latchPC(nextPc);

        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 35 (${microInst.name})] Central Bus: GateCode=0b010 (GateMDR=1) -> BUS <= MDR (0x${this.currentInstruction.rawInstruction.toString(16).padStart(4, '0').toUpperCase()})`,
          `[Clock ${cycleNum} | uPC: 35 (${microInst.name})] Central Bus: LD_IR=1 -> IR <= BUS (Instruction word latched)`,
          `[Clock ${cycleNum} | uPC: 35 (${microInst.name})] Central Bus: LD_PC=1 -> PC <= ${nextPc} (Incremented PC)`
        );

        this.microSequencer.step();
        break;
      }

      // -------------------------------------------------------------
      // STATE 32: DECODE (Unpack IR, Read RegFile, Micro-Branch on Opcode)
      // -------------------------------------------------------------
      case 32: {
        const decoded = InstructionDecoder.decode(this.currentInstruction.rawInstruction);
        const control = ControlUnit.generateSignals(decoded);
        this.currentInstruction.decoded = decoded;
        this.currentInstruction.control = control;

        let sr1Val = 0;
        let sr2Val = 0;

        if (decoded.sr1 !== undefined) {
          sr1Val = this.regFile.readPortA(decoded.sr1);
        }
        if (decoded.sr2 !== undefined && !decoded.immFlag) {
          sr2Val = this.regFile.readPortB(decoded.sr2);
        }
        this.currentInstruction.sr1Val = sr1Val;
        this.currentInstruction.sr2Val = sr2Val;

        const nextUPC = this.microSequencer.computeNextState(decoded.opcode);

        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 32 (${microInst.name})] Micro-Sequencer: COND=BRANCH_OPCODE (Opcode 0b${decoded.opcode.toString(2).padStart(4, '0')}) -> Next uPC = State ${nextUPC}`,
          `[Clock ${cycleNum} | uPC: 32 (${microInst.name})] Control Unit: RegWrite=${control.RegWrite ? 1 : 0}, ALUSrc=${control.ALUSrc}, MemRead=${control.MemRead ? 1 : 0}, ALUOp=${control.ALUOp}`
        );

        if (decoded.opcode === OPCODE.ADD) {
          cycleEvents.push(
            `[Clock ${cycleNum} | uPC: 32 (${microInst.name})] Register File (GPR): Read Port A <= R${decoded.sr1} (${sr1Val})`
          );
          if (decoded.immFlag) {
            const immStr = decoded.imm5 >= 0 ? `+${decoded.imm5}` : `${decoded.imm5}`;
            cycleEvents.push(
              `[Clock ${cycleNum} | uPC: 32 (${microInst.name})] Sign-Extension Unit (SEXT5): Imm5 <= ${immStr}`
            );
          } else {
            cycleEvents.push(
              `[Clock ${cycleNum} | uPC: 32 (${microInst.name})] Register File (GPR): Read Port B <= R${decoded.sr2} (${sr2Val})`
            );
          }
        } else if (decoded.opcode === OPCODE.LD) {
          const offsetStr = decoded.pcOffset9 >= 0 ? `+${decoded.pcOffset9}` : `${decoded.pcOffset9}`;
          cycleEvents.push(
            `[Clock ${cycleNum} | uPC: 32 (${microInst.name})] Sign-Extension Unit (SEXT9): PCoffset9 <= ${offsetStr}`
          );
        }

        this.microSequencer.step({ opcode: decoded.opcode });
        break;
      }

      // -------------------------------------------------------------
      // STATE 1: ADD EXECUTION & WRITE-BACK (ALU -> Central Bus -> RegFile[DR], LD_CC)
      // -------------------------------------------------------------
      case 1: {
        const { decoded, control, sr1Val, sr2Val } = this.currentInstruction;
        const aluInputA = sr1Val;
        const aluInputB = control.ALUSrc === 'IMM' ? decoded.imm5 : sr2Val;
        const aluOutput = ALU.compute(aluInputA, aluInputB, control.ALUOp);
        this.currentInstruction.aluOutput = aluOutput;

        const immStr = decoded.imm5 >= 0 ? `+${decoded.imm5}` : `${decoded.imm5}`;
        const aluSrcDesc = decoded.immFlag
          ? `ALUSrc MUX <= SEXT5 Imm5 (${immStr})`
          : `ALUSrc MUX <= RegFile Port B (R${decoded.sr2} = ${sr2Val})`;

        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 1 (${microInst.name})] ${aluSrcDesc}`,
          `[Clock ${cycleNum} | uPC: 1 (${microInst.name})] ALU Execution: ${sr1Val} ${control.ALUOp} ${aluInputB} = ${aluOutput.result} (Flags: N=${aluOutput.flags.negative ? 1 : 0}, Z=${aluOutput.flags.zero ? 1 : 0}, P=${aluOutput.flags.positive ? 1 : 0})`,
          `[Clock ${cycleNum} | uPC: 1 (${microInst.name})] External Memory Bus: IDLE (MemRead=0, MemWrite=0)`
        );

        // GateALU: Drive ALU output onto Central Internal Bus using 3-bit Gate Code (0b011)
        const writeData = this.internalBus.driveWithGate(microInst.gateCode, aluOutput.result);
        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 1 (${microInst.name})] Central Bus: GateCode=0b011 (GateALU=1) -> BUS <= ALU_Out (${writeData})`
        );

        // LD_REG=1: Register File captures bus into DR
        const writeRecord = this.regFile.write(decoded.dr, writeData, true);
        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 1 (${microInst.name})] Central Bus: LD_REG=1 -> RegFile Write Port R${decoded.dr} <= BUS (${writeData})`
        );

        // LD_CC=1: PSR captures condition codes
        this.latches.latchPSR(aluOutput.flags.psrFlag);
        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 1 (${microInst.name})] Central Bus: LD_CC=1 -> PSR Latch <= 0b${this.latches.PSR.toString(2).padStart(3, '0')}`
        );

        this.currentInstruction.writeRecord = writeRecord;
        instructionComplete = true;
        this.microSequencer.step(); // Returns to State 18
        break;
      }

      // -------------------------------------------------------------
      // STATE 2: LD ADDRESS CALCULATION & MAR LATCH (Address Adder -> MAR, MemRead=1)
      // -------------------------------------------------------------
      case 2: {
        const { decoded, control, nextPc } = this.currentInstruction;
        const aluInputA = nextPc;
        const aluInputB = decoded.pcOffset9;
        const aluOutput = ALU.compute(aluInputA, aluInputB, control.ALUOp);
        const effectiveAddress = aluOutput.result;
        this.currentInstruction.effectiveAddress = effectiveAddress;

        const offsetStr = decoded.pcOffset9 >= 0 ? `+${decoded.pcOffset9}` : `${decoded.pcOffset9}`;
        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 2 (${microInst.name})] Address Adder: PC (${nextPc}) + Offset (${offsetStr}) -> Effective Address: ${effectiveAddress}`
        );

        // GateMARMUX: Drive Effective Address onto Central Internal Bus using 3-bit Gate Code (0b100)
        this.internalBus.driveWithGate(microInst.gateCode, effectiveAddress);

        // LD_MAR=1: MAR latches from Central Internal Bus
        this.latches.latchMAR(this.internalBus.read());
        const decodeInfo = this.bus.addressDecoder.decode(effectiveAddress);

        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 2 (${microInst.name})] Central Bus: GateCode=0b100 (GateMARMUX=1) -> BUS <= ${effectiveAddress}`,
          `[Clock ${cycleNum} | uPC: 2 (${microInst.name})] Central Bus: LD_MAR=1 -> MAR <= BUS (${effectiveAddress})`,
          `[Clock ${cycleNum} | uPC: 2 (${microInst.name})] System Address Bus (16-bit): Lines = 0x${effectiveAddress.toString(16).padStart(4, '0').toUpperCase()}`,
          `[Clock ${cycleNum} | uPC: 2 (${microInst.name})] Address Decoder: ${decodeInfo.description} -> Assert ${decodeInfo.ramChipSelect ? 'RAM_CS=1' : 'IO_CS=1'}`,
          `[Clock ${cycleNum} | uPC: 2 (${microInst.name})] System Control Bus: Strobe MEM_READ=1 for address ${effectiveAddress}`
        );

        this.microSequencer.step(); // Advances to State 25
        break;
      }

      // -------------------------------------------------------------
      // STATE 25: LD MEMORY READ & WRITE-BACK (RAM/MMIO -> MDR -> Central Bus -> RegFile[DR], LD_CC)
      // -------------------------------------------------------------
      case 25: {
        const { decoded } = this.currentInstruction;

        // External Memory Bus read cycle completes across Address, Data, and Control Buses
        const loadedValue = this.bus.readCycle(this.latches, 1);
        this.currentInstruction.loadedValue = loadedValue;
        const lastTx = this.bus.lastTransaction;

        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 25 (${microInst.name})] System Data Bus (16-bit): Lines <= ${lastTx.dataBusDesc} -> LD_MDR=1 -> MDR <= ${loadedValue}`,
          `[Clock ${cycleNum} | uPC: 25 (${microInst.name})] System Control Bus: MEM_READY=1 detected -> Read strobe cleared`
        );

        // GateMDR: MDR drives Central Internal Bus using 3-bit Gate Code (0b010)
        const writeData = this.internalBus.driveWithGate(microInst.gateCode, loadedValue);
        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 25 (${microInst.name})] Central Bus: GateCode=0b010 (GateMDR=1) -> BUS <= MDR (${writeData})`
        );

        // LD_REG=1: Register File captures from Central Bus
        const writeRecord = this.regFile.write(decoded.dr, writeData, true);
        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 25 (${microInst.name})] Central Bus: LD_REG=1 -> RegFile Write Port R${decoded.dr} <= BUS (${writeData})`
        );

        // LD_CC=1: PSR captures condition codes
        const flags = ALU.evaluateFlags(writeData);
        this.latches.latchPSR(flags.psrFlag);
        cycleEvents.push(
          `[Clock ${cycleNum} | uPC: 25 (${microInst.name})] Central Bus: LD_CC=1 -> PSR Latch <= 0b${this.latches.PSR.toString(2).padStart(3, '0')}`
        );

        this.currentInstruction.writeRecord = writeRecord;
        instructionComplete = true;
        this.microSequencer.step(); // Returns to State 18
        break;
      }
    }

    this.currentInstruction.hardwareEvents.push(...cycleEvents);
    const cycleRecord = {
      cycle: cycleNum,
      uPC: currentUPC,
      microOp: microInst.name,
      instructionComplete,
      events: cycleEvents,
      busState: this.internalBus.describeState(),
      latches: this.latches.snapshot(),
      regFile: this.regFile.snapshot(),
    };
    this.currentInstruction.cycleRecords.push(cycleRecord);

    if (instructionComplete) {
      finishedInstructionData = this._buildFinishedInstructionData();
      this.currentInstruction = this._createEmptyInstructionState();
    }

    return {
      cycle: cycleNum,
      uPC: currentUPC,
      microOp: microInst.name,
      instructionComplete,
      events: cycleEvents,
      cycleRecord,
      finishedInstructionData,
    };
  }

  _buildFinishedInstructionData() {
    const inst = this.currentInstruction;
    const mode = inst.decoded.immFlag ? 'IMMEDIATE' : 'REGISTER';
    const writeData = inst.control.GateMDR ? inst.loadedValue : (inst.aluOutput ? inst.aluOutput.result : 0);

    const execution = {
      mode,
      dr: inst.decoded.dr,
      sr1: inst.decoded.sr1,
      sr1Val: inst.sr1Val,
      sr2: inst.decoded.sr2,
      sr2Val: inst.sr2Val,
      imm5: inst.decoded.imm5,
      pcOffset9: inst.decoded.pcOffset9,
      effectiveAddress: inst.effectiveAddress,
      loadedValue: inst.loadedValue,
      result: inst.aluOutput ? inst.aluOutput.result : writeData,
      controlSignals: inst.control,
      aluOutput: inst.aluOutput,
      writeRecord: inst.writeRecord || null,
      hardwareEvents: inst.hardwareEvents,
      allHardwareEvents: inst.hardwareEvents,
      cycleRecords: inst.cycleRecords,
      cyclesTaken: inst.cycleRecords.length,
    };

    return {
      pc: inst.fetchPc,
      instruction: inst.rawInstruction,
      decoded: inst.decoded,
      controlSignals: inst.control,
      execution,
      internalBus: this.internalBus.lastTransaction,
      cyclesTaken: inst.cycleRecords.length,
      microCycles: inst.cycleRecords,
    };
  }

  /**
   * Macro-step: Executes multiple clock ticks until the current instruction finishes.
   *
   * @returns {object|null} Completed instruction execution details
   */
  step() {
    if (this.vm.halted) {
      return null;
    }

    let tickResult = null;
    do {
      tickResult = this.tick();
      if (!tickResult) break;
    } while (!tickResult.instructionComplete && !this.vm.halted);

    if (!tickResult || !tickResult.finishedInstructionData) {
      return null;
    }

    return tickResult.finishedInstructionData;
  }



}
