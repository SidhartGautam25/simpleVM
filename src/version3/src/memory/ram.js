/**
 * Stage 12: Main Memory (RAM)
 *
 * Implements a 16-bit word-addressable memory system.
 * The address space supports addresses from 0x0000 to 0xFFFF (65,536 words).
 *
 * Memory Interface:
 *   - Address Input: 16-bit address
 *   - Write Data Input: 16-bit word
 *   - Read Enable (memRead): When 1, drives data at address onto read data lines
 *   - Write Enable (memWrite): When 1, captures write data into memory at address
 */

import { intToBits } from '../logic/bit-utils.js';

export class RAM {
  /**
   * @param {number} [size=65536] - Total addressable 16-bit words
   */
  constructor(size = 65536) {
    this.size = size;
    // Word-addressable storage array (each element is a 16-bit word)
    this.storage = new Uint16Array(size);
  }

  /**
   * Clears the entire memory space to 0.
   */
  reset() {
    this.storage.fill(0);
  }

  /**
   * Memory Read Cycle
   *
   * @param {number} address - 16-bit address
   * @param {number} [readEnable=1]
   * @returns {number} 16-bit word
   */
  read(address, readEnable = 1) {
    if (readEnable !== 1) return 0;
    if (address < 0 || address >= this.size) {
      throw new RangeError(
        `Memory Read Access Violation: address 0x${address.toString(16).toUpperCase()} is out of bounds (max 0x${(this.size - 1).toString(16)}).`
      );
    }
    return this.storage[address];
  }

  /**
   * Memory Write Cycle
   *
   * @param {number} address - 16-bit address
   * @param {number} data - 16-bit word
   * @param {number} [writeEnable=1]
   */
  write(address, data, writeEnable = 1) {
    if (writeEnable !== 1) return;
    if (address < 0 || address >= this.size) {
      throw new RangeError(
        `Memory Write Access Violation: address 0x${address.toString(16).toUpperCase()} is out of bounds.`
      );
    }
    this.storage[address] = data & 0xffff;
  }

  /**
   * Loads a program into memory starting at `startAddress`.
   *
   * @param {number} startAddress - e.g. 0x3000
   * @param {number[]} machineCodeWords - Array of 16-bit words
   */
  loadProgram(startAddress, machineCodeWords) {
    for (let i = 0; i < machineCodeWords.length; i++) {
      this.write(startAddress + i, machineCodeWords[i], 1);
    }
  }
}

