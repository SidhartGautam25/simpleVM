/**
 * Stage 10: Multi-Port Register File
 *
 * Implements 8 general-purpose 16-bit registers (R0 through R7).
 *
 * Ports:
 * 1. Read Port A (SR1): Combinational read selected by 3-bit address `addrA`.
 * 2. Read Port B (SR2): Independent combinational read selected by 3-bit address `addrB`.
 * 3. Write Port (DR): Synchronous write to register selected by 3-bit address `writeAddr`,
 *    gated by `writeEnable`.
 *
 * Hardware Mechanism:
 * - Read selection uses 8-to-1 word multiplexers.
 * - Write selection uses a 3-to-8 binary decoder to generate individual register load enables.
 * - Storage is implemented with synchronous Register instances.
 */

import { Register } from '../storage/register.js';
import { decodeRegisterAddress } from '../logic/decoder.js';
import { muxWordN } from '../logic/mux.js';
import { intToBits } from '../logic/bit-utils.js';

export class RegisterFile {
  /**
   * @param {number} [width=16]
   * @param {number} [numRegisters=8]
   */
  constructor(width = 16, numRegisters = 8) {
    this.width = width;
    this.numRegisters = numRegisters;
    this.registers = [];

    for (let i = 0; i < numRegisters; i++) {
      this.registers.push(new Register(width, `R${i}`, 0));
    }
  }

  /**
   * Reads from Port A based on 3-bit register address.
   *
   * @param {number[]|number} addr - 3-bit array or integer (0..7)
   * @returns {number[]} 16-bit array
   */
  readPortA(addr) {
    const addrBits = Array.isArray(addr) ? addr : intToBits(addr, 3);
    const allWords = this.registers.map((r) => r.readBits());
    return muxWordN(allWords, addrBits);
  }

  /**
   * Reads from Port B based on 3-bit register address.
   *
   * @param {number[]|number} addr - 3-bit array or integer (0..7)
   * @returns {number[]} 16-bit array
   */
  readPortB(addr) {
    const addrBits = Array.isArray(addr) ? addr : intToBits(addr, 3);
    const allWords = this.registers.map((r) => r.readBits());
    return muxWordN(allWords, addrBits);
  }

  /**
   * Prepares a write to the destination register.
   *
   * @param {number[]|number} writeAddr - 3-bit address (0..7)
   * @param {number[]|number} data - 16-bit word to write
   * @param {number} [writeEnable=1] - Active-high write strobe
   */
  prepareWrite(writeAddr, data, writeEnable = 1) {
    const addrBits = Array.isArray(writeAddr) ? writeAddr : intToBits(writeAddr, 3);
    // Decode address to 8 individual one-hot enable lines
    const enables = decodeRegisterAddress(addrBits, writeEnable);

    for (let i = 0; i < this.numRegisters; i++) {
      this.registers[i].prepare(data, enables[i], 0);
    }
  }

  /**
   * Commits the write on clock edge.
   */
  commit() {
    for (let i = 0; i < this.numRegisters; i++) {
      this.registers[i].commit();
    }
  }

  /**
   * Direct read of register integer value for inspection/assertions.
   */
  getReg(index) {
    return this.registers[index].readUint();
  }

  /**
   * Direct write of register integer value for test setup.
   */
  setReg(index, value) {
    this.registers[index].forceValue(value);
  }

  /**
   * Formats all 8 registers for observability.
   */
  inspect() {
    return this.registers.map((r) => r.inspect()).join('\n');
  }
}

