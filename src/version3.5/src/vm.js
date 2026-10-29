import {
  DEFAULT_CODE_START,
  FLAG_ZERO,
} from './constants.js';
import { InstructionDescriber } from './cpu/instruction-describer.js';
import { Assembler } from './assembler/assembler.js';
import { RegisterFile } from './storage/register-file.js';
import { Latches } from './storage/latches.js';
import { MemoryBusInterface } from './memory/bus-interface.js';
import { ClockGenerator } from './clock/clock-generator.js';
import { CpuPipeline } from './cpu/cpu-pipeline.js';

/**
 * Virtual Machine (VM) - Version 3.5
 *
 * True In-Flight Pipelined Datapath with Hazard & Forwarding Units:
 *   - 5-Stage Concurrent Pipeline: IF, ID, EX, MEM, WB operating in parallel every clock cycle.
 *   - Forwarding / Bypassing Unit: EX->EX and MEM->EX ALU operand bypasses for back-to-back RAW dependencies (0 stalls).
 *   - Hazard Detection Unit & Pipeline Interlocks: Detects Load-Use hazards and injects NOP bubble stalls (1 stall cycle).
 *   - High Instruction Throughput: IPC approaching 1.0 (CPI ≈ 1.0) compared to multi-cycle non-pipelined execution.
 *   - Unified 3-Part System Bus (AddressBus, DataBus, ControlBus) & Bus Address Decoder (RAM and MMIO).
 *   - Two Granularities of Execution:
 *       • vm.tick(): Micro-step advancing the CPU datapath by 1 physical clock cycle.
 *       • vm.step(): Macro-step advancing clock cycles until the next instruction graduates from WB.
 */
export default class VM {
  constructor() {
    this.reset();
  }

  /**
   * Accessor for RAM array.
   */
  get mem() {
    return this.bus.ram;
  }

  /**
   * Current Instructions Per Cycle (IPC).
   */
  get ipc() {
    return this.pipeline.ipc;
  }

  /**
   * Current Cycles Per Instruction (CPI).
   */
  get cpi() {
    return this.pipeline.cpi;
  }

  /**
   * Accessor for Hazard Unit.
   */
  get hazardUnit() {
    return this.pipeline.hazardUnit;
  }

  /**
   * Accessor for Pipeline Cycle History.
   */
  get cycleRecords() {
    return this.pipeline.cycleRecords;
  }

  /**
   * Accessor for Graduated Instruction History.
   */
  get graduatedRecords() {
    return this.pipeline.graduatedRecords;
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
   * Performs a hardware Memory Read Bus Cycle via MAR and MDR.
   *
   * @param {number} address
   * @returns {number}
   */
  readMemory(address) {
    this.latches.latchMAR(address);
    return this.bus.readCycle(this.latches, 1);
  }

  /**
   * Performs a hardware Memory Write Bus Cycle via MAR and MDR.
   *
   * @param {number} address
   * @param {number} value
   * @returns {boolean}
   */
  writeMemory(address, value) {
    this.latches.latchMAR(address);
    this.latches.latchMDR(value);
    return this.bus.writeCycle(this.latches, 1);
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
   * Assembles and loads an assembly program into RAM via the Memory Bus DMA loader.
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
   * MICRO-STEP: Advances the CPU datapath by a single physical clock cycle.
   * Concurrently processes all 5 pipeline stages and handles hazards.
   *
   * @returns {object|null} Clock cycle record or null if halted
   */
  tick() {
    if (this.halted) {
      return null;
    }

    const tickResult = this.pipeline.tick();
    if (!tickResult) {
      return null;
    }

    if (tickResult.graduated) {
      this.instructionCount++;
    }

    return tickResult;
  }

  /**
   * MACRO-STEP: Runs clock ticks until the next instruction graduates from WB
   * or the pipeline drains and halts.
   *
   * @returns {object|null} Graduated instruction execution report or null if halted
   */
  step() {
    if (this.halted) {
      return null;
    }

    const grad = this.pipeline.step();
    if (!grad) {
      return null;
    }

    this.instructionCount = this.pipeline.graduatedInstructions;

    const description = InstructionDescriber.describe({
      pc: grad.pc,
      instruction: grad.rawInstruction,
      decoded: grad.decoded,
      execution: grad,
      vm: this,
    });

    return {
      pc: grad.pc,
      instruction: grad.rawInstruction,
      decoded: grad.decoded,
      execution: grad,
      description,
    };
  }

  /**
   * Runs the loaded program to completion until the pipeline drains and VM halts.
   *
   * @param {number} [maxInstructions=1000] - Safety limit
   * @returns {Array<object>} Array of graduated instruction results
   */
  run(maxInstructions = 1000) {
    const results = [];
    let count = 0;

    while (!this.halted && count < maxInstructions) {
      const result = this.step();
      if (!result) break;
      results.push(result);
      count++;
    }

    return results;
  }

  /**
   * Formats the ASCII reservation table and hazard summary.
   *
   * @param {number} [maxCycles=25]
   * @returns {string}
   */
  describePipeline(maxCycles = 25) {
    const table = InstructionDescriber.describePipelineReservationTable(this.cycleRecords, maxCycles);
    const summary = InstructionDescriber.describeHazardSummary(this);
    return `${table}\n\n${summary}`;
  }
}
