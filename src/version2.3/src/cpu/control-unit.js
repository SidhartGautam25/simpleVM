import { OPCODE } from '../constants.js';

/**
 * Control Unit (CU) - Hardware Control Logic
 *
 * Examines the decoded instruction and asserts micro-architectural control wire signals.
 *
 * Control Signals:
 * - RegWrite : 1 if Destination Register (DR) in Register File should latch the result
 * - ALUSrc   : 'REG' (Port B) or 'IMM' (Immediate/Offset from instruction)
 * - MemRead  : 1 if memory read is strobed (RAM -> MDR)
 * - MemWrite : 1 if memory write is strobed (MDR -> RAM)
 * - MemToReg : 0 for ALU_Out -> RegFile; 1 for MDR -> RegFile
 * - ALUOp    : ALU operation code ('ADD', etc.)
 * - SetCC    : 1 if Processor Status Register (PSR) condition codes should be updated
 */
export class ControlUnit {
  /**
   * Generates micro-architectural control wire signals from the decoded instruction.
   *
   * @param {object} decoded - Decoded instruction fields from InstructionDecoder
   * @returns {{
   *   RegWrite: boolean,
   *   ALUSrc: 'REG'|'IMM',
   *   MemRead: boolean,
   *   MemWrite: boolean,
   *   MemToReg: boolean,
   *   ALUOp: string,
   *   SetCC: boolean,
   * }} Control wire signals
   */
  static generateSignals(decoded) {
    switch (decoded.opcode) {
      case OPCODE.ADD:
        return {
          RegWrite: true,
          ALUSrc: decoded.immFlag ? 'IMM' : 'REG',
          MemRead: false,
          MemWrite: false,
          MemToReg: false, // 0 = ALU_Out routed to Register File
          ALUOp: 'ADD',
          SetCC: true,
        };

      case OPCODE.LD:
        return {
          RegWrite: true,
          ALUSrc: 'IMM',   // Address calculation uses PC + SEXT(PCoffset9)
          MemRead: true,   // Read from memory into MDR
          MemWrite: false,
          MemToReg: true,  // 1 = MDR routed to Register File
          ALUOp: 'ADD',    // Effective address calculation via addition
          SetCC: true,
        };

      default:
        return {
          RegWrite: false,
          ALUSrc: 'REG',
          MemRead: false,
          MemWrite: false,
          MemToReg: false,
          ALUOp: 'NONE',
          SetCC: false,
        };
    }
  }
}

