import { ADDR_MAX, OPCODE, STAGE, FORWARD_MUX } from '../constants.js';
import { InstructionDecoder } from './instruction-decoder.js';
import { ControlUnit } from './control-unit.js';
import { ALU } from './alu.js';
import { HazardUnit } from './hazard-unit.js';
import { calculateConditionFlag } from '../utils/condition-codes.js';

/**
 * Creates an empty pipeline register.
 *
 * @returns {object} Pipeline register initialized to idle/invalid state
 */
export function createEmptyPipelineRegister() {
  return {
    valid: false,
    isBubble: false,
    bubbleReason: null,
    pc: 0,
    nextPc: 0,
    rawInstruction: 0,
    decoded: null,
    control: null,
    sr1Val: 0,
    sr2Val: 0,
    aluResult: 0,
    effectiveAddress: null,
    writeData: 0,
    memData: null,
    finalValue: null,
    forwardDetails: null,
  };
}

/**
 * CPU Pipeline - Version 3.5
 *
 * True 5-Stage In-Flight Pipelined Datapath:
 *   - IF  (Instruction Fetch): Fetches instruction from RAM/MMIO, updates PC.
 *   - ID  (Instruction Decode): Decodes opcode, reads Register File, evaluates Load-Use hazards.
 *   - EX  (Execute / Address Calc): Evaluates ALU ops, resolves EX/MEM & MEM/WB operand forwarding.
 *   - MEM (Memory Access): Performs Memory Read / Memory Write via System Bus & Address Decoder.
 *   - WB  (Write-Back / Commit): Retires instruction, updates Register File & PSR condition codes.
 *
 * Concurrency:
 *   All 5 pipeline stages operate concurrently on up to 5 in-flight instructions every clock cycle.
 *   Throughput approaches 1.0 Instruction Per Cycle (IPC ≈ 1.0).
 */
export class CpuPipeline {
  /**
   * @param {object} vm - Virtual Machine instance
   */
  constructor(vm) {
    this.vm = vm;
    this.latches = vm.latches;
    this.regFile = vm.regFile;
    this.bus = vm.bus;
    this.clock = vm.clock;

    this.hazardUnit = new HazardUnit();

    // The 4 Inter-Stage Pipeline Registers
    this.IF_ID = createEmptyPipelineRegister();
    this.ID_EX = createEmptyPipelineRegister();
    this.EX_MEM = createEmptyPipelineRegister();
    this.MEM_WB = createEmptyPipelineRegister();

    // Telemetry and Execution Statistics
    this.graduatedInstructions = 0;
    this.cycleRecords = [];
    this.graduatedRecords = [];
    this.lastGraduated = null;
  }

  /**
   * Resets all pipeline registers, hazard units, and statistics.
   */
  reset() {
    this.hazardUnit.reset();
    this.IF_ID = createEmptyPipelineRegister();
    this.ID_EX = createEmptyPipelineRegister();
    this.EX_MEM = createEmptyPipelineRegister();
    this.MEM_WB = createEmptyPipelineRegister();
    this.graduatedInstructions = 0;
    this.cycleRecords = [];
    this.graduatedRecords = [];
    this.lastGraduated = null;
  }

  /**
   * Calculates current Instructions Per Cycle (IPC).
   *
   * @returns {number}
   */
  get ipc() {
    const totalCycles = this.clock ? this.clock.currentCycle : 0;
    if (totalCycles === 0) return 0;
    return parseFloat((this.graduatedInstructions / totalCycles).toFixed(3));
  }

  /**
   * Calculates current Cycles Per Instruction (CPI).
   *
   * @returns {number}
   */
  get cpi() {
    if (this.graduatedInstructions === 0) return 0;
    const totalCycles = this.clock ? this.clock.currentCycle : 0;
    return parseFloat((totalCycles / this.graduatedInstructions).toFixed(3));
  }

  /**
   * Checks if all pipeline registers are currently empty/invalid.
   *
   * @returns {boolean}
   */
  isPipelineEmpty() {
    return (
      !this.IF_ID.valid &&
      !this.ID_EX.valid &&
      !this.EX_MEM.valid &&
      !this.MEM_WB.valid
    );
  }

  /**
   * Returns a snapshot of the current 5 stages for display or debugging.
   */
  getStageSnapshot() {
    const fmtInst = (reg) => {
      if (!reg.valid) {
        return reg.isBubble ? `[BUBBLE: ${reg.bubbleReason || 'STALL'}]` : '[IDLE]';
      }
      const pcStr = `0x${reg.pc.toString(16).padStart(4, '0').toUpperCase()}`;
      const name = reg.decoded?.opcodeName || 'INST';
      return `${name} (${pcStr})`;
    };

    return {
      IF: this.IF_ID.valid ? `0x${this.latches.PC.toString(16).padStart(4, '0').toUpperCase()}` : '[IDLE]',
      ID: fmtInst(this.IF_ID),
      EX: fmtInst(this.ID_EX),
      MEM: fmtInst(this.EX_MEM),
      WB: fmtInst(this.MEM_WB),
    };
  }

  /**
   * Advances the CPU by a single physical clock cycle (Micro-step).
   * Concurrently evaluates all 5 pipeline stages and captures state transitions.
   *
   * @returns {object|null} Clock cycle record or null if halted
   */
  tick() {
    if (this.vm.halted) {
      return null;
    }

    // 1. Advance Quartz Oscillator Clock
    const clockResult = this.clock.tick();
    const cycleNum = clockResult.cycle;

    // 2. Hazard Detection Unit & Pipeline Interlocks
    // Evaluates potential Load-Use RAW Hazard between ID and EX
    const hazard = this.hazardUnit.checkHazard(this.IF_ID, this.ID_EX);
    const isStalled = hazard.stall;

    // Stage Next Registers (to be latched on clock transition)
    let next_IF_ID = createEmptyPipelineRegister();
    let next_ID_EX = createEmptyPipelineRegister();
    let next_EX_MEM = createEmptyPipelineRegister();
    let next_MEM_WB = createEmptyPipelineRegister();

    let graduatedThisCycle = null;
    let forwardThisCycle = null;

    // =========================================================================
    // 3. STAGE 5: WRITE-BACK (WB) - Retirement & Architectural State Commit
    // =========================================================================
    if (this.MEM_WB.valid) {
      const wbReg = this.MEM_WB;
      const decoded = wbReg.decoded;
      const control = wbReg.control;

      // Register File Commit
      if (control?.RegWrite && decoded?.dr !== undefined) {
        this.regFile.write(decoded.dr, wbReg.finalValue);
      }

      // Condition Code Update (PSR)
      if (control?.SetCC) {
        const flag = calculateConditionFlag(wbReg.finalValue);
        this.latches.latchPSR(flag);
      }

      // Instruction successfully graduated!
      this.graduatedInstructions++;
      graduatedThisCycle = {
        cycle: cycleNum,
        pc: wbReg.pc,
        rawInstruction: wbReg.rawInstruction,
        decoded: wbReg.decoded,
        finalValue: wbReg.finalValue,
        dr: decoded?.dr,
        effectiveAddress: wbReg.effectiveAddress,
        memData: wbReg.memData,
        aluResult: wbReg.aluResult,
        control: wbReg.control,
        psr: this.latches.PSR,
      };

      this.graduatedRecords.push(graduatedThisCycle);
      this.lastGraduated = graduatedThisCycle;
    }

    // =========================================================================
    // 4. STAGE 4: MEMORY ACCESS (MEM) - RAM / MMIO Bus Transaction
    // =========================================================================
    if (this.EX_MEM.valid) {
      const exMem = this.EX_MEM;
      const control = exMem.control;
      let memData = null;
      let finalValue = exMem.aluResult;

      if (control?.MemRead) {
        // Read Cycle via System Bus and Address Decoder
        this.latches.latchMAR(exMem.effectiveAddress);
        memData = this.vm.bus.readCycle(this.latches, 1);
        finalValue = memData;
      } else if (control?.MemWrite) {
        // Write Cycle via System Bus and Address Decoder
        this.latches.latchMAR(exMem.effectiveAddress);
        this.latches.latchMDR(exMem.writeData);
        this.vm.bus.writeCycle(this.latches, 1);
        finalValue = exMem.writeData;
      }

      next_MEM_WB = {
        ...exMem,
        memData,
        finalValue,
        valid: true,
      };
    }

    // =========================================================================
    // 5. STAGE 3: EXECUTE (EX) - ALU & Forwarding / Bypassing Unit
    // =========================================================================
    if (this.ID_EX.valid) {
      const idEx = this.ID_EX;
      const decoded = idEx.decoded;
      const control = idEx.control;

      // Forwarding / Bypassing Unit: Resolves RAW hazards from EX/MEM and MEM/WB
      const fwd = this.hazardUnit.resolveForwarding(this.ID_EX, this.EX_MEM, this.MEM_WB);
      forwardThisCycle = fwd;

      const operandA = fwd.valueA;
      const operandB = fwd.valueB;

      let aluResult = 0;
      let effectiveAddress = null;

      if (decoded.opcode === OPCODE.ADD) {
        const alu = ALU.execute(decoded.opcode, operandA, operandB);
        aluResult = alu.result;
      } else if (decoded.opcode === OPCODE.LD) {
        // LC-3 LD Address Calculation: NextPC (PC+1) + SEXT(PCoffset9)
        effectiveAddress = (idEx.nextPc + decoded.pcOffset9) & ADDR_MAX;
        aluResult = effectiveAddress;
      }

      next_EX_MEM = {
        ...idEx,
        aluResult,
        effectiveAddress,
        writeData: operandA,
        forwardDetails: fwd,
        valid: true,
      };
    }

    // =========================================================================
    // 6. STAGE 2: INSTRUCTION DECODE (ID) & Register Fetch
    // =========================================================================
    if (isStalled) {
      // Pipeline Interlock on Load-Use Hazard:
      // Insert a NOP bubble into next_ID_EX
      next_ID_EX = {
        ...createEmptyPipelineRegister(),
        valid: false,
        isBubble: true,
        bubbleReason: hazard.reason,
      };
    } else if (this.IF_ID.valid) {
      const ifId = this.IF_ID;
      const decoded = InstructionDecoder.decode(ifId.rawInstruction);
      const control = ControlUnit.generateSignals(decoded);

      // Read General Purpose Register File
      let sr1Val = decoded.sr1 !== undefined ? this.regFile.read(decoded.sr1) : 0;
      let sr2Val = decoded.sr2 !== undefined ? this.regFile.read(decoded.sr2) : 0;

      // Internal Register File Forwarding (WB-to-ID Bypassing in same cycle)
      if (this.MEM_WB.valid && this.MEM_WB.control?.RegWrite && this.MEM_WB.decoded?.dr !== undefined) {
        const wbDr = this.MEM_WB.decoded.dr;
        const wbVal = this.MEM_WB.finalValue;
        if (decoded.sr1 === wbDr) {
          sr1Val = wbVal;
        }
        if (!decoded.immFlag && decoded.sr2 === wbDr) {
          sr2Val = wbVal;
        }
      }

      next_ID_EX = {
        pc: ifId.pc,
        nextPc: ifId.nextPc,
        rawInstruction: ifId.rawInstruction,
        decoded,
        control,
        sr1Val,
        sr2Val,
        valid: true,
        isBubble: false,
      };
    }

    // =========================================================================
    // 7. STAGE 1: INSTRUCTION FETCH (IF)
    // =========================================================================
    if (isStalled) {
      // Freeze IF/ID: Re-decode the same instruction next cycle
      next_IF_ID = this.IF_ID;
      // PC is not incremented (frozen)
    } else {
      const currentPC = this.latches.PC;

      if (this.vm.codeEnd !== undefined && currentPC >= this.vm.codeEnd) {
        // No more instructions in program; fetch pipeline drain bubble
        next_IF_ID = {
          ...createEmptyPipelineRegister(),
          valid: false,
          reachedEnd: true,
        };
      } else {
        // Read instruction word from memory through the Address Decoder
        const rawInstruction = this.vm.bus.addressDecoder.read(currentPC);
        const decoded = InstructionDecoder.decode(rawInstruction);
        const nextPc = (currentPC + 1) & ADDR_MAX;

        next_IF_ID = {
          pc: currentPC,
          nextPc,
          rawInstruction,
          decoded,
          valid: true,
          isBubble: false,
        };

        // Advance Program Counter (PC)
        this.latches.latchPC(nextPc);
      }
    }

    // =========================================================================
    // 8. CLOCK EDGE REGISTER LATCHING (Rising Clock Edge)
    // =========================================================================
    this.IF_ID = next_IF_ID;
    this.ID_EX = next_ID_EX;
    this.EX_MEM = next_EX_MEM;
    this.MEM_WB = next_MEM_WB;

    // Build comprehensive cycle record snapshot for reservation table & telemetry
    const cycleRecord = {
      cycle: cycleNum,
      hazard,
      forward: forwardThisCycle,
      graduated: graduatedThisCycle,
      stages: this.getStageSnapshot(),
      stalled: isStalled,
      ipc: this.ipc,
      cpi: this.cpi,
    };

    this.cycleRecords.push(cycleRecord);

    // If code has ended and all pipeline registers have drained, halt VM
    if (this.vm.codeEnd !== undefined && this.latches.PC >= this.vm.codeEnd && this.isPipelineEmpty()) {
      this.vm.halted = true;
    }

    return cycleRecord;
  }

  /**
   * MACRO-STEP: Runs clock ticks until the next instruction graduates from WB
   * or the pipeline drains and halts.
   *
   * @param {number} [maxTicks=1000] - Safety bound to prevent infinite loops
   * @returns {object|null} Graduated instruction record, or null if halted
   */
  step(maxTicks = 1000) {
    if (this.vm.halted) {
      return null;
    }

    let ticks = 0;
    while (!this.vm.halted && ticks < maxTicks) {
      ticks++;
      const cycleRecord = this.tick();
      if (!cycleRecord) {
        break;
      }
      if (cycleRecord.graduated) {
        return {
          ...cycleRecord.graduated,
          instructionComplete: true,
          cyclesTaken: ticks,
          totalCycles: this.clock.currentCycle,
          ipc: this.ipc,
          cpi: this.cpi,
        };
      }
    }

    return null;
  }
}
