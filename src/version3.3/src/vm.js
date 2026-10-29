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
 * Virtual Machine (VM) - Version 3.3
 *
 * Memory-Mapped I/O & Bus Address Decoder Architecture:
 *   - AddressDecoder: Monitored address bus (Range 0x0000-0xFDFF: RAM, Range 0xFE00-0xFFFF: MMIO Device Registers).
 *   - Hardware Device Registers:
 *       • 0xFE00 (KBSR): Keyboard Status Register (Bit 15 = Ready bit)
 *       • 0xFE02 (KBDR): Keyboard Data Register (Reading clears KBSR ready bit)
 *       • 0xFE04 (DSR) : Display Status Register (Bit 15 = Ready bit)
 *       • 0xFE06 (DDR) : Display Data Register (Writing transmits character to screen buffer)
 *   - MicroSequencer: Drives datapath cycle-by-cycle using Control Store ROM and Micro-Program Counter (uPC).
 *   - ClockGenerator: Physical quartz crystal oscillator emitting clock cycles.
 *   - Two Operational Granularities:
 *       • vm.tick(): Advances CPU by a single physical clock cycle (Micro-step).
 *       • vm.step(): Runs multiple clock ticks until instruction finishes (Macro-step).
 *   - Central Internal Bus (InternalBus): Connects Latches and RegisterFile via tri-state gates.
 *   - MemoryBusInterface: Mediates access strictly via MAR, MDR, and AddressDecoder.
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
   * Accessor for Address Decoder instance.
   */
  get addressDecoder() {
    return this.bus.addressDecoder;
  }

  /**
   * Accessor for current MMIO device register snapshot.
   */
  get mmioState() {
    return this.bus.addressDecoder.snapshot();
  }

  /**
   * Simulates a user typing a key on the physical keyboard.
   *
   * @param {string} char
   */
  typeChar(char) {
    return this.bus.typeChar(char);
  }

  /**
   * Queues a string of characters in the keyboard buffer.
   *
   * @param {string} text
   */
  queueInput(text) {
    return this.bus.queueInput(text);
  }

  /**
   * Returns text emitted to the physical display screen via DDR (0xFE06).
   *
   * @returns {string}
   */
  getDisplayOutput() {
    return this.bus.getDisplayOutput();
  }

  /**
   * Clears the display screen output buffer.
   */
  clearDisplayOutput() {
    return this.bus.clearDisplayOutput();
  }

  /**
   * Performs an authentic hardware Memory Read Bus Cycle via MAR and MDR
   * through the Address Decoder.
   *
   * @param {number} address
   * @returns {number}
   */
  readMemory(address) {
    this.latches.latchMAR(address);
    return this.bus.readCycle(this.latches, true);
  }

  /**
   * Performs an authentic hardware Memory Write Bus Cycle via MAR and MDR
   * through the Address Decoder.
   *
   * @param {number} address
   * @param {number} value
   * @returns {boolean}
   */
  writeMemory(address, value) {
    this.latches.latchMAR(address);
    this.latches.latchMDR(value);
    return this.bus.writeCycle(this.latches, true);
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
