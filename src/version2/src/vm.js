import {
  ADDR_MAX,
  DEFAULT_CODE_START,
  REG_PC,
  REG_PSR,
  REG_COUNT,
  FLAG_ZERO,
} from './constants.js';
import { calculateConditionFlag } from './utils/condition-codes.js';
import { InstructionDecoder } from './cpu/instruction-decoder.js';
import { INSTRUCTION_DISPATCH_TABLE } from './cpu/instruction-handlers.js';
import { InstructionDescriber } from './cpu/instruction-describer.js';
import { Assembler } from './assembler/assembler.js';

/**
 * Virtual Machine (VM) - Version 2
 *
 * Implements a clean LC-3 instruction-cycle architecture:
 *   - Fetch: Reads instruction from memory at PC, increments PC
 *   - Decode: InstructionDecoder unpacks 16-bit word into fields
 *   - Execute: INSTRUCTION_DISPATCH_TABLE dispatches to dedicated handler
 */
export default class VM {
  constructor() {
    this.reset();
  }

  /**
   * Resets VM memory, registers, and flags to clean initial state.
   */
  reset() {
    this.mem = new Uint16Array(ADDR_MAX + 1);
    this.reg = new Uint16Array(REG_COUNT);
    this.reg[REG_PC] = DEFAULT_CODE_START;
    this.reg[REG_PSR] = FLAG_ZERO;
    this.halted = false;
    this.codeStart = DEFAULT_CODE_START;
    this.codeEnd = undefined;
  }

  /**
   * Assembles and loads an assembly program and its literal pool into memory.
   *
   * @param {string[]} program - Array of assembly instruction strings
   * @param {number} [startAddress=DEFAULT_CODE_START] - Memory address to load the program at
   * @returns {object} Assembled program metadata
   */
  load(program, startAddress = DEFAULT_CODE_START) {
    const assembler = new Assembler(startAddress);
    const assembled = assembler.assemble(program);

    for (const { address, value } of assembled.memoryEntries) {
      this.mem[address] = value;
    }

    this.codeStart = startAddress;
    this.codeEnd = startAddress + assembled.code.length;
    this.reg[REG_PC] = startAddress;
    return assembled;
  }

  /**
   * Executes a single instruction at the current Program Counter (PC).
   *
   * @returns {object|null} Step execution details and description or null if halted
   */
  step() {
    if (this.halted) {
      console.log('VM is halted. Cannot step.');
      return null;
    }

    if (this.codeEnd !== undefined && this.reg[REG_PC] >= this.codeEnd) {
      this.halted = true;
      return null;
    }

    const currentPc = this.reg[REG_PC];
    const instruction = this.mem[currentPc];
    this.reg[REG_PC] = (currentPc + 1) & ADDR_MAX;

    const { decoded, execution } = this.perform(instruction);
    const description = InstructionDescriber.describe({
      pc: currentPc,
      instruction,
      decoded,
      execution,
      vm: this,
    });

    return {
      pc: currentPc,
      instruction,
      decoded,
      execution,
      description,
    };
  }

  /**
   * Sets the Processor Status Register (PSR) condition codes (N, Z, P)
   * based on the value in the specified register.
   *
   * @param {number} registerIndex - Index of register to evaluate
   */
  setCC(registerIndex) {
    this.reg[REG_PSR] = calculateConditionFlag(this.reg[registerIndex]);
  }

  /**
   * Decodes and executes a 16-bit instruction word using the dispatch table.
   *
   * @param {number} instruction - 16-bit instruction word
   * @returns {{ decoded: object, execution: object|null }}
   */
  perform(instruction) {
    const decoded = InstructionDecoder.decode(instruction);
    const handler = INSTRUCTION_DISPATCH_TABLE[decoded.opcode];

    if (!handler) {
      console.warn(`Unhandled or invalid opcode: 0b${decoded.opcode.toString(2).padStart(4, '0')}`);
      return { decoded, execution: null };
    }

    const execution = handler(this, decoded);
    return { decoded, execution };
  }

  /**
   * Automatically executes the program until completion or a step limit is reached.
   *
   * @param {string[]} [program] - Optional assembly program to load and run
   * @param {number|Function|object|string} [options] - Configuration options:
   *        - number: maximum number of steps
   *        - Function: callback `onStep(vm, stepResult, stepCount)` invoked after each step
   *        - object: `{ maxSteps, onStep, verbose }`
   *        - string: 'verbose' to log detailed descriptions automatically
   * @returns {VM} this instance for method chaining
   */
  run(program, options = {}) {
    if (program) {
      this.reset();
      this.load(program);
    }

    let maxSteps = Infinity;
    let onStep = null;
    let verbose = false;

    if (typeof options === 'number') {
      maxSteps = options;
    } else if (typeof options === 'function') {
      onStep = options;
    } else if (typeof options === 'string' && options.toLowerCase() === 'verbose') {
      verbose = true;
    } else if (typeof options === 'object' && options !== null) {
      if (typeof options.maxSteps === 'number') maxSteps = options.maxSteps;
      if (typeof options.onStep === 'function') onStep = options.onStep;
      if (options.verbose) verbose = true;
    }

    let steps = 0;
    while (!this.halted && steps < maxSteps) {
      if (this.codeEnd !== undefined && this.reg[REG_PC] >= this.codeEnd) {
        this.halted = true;
        break;
      }

      const stepResult = this.step();
      if (!stepResult) break;
      steps++;

      if (verbose) {
        console.log(`\n=================== STEP ${steps} ===================`);
        console.log(stepResult.description.formatted);
      }

      if (onStep) {
        onStep(this, stepResult, steps);
      }
    }

    return this;
  }
}

