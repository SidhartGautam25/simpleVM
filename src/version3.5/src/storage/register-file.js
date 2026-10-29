import { toUint16 } from '../utils/bit-utils.js';

/**
 * Register File (RF) - Storage Module
 *
 * Models a hardware 8-register multi-port register file (R0 through R7).
 *
 * Hardware Characteristics:
 * - 8 General-Purpose Registers (16-bit each).
 * - Dual Read Ports (Port A and Port B): Combinational, read without modifying state.
 * - Single Write Port: Gated by `writeEnable` (RegWrite control line).
 * - Writing only occurs when writeEnable is true.
 */
export class RegisterFile {
  /**
   * @param {number} [numRegisters=8] - Number of general purpose registers (LC-3 has 8)
   */
  constructor(numRegisters = 8) {
    this.numRegisters = numRegisters;
    this.registers = new Uint16Array(numRegisters);
    this.lastWrite = null;
  }

  /**
   * Validates register index is within range [0..7].
   *
   * @param {number} index
   */
  _validateIndex(index) {
    if (typeof index !== 'number' || index < 0 || index >= this.numRegisters) {
      throw new RangeError(
        `Invalid register index R${index}. Must be between R0 and R${this.numRegisters - 1}.`
      );
    }
  }

  /**
   * Combinational Read Port A (typically for Source Register 1 - SR1).
   *
   * @param {number} regIndex - Register index (0-7)
   * @returns {number} 16-bit register value
   */
  readPortA(regIndex) {
    this._validateIndex(regIndex);
    return this.registers[regIndex];
  }

  /**
   * Combinational Read Port B (typically for Source Register 2 - SR2).
   *
   * @param {number} regIndex - Register index (0-7)
   * @returns {number} 16-bit register value
   */
  readPortB(regIndex) {
    this._validateIndex(regIndex);
    return this.registers[regIndex];
  }

  /**
   * General read helper (alias for Port A read).
   *
   * @param {number} regIndex
   * @returns {number}
   */
  read(regIndex) {
    return this.readPortA(regIndex);
  }

  /**
   * Synchronous Write Port (typically for Destination Register - DR).
   *
   * In hardware, data is only latched into the register file when the
   * `writeEnable` (RegWrite) control line is HIGH on the clock transition.
   *
   * @param {number} regIndex - Destination register index (0-7)
   * @param {number} value - 16-bit value to write
   * @param {boolean} [writeEnable=true] - Hardware RegWrite control signal
   * @returns {{ regIndex: number, value: number, prevValue: number, written: boolean }}
   */
  write(regIndex, value, writeEnable = true) {
    this._validateIndex(regIndex);

    const prevValue = this.registers[regIndex];

    if (!writeEnable) {
      this.lastWrite = {
        regIndex,
        value: toUint16(value),
        prevValue,
        written: false,
      };
      return this.lastWrite;
    }

    const uint16Val = toUint16(value);
    this.registers[regIndex] = uint16Val;

    this.lastWrite = {
      regIndex,
      value: uint16Val,
      prevValue,
      written: true,
    };

    return this.lastWrite;
  }

  /**
   * Resets all registers R0-R7 to 0x0000.
   */
  reset() {
    this.registers.fill(0);
    this.lastWrite = null;
  }

  /**
   * Returns a snapshot array of all 8 register values.
   *
   * @returns {number[]} Array of 16-bit values [R0, R1, ..., R7]
   */
  snapshot() {
    return Array.from(this.registers);
  }
}

