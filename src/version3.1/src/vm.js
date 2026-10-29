import {
  DEFAULT_CODE_START,
  FLAG_ZERO,
} from './constants.js';
import { calculateConditionFlag } from './utils/condition-codes.js';
import { InstructionDescriber } from './cpu/instruction-describer.js';
import { Assembler } from './assembler/assembler.js';
import { RegisterFile } from './storage/register-file.js';
import { Latches } from './storage/latches.js';
import { MemoryBusInterface } from './memory/bus-interface.js';
import { ClockGenerator } from './clock/clock-generator.js';
import { CpuPipeline } from './cpu/cpu-pipeline.js';

/**
 * Virtual Machine (VM) - Version 3.1
 *
 * Multi-Cycle CPU Datapath driven by Physical Clock Generator:
 *   - ClockGenerator: Physical quartz crystal oscillator emitting clock cycles.
 *   - Multi-Cycle Micro-Stepping: Each instruction takes multiple clock cycles:
 *       • ADD: 5 clock cycles (Fetch1 -> Fetch2 -> Fetch3 -> Decode -> Execute/WB)
 *       • LD : 6 clock cycles (Fetch1 -> Fetch2 -> Fetch3 -> Decode -> AddressCalc -> Memory/WB)
 *   - Two Operational Granularities:
 *       • vm.tick(): Advances CPU by a single physical clock cycle (Micro-step).
 *       • vm.step(): Runs multiple clock ticks until instruction finishes (Macro-step).
 *   - Central Internal Bus (InternalBus): Connects Latches and RegisterFile via tri-state gates.
 *   - MemoryBusInterface: Mediates access to RAM strictly via MAR and MDR.
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
   * Resets VM components and clock generator to initial state.
   */
  reset() {
    this.clock = new ClockGenerator();
    this.bus = new MemoryBusInterface();
    this.regFile = new RegisterFile();
    this.latches = new Latches(DEFAULT_CODE_START, FLAG_ZERO);
    this.pipeline = new CpuPipeline(this);
    this.halted = false;
    this.codeStart = DEFAULT_CODE_START;
    this.codeEnd = undefined;
    this.instructionCount = 0;
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

    this.bus.loadEntries(assembled.memoryEntries);

    this.codeStart = startAddress;
    this.codeEnd = startAddress + assembled.code.length;
    this.latches.latchPC(startAddress);
    this.pipeline.reset();
    return assembled;
  }

  /**
   * MICRO-STEP: Advances the CPU by a single physical clock cycle.
   *
   * @returns {object|null} Clock cycle micro-operation record or null if halted
   */
  tick() {
    if (this.halted) {
      return null;
    }

    const tickResult = this.pipeline.tick();
    if (!tickResult) {
      return null;
    }

    if (tickResult.instructionComplete) {
      this.instructionCount++;
    }

    return tickResult;
  }

  /**
   * MACRO-STEP: Runs multiple clock ticks until the current instruction cycle finishes.
   *
   * @returns {object|null} Completed instruction execution details or null if halted
   */
  step() {
    if (this.halted) {
      console.log('VM is halted. Cannot step.');
      return null;
    }

    if (this.codeEnd !== undefined && this.latches.PC >= this.codeEnd && this.pipeline.microStep === 0) {
      this.halted = true;
      return null;
    }

    const pipelineResult = this.pipeline.step();
    if (!pipelineResult) {
      return null;
    }

    this.instructionCount++;

    const description = InstructionDescriber.describe({
      pc: pipelineResult.pc,
      instruction: pipelineResult.instruction,
      decoded: pipelineResult.decoded,
      execution: pipelineResult.execution,
      ifHardwareEvents: [],
      vm: this,
    });

    return {
      pc: pipelineResult.pc,
      instruction: pipelineResult.instruction,
      decoded: pipelineResult.decoded,
      execution: pipelineResult.execution,
      cyclesTaken: pipelineResult.cyclesTaken,
      microCycles: pipelineResult.microCycles,
      description,
    };
  }

  /**
   * Updates the Processor Status Register (PSR) condition codes.
   *
   * @param {number} registerIndex - Index of register in RegisterFile
   */
  setCC(registerIndex) {
    const val = this.regFile.readPortA(registerIndex);
    this.latches.latchPSR(calculateConditionFlag(val));
  }

  /**
   * Automatically executes the program until completion or a step limit is reached.
   *
   * @param {string[]} [program] - Optional assembly program to load and run
   * @param {number|Function|object|string} [options] - Execution options:
   *        - number: maximum number of steps
   *        - Function: callback `onStep(vm, stepResult, stepCount)` invoked after each step
   *        - object: `{ maxSteps, onStep, verbose, microVerbose }`
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
    let microVerbose = false;

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
      if (options.microVerbose) microVerbose = true;
    }

    let steps = 0;
    while (!this.halted && steps < maxSteps) {
      if (this.codeEnd !== undefined && this.latches.PC >= this.codeEnd && this.pipeline.microStep === 0) {
        this.halted = true;
        break;
      }

      const stepResult = this.step();
      if (!stepResult) break;
      steps++;

      if (verbose) {
        console.log(`\n=================== STEP ${steps} (Instruction @ ${stepResult.pc}) ===================`);
        console.log(stepResult.description.formatted);
        console.log(`\n  [Clock Cycles Elapsed for this Instruction: ${stepResult.cyclesTaken} cycles]`);
        if (microVerbose && stepResult.microCycles) {
          console.log(`  Clock Micro-Operations:`);
          stepResult.microCycles.forEach((m) => {
            console.log(`    • Cycle ${m.cycle}: ${m.microOp}`);
          });
        }
      }

      if (onStep) {
        onStep(this, stepResult, steps);
      }
    }

    return this;
  }
}
