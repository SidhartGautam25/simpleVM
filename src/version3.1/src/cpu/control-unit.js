import { OPCODE } from '../constants.js';

/**
 * Control Unit (CU) - Hardware Control Logic - Version 3.0
 *
 * Examines the decoded instruction and asserts micro-architectural control wire signals,
 * including Tri-State Internal Central Bus gating and register load enables.
 *
 * Micro-architectural Control Signals:
 * - RegWrite / LD_REG : Enables Destination Register (DR) in Register File to latch Central Bus word
 * - ALUSrc            : 'REG' (Port B) or 'IMM' (Immediate/Offset from instruction)
 * - MemRead           : 1 if memory read is strobed on Memory Bus (RAM -> MDR)
 * - MemWrite          : 1 if memory write is strobed on Memory Bus (MDR -> RAM)
 * - MemToReg          : 0 for ALU_Out -> RegFile; 1 for MDR -> RegFile
 * - ALUOp             : ALU operation code ('ADD', etc.)
 * - SetCC / LD_CC     : 1 if Processor Status Register (PSR) should latch condition codes
 *
 * Tri-State Central Bus Gating Lines:
 * - GateALU    : Routes ALU Output onto Central Internal Bus
 * - GateMDR    : Routes Memory Data Register onto Central Internal Bus
 * - GateMARMUX : Routes Calculated Effective Address onto Central Internal Bus
 * - GatePC     : Routes Program Counter onto Central Internal Bus (during IF)
 * - LD_MAR     : Enables Memory Address Register to latch Central Internal Bus
 * - LD_IR      : Enables Instruction Register to latch Central Internal Bus
 */
export class ControlUnit {
  /**
   * Generates micro-architectural control wire signals from the decoded instruction.
   *
   * @param {object} decoded - Decoded instruction fields from InstructionDecoder
   * @returns {object} Control wire signals and Tri-State bus gating lines
   */
  static generateSignals(decoded) {
    switch (decoded.opcode) {
      case OPCODE.ADD:
        return {
          RegWrite: true,
          LD_REG: true,
          ALUSrc: decoded.immFlag ? 'IMM' : 'REG',
          MemRead: false,
          MemWrite: false,
          MemToReg: false, // 0 = ALU_Out routed to Central Bus
          GateALU: true,   // ALU drives Central Bus in WB
          GateMDR: false,
          GateMARMUX: false,
          LD_MAR: false,
          LD_MDR: false,
          ALUOp: 'ADD',
          SetCC: true,
          LD_CC: true,
        };

      case OPCODE.LD:
        return {
          RegWrite: true,
          LD_REG: true,
          ALUSrc: 'IMM',   // Address calculation uses PC + SEXT(PCoffset9)
          MemRead: true,   // Read cycle on Memory Bus into MDR
          MemWrite: false,
          MemToReg: true,  // 1 = MDR routed to Central Bus
          GateALU: false,
          GateMDR: true,   // MDR drives Central Bus in WB
          GateMARMUX: true,// Effective address driven to MAR
          LD_MAR: true,    // MAR latches address from bus
          LD_MDR: true,    // MDR latches loaded memory word
          ALUOp: 'ADD',    // Effective address calculation via addition
          SetCC: true,
          LD_CC: true,
        };

      default:
        return {
          RegWrite: false,
          LD_REG: false,
          ALUSrc: 'REG',
          MemRead: false,
          MemWrite: false,
          MemToReg: false,
          GateALU: false,
          GateMDR: false,
          GateMARMUX: false,
          LD_MAR: false,
          LD_MDR: false,
          ALUOp: 'NONE',
          SetCC: false,
          LD_CC: false,
        };
    }
  }
}
