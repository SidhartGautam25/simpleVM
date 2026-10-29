import {
  FORWARD_MUX,
  FORWARD_MUX_NAMES,
  HAZARD_TYPE,
  OPCODE,
} from '../constants.js';
import { InstructionDecoder } from './instruction-decoder.js';

/**
 * Forwarding / Bypassing Unit
 *
 * Implements hardware multiplexers at the inputs of the ALU in the EX stage:
 *   - EX/MEM Hazard (Bypass from EX/MEM register): 0b01
 *   - MEM/WB Hazard (Bypass from MEM/WB register): 0b10
 *   - No Hazard (Original value from ID/EX register): 0b00
 *
 * Resolves Read-After-Write (RAW) data hazards for ALU-to-ALU dependencies
 * with 0 stall cycles, allowing back-to-back dependent computations.
 */
export class ForwardingUnit {
  /**
   * Evaluates forwarding conditions for both ALU input operands.
   *
   * @param {object} id_ex - ID/EX pipeline register
   * @param {object} ex_mem - EX/MEM pipeline register
   * @param {object} mem_wb - MEM/WB pipeline register
   * @returns {object} Forwarding MUX decisions and resolved operand values
   */
  static resolve(id_ex, ex_mem, mem_wb) {
    if (!id_ex || !id_ex.valid || !id_ex.decoded) {
      return {
        forwardA: FORWARD_MUX.ORIGINAL,
        forwardB: FORWARD_MUX.ORIGINAL,
        valueA: id_ex ? id_ex.sr1Val : 0,
        valueB: id_ex ? (id_ex.decoded?.immFlag ? id_ex.decoded.imm5 : id_ex.sr2Val) : 0,
        sourceA: 'ID/EX',
        sourceB: 'ID/EX',
        events: [],
      };
    }

    const decoded = id_ex.decoded;
    const events = [];

    let forwardA = FORWARD_MUX.ORIGINAL;
    let valueA = id_ex.sr1Val;
    let sourceA = 'ID/EX (RegFile)';

    let forwardB = FORWARD_MUX.ORIGINAL;
    let valueB = decoded.immFlag ? decoded.imm5 : id_ex.sr2Val;
    let sourceB = decoded.immFlag ? 'IMM (SEXT5)' : 'ID/EX (RegFile)';

    // -------------------------------------------------------------
    // OPERAND A (SR1) FORWARDING LOGIC
    // -------------------------------------------------------------
    if (decoded.sr1 !== undefined) {
      // 1. EX Hazard: Previous instruction in EX/MEM writes to SR1 (and is NOT a memory read)
      if (
        ex_mem &&
        ex_mem.valid &&
        ex_mem.control?.RegWrite &&
        !ex_mem.control?.MemRead &&
        ex_mem.decoded?.dr !== undefined &&
        ex_mem.decoded.dr === decoded.sr1
      ) {
        forwardA = FORWARD_MUX.EX_MEM;
        valueA = ex_mem.aluResult;
        sourceA = `EX/MEM Bypass (R${decoded.sr1} = ${valueA})`;
        events.push(`[ForwardingUnit] EX->EX Bypass: R${decoded.sr1} forwarded from EX/MEM (${valueA}) to ALU Input A`);
      }
      // 2. MEM Hazard: Instruction in MEM/WB writes to SR1 (and not overridden by EX/MEM)
      else if (
        mem_wb &&
        mem_wb.valid &&
        mem_wb.control?.RegWrite &&
        mem_wb.decoded?.dr !== undefined &&
        mem_wb.decoded.dr === decoded.sr1
      ) {
        forwardA = FORWARD_MUX.MEM_WB;
        valueA = mem_wb.finalValue;
        sourceA = `MEM/WB Bypass (R${decoded.sr1} = ${valueA})`;
        events.push(`[ForwardingUnit] MEM->EX Bypass: R${decoded.sr1} forwarded from MEM/WB (${valueA}) to ALU Input A`);
      }
    }

    // -------------------------------------------------------------
    // OPERAND B (SR2) FORWARDING LOGIC (Register mode only)
    // -------------------------------------------------------------
    if (!decoded.immFlag && decoded.sr2 !== undefined) {
      // 1. EX Hazard: Previous instruction in EX/MEM writes to SR2 (and is NOT a memory read)
      if (
        ex_mem &&
        ex_mem.valid &&
        ex_mem.control?.RegWrite &&
        !ex_mem.control?.MemRead &&
        ex_mem.decoded?.dr !== undefined &&
        ex_mem.decoded.dr === decoded.sr2
      ) {
        forwardB = FORWARD_MUX.EX_MEM;
        valueB = ex_mem.aluResult;
        sourceB = `EX/MEM Bypass (R${decoded.sr2} = ${valueB})`;
        events.push(`[ForwardingUnit] EX->EX Bypass: R${decoded.sr2} forwarded from EX/MEM (${valueB}) to ALU Input B`);
      }
      // 2. MEM Hazard: Instruction in MEM/WB writes to SR2 (and not overridden by EX/MEM)
      else if (
        mem_wb &&
        mem_wb.valid &&
        mem_wb.control?.RegWrite &&
        mem_wb.decoded?.dr !== undefined &&
        mem_wb.decoded.dr === decoded.sr2
      ) {
        forwardB = FORWARD_MUX.MEM_WB;
        valueB = mem_wb.finalValue;
        sourceB = `MEM/WB Bypass (R${decoded.sr2} = ${valueB})`;
        events.push(`[ForwardingUnit] MEM->EX Bypass: R${decoded.sr2} forwarded from MEM/WB (${valueB}) to ALU Input B`);
      }
    }

    return {
      forwardA,
      forwardB,
      forwardAName: FORWARD_MUX_NAMES[forwardA],
      forwardBName: FORWARD_MUX_NAMES[forwardB],
      valueA,
      valueB,
      sourceA,
      sourceB,
      isForwardedA: forwardA !== FORWARD_MUX.ORIGINAL,
      isForwardedB: forwardB !== FORWARD_MUX.ORIGINAL,
      events,
    };
  }
}

/**
 * Hazard Detection Unit & Pipeline Interlock Controller
 *
 * Detects structural and data hazards that cannot be resolved by forwarding alone:
 *   Specifically: LOAD-USE RAW HAZARDS
 *   When an instruction in ID reads a register that is being loaded by an
 *   in-flight LD instruction currently in EX.
 *
 * Actions taken on Load-Use Hazard:
 *   1. Stall PC: Disable PC write enable (PC does not increment).
 *   2. Stall IF/ID: Disable IF/ID register write enable (re-decodes same instruction).
 *   3. Bubble ID/EX: Clear ID/EX control signals (inserts a NOP bubble into EX).
 */
export class HazardDetectionUnit {
  /**
   * Checks for a Load-Use hazard between the instruction in ID and the instruction in EX.
   *
   * @param {object} if_id - Instruction currently in ID stage
   * @param {object} id_ex - Instruction currently in EX stage
   * @returns {object} Hazard detection result and interlock control signals
   */
  static check(if_id, id_ex) {
    if (!if_id || !if_id.valid || !id_ex || !id_ex.valid) {
      return {
        stall: false,
        hazardType: HAZARD_TYPE.NONE,
        bubbleInserted: false,
        events: [],
      };
    }

    const idDecoded = if_id.decoded || (if_id.rawInstruction !== undefined ? InstructionDecoder.decode(if_id.rawInstruction) : null);
    const exDecoded = id_ex.decoded || (id_ex.rawInstruction !== undefined ? InstructionDecoder.decode(id_ex.rawInstruction) : null);

    if (!idDecoded || !exDecoded) {
      return {
        stall: false,
        hazardType: HAZARD_TYPE.NONE,
        bubbleInserted: false,
        events: [],
      };
    }

    const exIsLoad = id_ex.control?.MemRead === 1 || id_ex.control?.MemRead === true;
    const exDestReg = exDecoded.dr;

    if (exIsLoad && exDestReg !== undefined) {
      const sr1Conflict = idDecoded.sr1 !== undefined && idDecoded.sr1 === exDestReg;
      const sr2Conflict = !idDecoded.immFlag && idDecoded.sr2 !== undefined && idDecoded.sr2 === exDestReg;

      if (sr1Conflict || sr2Conflict) {
        const dependentReg = sr1Conflict ? `R${idDecoded.sr1}` : `R${idDecoded.sr2}`;
        const reason = `LOAD-USE HAZARD: Instruction in ID needs ${dependentReg}, but in-flight LD in EX has not read memory yet.`;
        return {
          stall: true,
          hazardType: HAZARD_TYPE.LOAD_USE,
          bubbleInserted: true,
          conflictedRegister: exDestReg,
          reason,
          events: [
            `[HazardUnit] ${reason}`,
            `[HazardUnit] Pipeline Interlock: Freeze PC, Freeze IF/ID, Insert NOP Bubble into ID/EX`,
          ],
        };
      }
    }

    return {
      stall: false,
      hazardType: HAZARD_TYPE.NONE,
      bubbleInserted: false,
      events: [],
    };
  }
}

/**
 * Unified Hazard Unit
 * Integrates Hazard Detection, Interlocks, and Forwarding Multiplexer Control.
 */
export class HazardUnit {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalStalls = 0;
    this.totalBubbles = 0;
    this.totalForwardings = 0;
    this.lastHazard = { stall: false, hazardType: HAZARD_TYPE.NONE, events: [] };
    this.lastForwarding = { isForwardedA: false, isForwardedB: false, events: [] };
  }

  /**
   * Performs hazard check between ID and EX stages.
   *
   * @param {object} if_id
   * @param {object} id_ex
   * @returns {object}
   */
  checkHazard(if_id, id_ex) {
    const hazard = HazardDetectionUnit.check(if_id, id_ex);
    if (hazard.stall) {
      this.totalStalls++;
      this.totalBubbles++;
    }
    this.lastHazard = hazard;
    return hazard;
  }

  /**
   * Resolves forwarding for the instruction in EX stage.
   *
   * @param {object} id_ex
   * @param {object} ex_mem
   * @param {object} mem_wb
   * @returns {object}
   */
  resolveForwarding(id_ex, ex_mem, mem_wb) {
    const fwd = ForwardingUnit.resolve(id_ex, ex_mem, mem_wb);
    if (fwd.isForwardedA || fwd.isForwardedB) {
      this.totalForwardings += (fwd.isForwardedA ? 1 : 0) + (fwd.isForwardedB ? 1 : 0);
    }
    this.lastForwarding = fwd;
    return fwd;
  }
}
