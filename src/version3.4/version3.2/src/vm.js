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
import { ClockGenerator } from './clock/clock-generator.js';
import { CpuPipeline } from './cpu/cpu-pipeline.js';

/**
 * Virtual Machine (VM) - Version 3.2
 *
 * Microcoded FSM Control Sequencer Architecture:
 *   - MicroSequencer: Drives datapath cycle-by-cycle using Control Store ROM and Micro-Program Counter (uPC).
 *   - ClockGenerator: Physical quartz crystal oscillator emitting clock cycles.
 *   - Authentic LC-3 Micro-States:
 *       • State 18: Fetch 1 (MAR <= PC, MemRead=1)
 *       • State 33: Fetch 2 (MDR <= RAM[MAR])
 *       • State 35: Fetch 3 (IR <= MDR, PC <= PC + 1)
 *       • State 32: Decode  (Micro-branch on opcode)
 *       • State 1 : ADD Execute & Write-Back (Returns to State 18) [5 cycles]
 *       • State 2 : LD Address Calc (Advances to State 25)
 *       • State 25: LD Memory Read & Write-Back (Returns to State 18) [6 cycles]
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
   * Accessor for current Micro-Program Counter (uPC).
   */
  get uPC() {
    return this.pipeline.uPC;
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
   * MICRO-STEP: Advances the CPU by a single physical clock cycle
   * driven by the Microcoded FSM Control Sequencer.
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

    if (this.codeEnd !== undefined && this.latches.PC >= this.codeEnd && this.pipeline.currentInstruction.cycleRecords.length === 0) {
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
      stages: pipelineResult.stages,
      pipeline: pipelineResult.stages,
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
      if (this.codeEnd !== undefined && this.latches.PC >= this.codeEnd && this.pipeline.currentInstruction.cycleRecords.length === 0) {
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
          console.log(`  Microcode FSM State Sequence:`);
          stepResult.microCycles.forEach((m) => {
            console.log(`    • Cycle ${m.cycle} -> uPC State ${m.uPC}: ${m.microOp}`);
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
