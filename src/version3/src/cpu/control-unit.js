/**
 * Stages 17 & 23: Multicycle Control Unit (Finite State Machine)
 *
 * Coordinates the CPU datapath by asserting control signals in each clock cycle.
 * Instead of executing instructions in a single monolithic JavaScript function,
 * execution progresses through discrete micro-architectural phases:
 *
 *   FETCH_1     -> Assert PC to MAR
 *   FETCH_2     -> Read Memory into MDR, Advance PC via Adder
 *   FETCH_3     -> Transfer MDR into Instruction Register (IR)
 *   DECODE      -> Decode Opcode and Operands
 *   EXECUTE     -> ALU operation / Branch evaluation / Effective Address generation
 *   MEM_READ    -> Memory read for LD instructions
 *   MEM_WRITE   -> Memory write for ST instructions
 *   WRITEBACK   -> Capture MDR or ALU result into destination register
 *   HALTED      -> CPU execution halted
 */

export const CPU_STATE = {
  RESET:       'RESET',
  FETCH_1:     'FETCH_1',
  FETCH_2:     'FETCH_2',
  FETCH_3:     'FETCH_3',
  DECODE:      'DECODE',
  EXECUTE:     'EXECUTE',
  MEM_READ:    'MEM_READ',
  MEM_WRITE:   'MEM_WRITE',
  WRITEBACK:   'WRITEBACK',
  HALTED:      'HALTED',
};

export class ControlUnit {
  constructor() {
    this.currentState = CPU_STATE.RESET;
    this.signals = this.getResetSignals();
  }

  getResetSignals() {
    return {
      // Register File controls
      regWriteEnable: 0,
      regDestSelect: 0,
      regSource1Select: 0,
      regSource2Select: 0,

      // ALU controls
      aluOp: null,
      aluSourceBIsImm: 0,

      // Memory Interface controls
      marLoad: 0,
      mdrLoad: 0,
      memRead: 0,
      memWrite: 0,

      // Special Register controls
      irLoad: 0,
      pcLoad: 0,
      pcIncrement: 0,
      psrUpdate: 0,

      // System controls
      halt: 0,
    };
  }

  reset() {
    this.currentState = CPU_STATE.RESET;
    this.signals = this.getResetSignals();
  }
}

