import { OPCODE } from '../constants.js';

/**
 * Micro-Instruction Word Conditions for Next-State Generation
 */
export const COND = {
  UNCONDITIONAL: 'UNCONDITIONAL',
  BRANCH_OPCODE: 'BRANCH_OPCODE',
};

/**
 * Control Store ROM (Microcode ROM) - Version 3.2
 *
 * Implements the authentic LC-3 microcode state machine (Patt & Patel standard state assignments):
 *   - State 18: Fetch 1 (Drive PC to MAR via Central Bus, assert MemRead)
 *   - State 33: Fetch 2 (Memory read cycle completes -> MDR)
 *   - State 35: Fetch 3 (Drive MDR to IR via Central Bus, increment PC)
 *   - State 32: Decode  (Opcode PLA decode; micro-branch to State 1 for ADD, State 2 for LD)
 *   - State 1 : ADD Execution (ALU add, GateALU onto Central Bus, LD_REG, LD_CC -> Return to State 18)
 *   - State 2 : LD Address Calc (PC + SEXT9, GateMARMUX onto Central Bus, LD_MAR, MemRead)
 *   - State 25: LD Memory Read (Memory bus read cycle completes -> MDR)
 *   - State 27: LD Write-Back (GateMDR onto Central Bus, LD_REG, LD_CC -> Return to State 18)
 */
export const CONTROL_STORE_ROM = {
  18: {
    state: 18,
    name: 'FETCH_1 (MAR <= PC, MemRead=1)',
    signals: {
      GatePC: true,
      GateMDR: false,
      GateALU: false,
      GateMARMUX: false,
      LD_MAR: true,
      LD_MDR: false,
      LD_IR: false,
      LD_REG: false,
      LD_CC: false,
      MemRead: true,
      MemWrite: false,
      ALUSrc: 'NONE',
      ALUOp: 'NONE',
    },
    cond: COND.UNCONDITIONAL,
    nextState: 33,
    instructionComplete: false,
  },

  33: {
    state: 33,
    name: 'FETCH_2 (MDR <= RAM[MAR])',
    signals: {
      GatePC: false,
      GateMDR: false,
      GateALU: false,
      GateMARMUX: false,
      LD_MAR: false,
      LD_MDR: true,
      LD_IR: false,
      LD_REG: false,
      LD_CC: false,
      MemRead: true,
      MemWrite: false,
      ALUSrc: 'NONE',
      ALUOp: 'NONE',
    },
    cond: COND.UNCONDITIONAL,
    nextState: 35,
    instructionComplete: false,
  },

  35: {
    state: 35,
    name: 'FETCH_3 (IR <= MDR, PC <= PC + 1)',
    signals: {
      GatePC: false,
      GateMDR: true,
      GateALU: false,
      GateMARMUX: false,
      LD_MAR: false,
      LD_MDR: false,
      LD_IR: true,
      LD_REG: false,
      LD_CC: false,
      MemRead: false,
      MemWrite: false,
      ALUSrc: 'NONE',
      ALUOp: 'NONE',
    },
    cond: COND.UNCONDITIONAL,
    nextState: 32,
    instructionComplete: false,
  },

  32: {
    state: 32,
    name: 'DECODE (Branch on Opcode)',
    signals: {
      GatePC: false,
      GateMDR: false,
      GateALU: false,
      GateMARMUX: false,
      LD_MAR: false,
      LD_MDR: false,
      LD_IR: false,
      LD_REG: false,
      LD_CC: false,
      MemRead: false,
      MemWrite: false,
      ALUSrc: 'REG',
      ALUOp: 'NONE',
    },
    cond: COND.BRANCH_OPCODE,
    opcodeMap: {
      [OPCODE.ADD]: 1, // Branch to State 1 for ADD
      [OPCODE.LD]:  2, // Branch to State 2 for LD
    },
    nextState: 1, // Fallback
    instructionComplete: false,
  },

  1: {
    state: 1,
    name: 'ADD_EXECUTE_WB (ALU Add -> Central Bus -> RegFile[DR], LD_CC)',
    signals: {
      GatePC: false,
      GateMDR: false,
      GateALU: true,
      GateMARMUX: false,
      LD_MAR: false,
      LD_MDR: false,
      LD_IR: false,
      LD_REG: true,
      LD_CC: true,
      MemRead: false,
      MemWrite: false,
      ALUSrc: 'DYNAMIC', // Selected by immFlag
      ALUOp: 'ADD',
    },
    cond: COND.UNCONDITIONAL,
    nextState: 18, // Return to Fetch
    instructionComplete: true,
  },

  2: {
    state: 2,
    name: 'LD_ADDR_CALC (MAR <= PC + SEXT9(offset9), MemRead=1)',
    signals: {
      GatePC: false,
      GateMDR: false,
      GateALU: false,
      GateMARMUX: true,
      LD_MAR: true,
      LD_MDR: false,
      LD_IR: false,
      LD_REG: false,
      LD_CC: false,
      MemRead: true,
      MemWrite: false,
      ALUSrc: 'IMM',
      ALUOp: 'ADD',
    },
    cond: COND.UNCONDITIONAL,
    nextState: 25,
    instructionComplete: false,
  },

  25: {
    state: 25,
    name: 'LD_MEM_READ (MDR <= RAM[MAR])',
    signals: {
      GatePC: false,
      GateMDR: true,
      GateALU: false,
      GateMARMUX: false,
      LD_MAR: false,
      LD_MDR: true,
      LD_IR: false,
      LD_REG: true,
      LD_CC: true,
      MemRead: true,
      MemWrite: false,
      ALUSrc: 'NONE',
      ALUOp: 'NONE',
    },
    cond: COND.UNCONDITIONAL,
    nextState: 18,
    instructionComplete: true,
  },
};

/**
 * Microcoded FSM Control Sequencer - Version 3.2
 *
 * Coordinates the CPU datapath cycle-by-cycle using a Micro-Program Counter (uPC)
 * and the Control Store ROM.
 */
export class MicroSequencer {
  constructor() {
    this.ENTRY_STATE = 18; // LC-3 standard Fetch entry state
    this.uPC = this.ENTRY_STATE;
    this.history = [];
  }

  /**
   * Resets the Micro-Program Counter to the initial Fetch state (State 18).
   */
  reset() {
    this.uPC = this.ENTRY_STATE;
    this.history = [];
  }

  /**
   * Fetches the current micro-instruction from the Control Store ROM.
   *
   * @returns {object} Micro-instruction word
   */
  get currentMicroInstruction() {
    return CONTROL_STORE_ROM[this.uPC] || CONTROL_STORE_ROM[this.ENTRY_STATE];
  }

  /**
   * Evaluates the next micro-state (uPC) based on current micro-instruction conditions and opcode.
   *
   * @param {number} [opcode] - Current instruction opcode from IR (for branching in State 32)
   * @returns {number} Next uPC address
   */
  computeNextState(opcode) {
    const microInst = this.currentMicroInstruction;

    if (microInst.cond === COND.BRANCH_OPCODE) {
      if (opcode !== undefined && microInst.opcodeMap[opcode] !== undefined) {
        return microInst.opcodeMap[opcode];
      }
      return microInst.nextState;
    }

    return microInst.nextState;
  }

  /**
   * Advances the Micro-Sequencer by one clock tick.
   *
   * @param {object} context - Execution context (e.g. { opcode })
   * @returns {{
   *   currentState: number,
   *   microInstruction: object,
   *   nextState: number,
   *   instructionComplete: boolean
   * }}
   */
  step(context = {}) {
    const currentState = this.uPC;
    const microInstruction = this.currentMicroInstruction;
    const nextState = this.computeNextState(context.opcode);

    this.history.push({
      cycleState: currentState,
      name: microInstruction.name,
      nextState,
    });

    this.uPC = nextState;

    return {
      currentState,
      microInstruction,
      nextState,
      instructionComplete: microInstruction.instructionComplete,
    };
  }
}
