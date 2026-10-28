import { toUint16 } from '../utils/bit-utils.js';
import { DEFAULT_CODE_START, FLAG_ZERO } from '../constants.js';

/**
 * Hardware Latches & Special Registers - Version 2.2
 *
 * Models the dedicated internal hardware storage latches of the CPU:
 * - PC  (Program Counter): Holds the address of the instruction being fetched / next instruction.
 * - IR  (Instruction Register): Holds the 16-bit word currently being executed.
 * - MAR (Memory Address Register): Holds the address currently driven onto the memory address bus.
 * - MDR (Memory Data Register): Holds the data read from or being written to the memory data bus.
 * - PSR (Processor Status Register): Holds condition code flags (Negative, Zero, Positive).
 */
export class Latches {
  /**
   * @param {number} [defaultCodeStart=DEFAULT_CODE_START]
   * @param {number} [defaultPsr=FLAG_ZERO]
   */
  constructor(defaultCodeStart = DEFAULT_CODE_START, defaultPsr = FLAG_ZERO) {
    this.defaultCodeStart = defaultCodeStart;
    this.defaultPsr = defaultPsr;
    this.reset();
  }

  // --- Getters and Setters with 16-bit bounds ---

  get PC() {
    return this._pc;
  }
  set PC(val) {
    this._pc = toUint16(val);
  }

  get IR() {
    return this._ir;
  }
  set IR(val) {
    this._ir = toUint16(val);
  }

  get MAR() {
    return this._mar;
  }
  set MAR(val) {
    this._mar = toUint16(val);
  }

  get MDR() {
    return this._mdr;
  }
  set MDR(val) {
    this._mdr = toUint16(val);
  }

  get PSR() {
    return this._psr;
  }
  set PSR(val) {
    this._psr = toUint16(val);
  }

  // --- Latch Operations (Mimicking clock edge transitions) ---

  /**
   * Latches an address into the Memory Address Register (MAR).
   *
   * @param {number} address
   * @returns {number}
   */
  latchMAR(address) {
    this.MAR = address;
    return this.MAR;
  }

  /**
   * Latches data into the Memory Data Register (MDR).
   *
   * @param {number} data
   * @returns {number}
   */
  latchMDR(data) {
    this.MDR = data;
    return this.MDR;
  }

  /**
   * Latches an instruction word into the Instruction Register (IR).
   *
   * @param {number} instruction
   * @returns {number}
   */
  latchIR(instruction) {
    this.IR = instruction;
    return this.IR;
  }

  /**
   * Updates the Program Counter (PC).
   *
   * @param {number} nextPc
   * @returns {number}
   */
  latchPC(nextPc) {
    this.PC = nextPc;
    return this.PC;
  }

  /**
   * Latches new condition code flag into the Processor Status Register (PSR).
   *
   * @param {number} conditionFlag
   * @returns {number}
   */
  latchPSR(conditionFlag) {
    this.PSR = conditionFlag;
    return this.PSR;
  }

  /**
   * Resets all latches to their initial states.
   */
  reset() {
    this._pc = this.defaultCodeStart;
    this._ir = 0;
    this._mar = 0;
    this._mdr = 0;
    this._psr = this.defaultPsr;
  }

  /**
   * Returns a snapshot object of all current latch values.
   *
   * @returns {{ PC: number, IR: number, MAR: number, MDR: number, PSR: number }}
   */
  snapshot() {
    return {
      PC: this.PC,
      IR: this.IR,
      MAR: this.MAR,
      MDR: this.MDR,
      PSR: this.PSR,
    };
  }
}
