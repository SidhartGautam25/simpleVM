import { OPCODE, BUS_GATE, BUS_GATE_NAMES, SIGNAL_LOW, SIGNAL_HIGH } from '../constants.js';

/**
 * Next-State Branch Condition Codes for Microsequencer
 */
export const COND = {
  UNCONDITIONAL: 0b00, // 0: Next uPC is strictly microInstruction.nextState (J)
  BRANCH_OPCODE: 0b01, // 1: Next uPC is computed by inspecting IR[15:12] (Opcode)
  BRANCH_READY:  0b10, // 2: Next uPC branches if memory asserted MEM_READY
};

/**
 * Control Store ROM - Version 3.4
 *
 * Each row in this ROM represents exactly ONE physical micro-instruction executed
 * in ONE clock cycle.
 *
 * Hardware Characteristics:
 * - 3-bit Gate Selector Code (`gateCode`):
 *   000 (NONE), 001 (GatePC), 010 (GateMDR), 011 (GateALU), 100 (GateMARMUX)
 * - Strict 1-Bit Binary Signals (0 or 1):
 *   Load enables (LD_MAR, LD_MDR, LD_IR, LD_PC, LD_REG, LD_CC) and memory strobes
 *   (MemRead, MemWrite) are physical 1-bit lines (0V = 0, 3.3V = 1).
 */
export const CONTROL_STORE_ROM = Object.freeze({
  // ---------------------------------------------------------------------------
  // STATE 18: FETCH-1
  // GatePC=1 (0b001) drives Central Bus -> LD_MAR=1 latches address -> MemRead=1
  // ---------------------------------------------------------------------------
  18: {
    state: 18,
    name: 'FETCH_1 (GatePC -> BUS -> MAR, MemRead=1)',
    gateCode: BUS_GATE.PC,
    signals: {
      gateCode: BUS_GATE.PC,
      GatePC: SIGNAL_HIGH,
      GateMDR: SIGNAL_LOW,
      GateALU: SIGNAL_LOW,
      GateMARMUX: SIGNAL_LOW,
      LD_MAR: SIGNAL_HIGH,
      LD_MDR: SIGNAL_LOW,
      LD_IR: SIGNAL_LOW,
      LD_PC: SIGNAL_LOW,
      LD_REG: SIGNAL_LOW,
      LD_CC: SIGNAL_LOW,
      MemRead: SIGNAL_HIGH,
      MemWrite: SIGNAL_LOW,
      ALUSrc: 'NONE',
      ALUOp: 'NONE',
    },
    cond: COND.UNCONDITIONAL,
    nextState: 33,
    instructionComplete: false,
  },

  // ---------------------------------------------------------------------------
  // STATE 33: FETCH-2
  // Memory read cycle completes -> Data Bus drives MDR -> LD_MDR=1
  // ---------------------------------------------------------------------------
  33: {
    state: 33,
    name: 'FETCH_2 (DataBus -> MDR, MemRead=1)',
    gateCode: BUS_GATE.NONE,
    signals: {
      gateCode: BUS_GATE.NONE,
      GatePC: SIGNAL_LOW,
      GateMDR: SIGNAL_LOW,
      GateALU: SIGNAL_LOW,
      GateMARMUX: SIGNAL_LOW,
      LD_MAR: SIGNAL_LOW,
      LD_MDR: SIGNAL_HIGH,
      LD_IR: SIGNAL_LOW,
      LD_REG: SIGNAL_LOW,
      LD_CC: SIGNAL_LOW,
      MemRead: SIGNAL_HIGH,
      MemWrite: SIGNAL_LOW,
      ALUSrc: 'NONE',
      ALUOp: 'NONE',
    },
    cond: COND.UNCONDITIONAL,
    nextState: 35,
    instructionComplete: false,
  },

  // ---------------------------------------------------------------------------
  // STATE 35: FETCH-3
  // GateMDR=1 (0b010) drives Central Bus -> LD_IR=1 latches IR -> LD_PC=1 increments PC
  // ---------------------------------------------------------------------------
  35: {
    state: 35,
    name: 'FETCH_3 (GateMDR -> BUS -> IR, LD_PC=1)',
    gateCode: BUS_GATE.MDR,
    signals: {
      gateCode: BUS_GATE.MDR,
      GatePC: SIGNAL_LOW,
      GateMDR: SIGNAL_HIGH,
      GateALU: SIGNAL_LOW,
      GateMARMUX: SIGNAL_LOW,
      LD_MAR: SIGNAL_LOW,
      LD_MDR: SIGNAL_LOW,
      LD_IR: SIGNAL_HIGH,
      LD_PC: SIGNAL_HIGH,
      LD_REG: SIGNAL_LOW,
      LD_CC: SIGNAL_LOW,
      MemRead: SIGNAL_LOW,
      MemWrite: SIGNAL_LOW,
      ALUSrc: 'NONE',
      ALUOp: 'NONE',
    },
    cond: COND.UNCONDITIONAL,
    nextState: 32,
    instructionComplete: false,
  },

  // ---------------------------------------------------------------------------
  // STATE 32: DECODE
  // Decode IR opcode -> Micro-branch to instruction execution state
  // ---------------------------------------------------------------------------
  32: {
    state: 32,
    name: 'DECODE (Branch on Opcode IR[15:12])',
    gateCode: BUS_GATE.NONE,
    signals: {
      gateCode: BUS_GATE.NONE,
      GatePC: SIGNAL_LOW,
      GateMDR: SIGNAL_LOW,
      GateALU: SIGNAL_LOW,
      GateMARMUX: SIGNAL_LOW,
      LD_MAR: SIGNAL_LOW,
      LD_MDR: SIGNAL_LOW,
      LD_IR: SIGNAL_LOW,
      LD_PC: SIGNAL_LOW,
      LD_REG: SIGNAL_LOW,
      LD_CC: SIGNAL_LOW,
      MemRead: SIGNAL_LOW,
      MemWrite: SIGNAL_LOW,
      ALUSrc: 'NONE',
      ALUOp: 'NONE',
    },
    cond: COND.BRANCH_OPCODE,
    nextState: null,
    opcodeMap: {
      [OPCODE.ADD]: 1, // Opcode 0001 -> State 1
      [OPCODE.LD]:  2, // Opcode 0010 -> State 2
    },
    instructionComplete: false,
  },

  // ---------------------------------------------------------------------------
  // STATE 1: ADD EXECUTION & WRITE-BACK
  // GateALU=1 (0b011) drives Central Bus -> LD_REG=1 latches DR -> LD_CC=1 latches PSR
  // ---------------------------------------------------------------------------
  1: {
    state: 1,
    name: 'ADD_EXECUTE_WB (GateALU -> BUS -> RegFile[DR], LD_CC=1)',
    gateCode: BUS_GATE.ALU,
    signals: {
      gateCode: BUS_GATE.ALU,
      GatePC: SIGNAL_LOW,
      GateMDR: SIGNAL_LOW,
      GateALU: SIGNAL_HIGH,
      GateMARMUX: SIGNAL_LOW,
      LD_MAR: SIGNAL_LOW,
      LD_MDR: SIGNAL_LOW,
      LD_IR: SIGNAL_LOW,
      LD_PC: SIGNAL_LOW,
      LD_REG: SIGNAL_HIGH,
      LD_CC: SIGNAL_HIGH,
      MemRead: SIGNAL_LOW,
      MemWrite: SIGNAL_LOW,
      ALUSrc: 'DYNAMIC',
      ALUOp: 'ADD',
    },
    cond: COND.UNCONDITIONAL,
    nextState: 18, // Return to Fetch
    instructionComplete: true,
  },

  // ---------------------------------------------------------------------------
  // STATE 2: LD ADDRESS CALCULATION
  // GateMARMUX=1 (0b100) drives Central Bus -> LD_MAR=1 -> MemRead=1
  // ---------------------------------------------------------------------------
  2: {
    state: 2,
    name: 'LD_ADDR_CALC (GateMARMUX -> BUS -> MAR, MemRead=1)',
    gateCode: BUS_GATE.MARMUX,
    signals: {
      gateCode: BUS_GATE.MARMUX,
      GatePC: SIGNAL_LOW,
      GateMDR: SIGNAL_LOW,
      GateALU: SIGNAL_LOW,
      GateMARMUX: SIGNAL_HIGH,
      LD_MAR: SIGNAL_HIGH,
      LD_MDR: SIGNAL_LOW,
      LD_IR: SIGNAL_LOW,
      LD_PC: SIGNAL_LOW,
      LD_REG: SIGNAL_LOW,
      LD_CC: SIGNAL_LOW,
      MemRead: SIGNAL_HIGH,
      MemWrite: SIGNAL_LOW,
      ALUSrc: 'IMM',
      ALUOp: 'ADD',
    },
    cond: COND.UNCONDITIONAL,
    nextState: 25,
    instructionComplete: false,
  },

  // ---------------------------------------------------------------------------
  // STATE 25: LD MEMORY READ & WRITE-BACK
  // DataBus -> MDR -> GateMDR=1 (0b010) -> RegFile[DR] -> LD_CC=1
  // ---------------------------------------------------------------------------
  25: {
    state: 25,
    name: 'LD_MEM_READ (DataBus -> MDR -> GateMDR -> RegFile[DR], LD_CC=1)',
    gateCode: BUS_GATE.MDR,
    signals: {
      gateCode: BUS_GATE.MDR,
      GatePC: SIGNAL_LOW,
      GateMDR: SIGNAL_HIGH,
      GateALU: SIGNAL_LOW,
      GateMARMUX: SIGNAL_LOW,
      LD_MAR: SIGNAL_LOW,
      LD_MDR: SIGNAL_HIGH,
      LD_IR: SIGNAL_LOW,
      LD_PC: SIGNAL_LOW,
      LD_REG: SIGNAL_HIGH,
      LD_CC: SIGNAL_HIGH,
      MemRead: SIGNAL_HIGH,
      MemWrite: SIGNAL_LOW,
      ALUSrc: 'NONE',
      ALUOp: 'NONE',
    },
    cond: COND.UNCONDITIONAL,
    nextState: 18, // Return to Fetch
    instructionComplete: true,
  },
});

/**
 * Microcoded FSM Control Sequencer - Version 3.4
 */
export class MicroSequencer {
  constructor() {
    this.ENTRY_STATE = 18;
    this.uPC = this.ENTRY_STATE;
    this.history = [];
  }

  reset() {
    this.uPC = this.ENTRY_STATE;
    this.history = [];
  }

  get currentMicroInstruction() {
    const inst = CONTROL_STORE_ROM[this.uPC];
    if (!inst) {
      throw new Error(`Microsequencer Error: Invalid uPC state ${this.uPC} not found in Control Store ROM.`);
    }
    return inst;
  }

  computeNextState(opcode = null) {
    const inst = this.currentMicroInstruction;

    if (inst.cond === COND.UNCONDITIONAL) {
      return inst.nextState;
    }

    if (inst.cond === COND.BRANCH_OPCODE) {
      if (opcode === null || opcode === undefined) {
        throw new Error(`Microsequencer Branch Error: COND.BRANCH_OPCODE requires valid opcode in State ${this.uPC}.`);
      }
      const targetState = inst.opcodeMap[opcode];
      if (targetState === undefined) {
        throw new Error(`Microsequencer Branch Error: Unmapped opcode 0b${opcode.toString(2).padStart(4, '0')} in State ${this.uPC}.`);
      }
      return targetState;
    }

    return inst.nextState;
  }

  step(context = {}) {
    const currentState = this.uPC;
    const currentInst = this.currentMicroInstruction;
    const nextState = this.computeNextState(context.opcode);

    this.history.push({
      fromState: currentState,
      toState: nextState,
      microOp: currentInst.name,
      gateCode: currentInst.gateCode,
      instructionComplete: currentInst.instructionComplete,
    });

    this.uPC = nextState;

    return {
      currentState,
      nextState,
      currentMicroInstruction: currentInst,
      instructionComplete: currentInst.instructionComplete,
    };
  }

  /**
   * Packs a micro-instruction into a 32-bit physical binary ROM control word.
   *
   * Bit Layout:
   *   [31:26] Next State J (6 bits)
   *   [25:24] Condition COND (2 bits)
   *   [23:21] Gate Selector Code (3 bits: 000..100)
   *   [20]    LD_MAR (1 bit)
   *   [19]    LD_MDR (1 bit)
   *   [18]    LD_IR  (1 bit)
   *   [17]    LD_PC  (1 bit)
   *   [16]    LD_REG (1 bit)
   *   [15]    LD_CC  (1 bit)
   *   [14]    MemRead (1 bit)
   *   [13]    MemWrite (1 bit)
   *
   * @param {object} microInst
   * @returns {number} 32-bit unsigned binary integer
   */
  static packMicroWord(microInst) {
    const j = (microInst.nextState || 0) & 0x3F;
    const cond = (microInst.cond || 0) & 0x3;
    const gate = (microInst.gateCode || 0) & 0x7;
    const sigs = microInst.signals;

    let word = 0;
    word |= (j << 26);
    word |= (cond << 24);
    word |= (gate << 21);
    word |= (sigs.LD_MAR << 20);
    word |= (sigs.LD_MDR << 19);
    word |= (sigs.LD_IR << 18);
    word |= (sigs.LD_PC << 17);
    word |= (sigs.LD_REG << 16);
    word |= (sigs.LD_CC << 15);
    word |= (sigs.MemRead << 14);
    word |= (sigs.MemWrite << 13);

    return word >>> 0;
  }
}
