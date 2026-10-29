import { OPCODE, BUS_GATE, SIGNAL_LOW, SIGNAL_HIGH } from '../constants.js';

/**
 * Control Unit (CU) - Hardware Control Logic - Version 3.4
 *
 * Examines the decoded instruction and asserts micro-architectural control wire signals
 * as strict 1-bit binary signals (0 and 1) along with the 3-bit Gate Selector Code.
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
          gateCode: BUS_GATE.ALU, // 0b011: ALU output drives Central Bus
          GateALU: SIGNAL_HIGH,
          GateMDR: SIGNAL_LOW,
          GateMARMUX: SIGNAL_LOW,
          GatePC: SIGNAL_LOW,
          RegWrite: SIGNAL_HIGH,
          LD_REG: SIGNAL_HIGH,
          ALUSrc: decoded.immFlag ? 'IMM' : 'REG',
          MemRead: SIGNAL_LOW,
          MemWrite: SIGNAL_LOW,
          MemToReg: SIGNAL_LOW, // 0 = ALU_Out routed to Central Bus
          LD_MAR: SIGNAL_LOW,
          LD_MDR: SIGNAL_LOW,
          ALUOp: 'ADD',
          SetCC: SIGNAL_HIGH,
          LD_CC: SIGNAL_HIGH,
        };

      case OPCODE.LD:
        return {
          gateCode: BUS_GATE.MDR, // 0b010: MDR drives Central Bus in WB
          GateALU: SIGNAL_LOW,
          GateMDR: SIGNAL_HIGH,
          GateMARMUX: SIGNAL_HIGH,// Effective address driven to MAR in EX
          GatePC: SIGNAL_LOW,
          RegWrite: SIGNAL_HIGH,
          LD_REG: SIGNAL_HIGH,
          ALUSrc: 'IMM',          // Address calculation uses PC + SEXT(PCoffset9)
          MemRead: SIGNAL_HIGH,   // Read cycle on Memory Bus into MDR
          MemWrite: SIGNAL_LOW,
          MemToReg: SIGNAL_HIGH,  // 1 = MDR routed to Central Bus
          LD_MAR: SIGNAL_HIGH,    // MAR latches address from bus
          LD_MDR: SIGNAL_HIGH,    // MDR latches loaded memory word
          ALUOp: 'ADD',           // Effective address calculation via addition
          SetCC: SIGNAL_HIGH,
          LD_CC: SIGNAL_HIGH,
        };

      default:
        return {
          gateCode: BUS_GATE.NONE,
          GateALU: SIGNAL_LOW,
          GateMDR: SIGNAL_LOW,
          GateMARMUX: SIGNAL_LOW,
          GatePC: SIGNAL_LOW,
          RegWrite: SIGNAL_LOW,
          LD_REG: SIGNAL_LOW,
          ALUSrc: 'REG',
          MemRead: SIGNAL_LOW,
          MemWrite: SIGNAL_LOW,
          MemToReg: SIGNAL_LOW,
          LD_MAR: SIGNAL_LOW,
          LD_MDR: SIGNAL_LOW,
          ALUOp: 'NONE',
          SetCC: SIGNAL_LOW,
          LD_CC: SIGNAL_LOW,
        };
    }
  }
}
