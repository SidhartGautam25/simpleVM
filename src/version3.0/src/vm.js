import {
  DEFAULT_CODE_START,
  FLAG_ZERO,
} from './constants.js';
import { calculateConditionFlag } from './utils/condition-codes.js';
import { InstructionDecoder } from './cpu/instruction-decoder.js';
import { INSTRUCTION_DISPATCH_TABLE } from './cpu/instruction-handlers.js';
import { InstructionDescriber } from './cpu/instruction-describer.js';
import { Assembler } from './assembler/assembler.js';
import { RegisterFile } from './storage/register-file.js';
import { Latches } from './storage/latches.js';
import { MemoryBusInterface } from './memory/bus-interface.js';
import { CpuPipeline } from './cpu/cpu-pipeline.js';

/**
 * Virtual Machine (VM) - Version 2.4
 *
 * Micro-architectural Pipelined Datapath Architecture:
 *   - CpuPipeline: Orchestrates the sequential execution of the 5 distinct phases:
 *       1. phaseFetch()     (IF)
 *       2. phaseDecode()    (ID)
 *       3. phaseExecute()   (EX)
 *       4. phaseMemory()    (MEM)
 *       5. phaseWriteBack() (WB)
 *   - MemoryBusInterface: Mediates RAM access strictly via MAR and MDR with MemRead/MemWrite control lines.
 *   - ControlUnit: Generates micro-architectural control wire signals.
 *   - ALU: 16-bit execution unit with hardware condition flag evaluation.
 *   - RegisterFile: 8 general-purpose registers (R0-R7) with dual read ports and gated write port.
 *   - Latches: Special CPU registers (PC, IR, MAR, MDR, PSR).
 */
export default class VM {
  constructor() {
    this.reset();
  }

  /**
   * Accessor for RAM array (provided for direct inspection / tests).
   */
  get mem() {
    return this.bus.ram;
  }

  /**
   * Resets VM Memory Bus, Register File, Hardware Latches, and Pipeline to initial state.
   */
  reset() {
    this.bus = new MemoryBusInterface();
    this.regFile = new RegisterFile();
    this.latches = new Latches(DEFAULT_CODE_START, FLAG_ZERO);
    this.pipeline = new CpuPipeline(this);
    this.halted = false;
    this.codeStart = DEFAULT_CODE_START;
    this.codeEnd = undefined;
  }

  /**
   * Assembles and loads an assembly program and its literal pool into RAM
   * via the Memory Bus direct loading interface.
   *
   * @param {string[]} program - Array of assembly instruction strings
   * @param {number} [startAddress=DEFAULT_CODE_START] - Memory address to load program at
   * @returns {object} Assembled program metadata
   */
  load(program, startAddress = DEFAULT_CODE_START) {
    const assembler = new Assembler(startAddress);
    const assembled = assembler.assemble(program);

    // Populate RAM via direct loader interface (modeling ROM flashing/DMA)
    this.bus.loadEntries(assembled.memoryEntries);

    this.codeStart = startAddress;
    this.codeEnd = startAddress + assembled.code.length;
    this.latches.latchPC(startAddress);
    this.pipeline.reset();
    return assembled;
  }

  /**
   * Executes a single instruction through the sequential 5-phase CPU pipeline.
   *
   * @returns {object|null} Step execution details and description or null if halted
   */
  step() {
    if (this.halted) {
      console.log('VM is halted. Cannot step.');
      return null;
    }

    if (this.codeEnd !== undefined && this.latches.PC >= this.codeEnd) {
      this.halted = true;
      return null;
    }

    // =========================================================
    // SEQUENTIAL 5-PHASE CPU PIPELINE ORCHESTRATION
    // phaseFetch -> phaseDecode -> phaseExecute -> phaseMemory -> phaseWriteBack
    // =========================================================
    const pipelineResult = this.pipeline.step();

    const description = InstructionDescriber.describe({
      pc: pipelineResult.pc,
      instruction: pipelineResult.instruction,
      decoded: pipelineResult.decoded,
      execution: pipelineResult.execution,
      ifHardwareEvents: pipelineResult.stages.IF.hardwareEvents,
      vm: this,
    });

    return {
      pc: pipelineResult.pc,
      instruction: pipelineResult.instruction,
      decoded: pipelineResult.decoded,
      execution: pipelineResult.execution,
      stages: pipelineResult.stages,
      pipeline: pipelineResult.stages,
      description,
    };
  }

  /**
   * Updates the Processor Status Register (PSR) condition codes
   * based on the value in the specified register.
   *
   * @param {number} registerIndex - Index of register in RegisterFile
   */
  setCC(registerIndex) {
    const val = this.regFile.readPortA(registerIndex);
    this.latches.latchPSR(calculateConditionFlag(val));
  }

  /**
   * Decodes and executes an instruction word using the dispatch table.
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
   * @param {number|Function|object|string} [options] - Execution options:
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
      if (this.codeEnd !== undefined && this.latches.PC >= this.codeEnd) {
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
