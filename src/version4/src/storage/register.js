/**
 * Stage 8: N-Bit Synchronous Register
 *
 * Built from N positive-edge-triggered D Flip-Flops.
 * Supports:
 *   - Parallel load with Load Enable signal (`load`)
 *   - Synchronous Reset (`reset`)
 *   - Current state output (bit array and integer value)
 *   - Two-phase update to guarantee deterministic clock edges without race conditions.
 */

import { DFlipFlop } from './d-flip-flop.js';
import { intToBits, bitsToUnsigned, formatBitString } from '../logic/bit-utils.js';

export class Register {
  /**
   * @param {number} width - Number of bits (e.g. 16)
   * @param {string} [name='REG'] - Register name for debugging/tracing
   * @param {number} [initialValue=0]
   */
  constructor(width = 16, name = 'REG', initialValue = 0) {
    this.width = width;
    this.name = name;
    this.flipFlops = new Array(width);

    const initialBits = intToBits(initialValue, width);
    for (let i = 0; i < width; i++) {
      this.flipFlops[i] = new DFlipFlop(initialBits[i]);
    }
  }

  /**
   * Reads current register output as an array of binary bits (MSB at index 0).
   * @returns {number[]}
   */
  readBits() {
    return this.flipFlops.map((ff) => ff.output);
  }

  /**
   * Reads current register output as an unsigned integer.
   * @returns {number}
   */
  readUint() {
    return bitsToUnsigned(this.readBits());
  }

  /**
   * Pre-edge evaluation:
   * Sets up next-state values for all N flip-flops based on input and control signals.
   *
   * @param {number[]|number} data - Bit array or integer value
   * @param {number} [loadEnable=1] - 1 to capture new data, 0 to hold old value
   * @param {number} [reset=0] - 1 to clear register to 0
   */
  prepare(data, loadEnable = 1, reset = 0) {
    const bits = Array.isArray(data) ? data : intToBits(data, this.width);
    if (bits.length !== this.width) {
      throw new Error(
        `Register ${this.name} width is ${this.width}, received ${bits.length} bits.`
      );
    }

    for (let i = 0; i < this.width; i++) {
      this.flipFlops[i].prepare(bits[i], loadEnable, reset);
    }
  }

  /**
   * Commits the prepared state on the active rising clock edge.
   */
  commit() {
    for (let i = 0; i < this.width; i++) {
      this.flipFlops[i].commit();
    }
    return this.readUint();
  }

  /**
   * Directly sets the register state (used for initialization/reset).
   */
  forceValue(value) {
    const bits = intToBits(value, this.width);
    for (let i = 0; i < this.width; i++) {
      this.flipFlops[i].prepare(bits[i], 1, 0);
      this.flipFlops[i].commit();
    }
  }

  /**
   * Formats for tracing and debugging.
   */
  inspect() {
    const val = this.readUint();
    const hex = '0x' + val.toString(16).padStart(4, '0').toUpperCase();
    const bits = formatBitString(this.readBits());
    return `${this.name.padEnd(4)}: ${hex} (${String(val).padStart(5)}) [${bits}]`;
  }
}

