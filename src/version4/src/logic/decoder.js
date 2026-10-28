/**
 * Stage 5: Decoders
 *
 * Decoders translate an n-bit binary code into at most 2^n unique output lines.
 * In a CPU, decoders are essential for:
 * 1. Opcode decoding (translating 4-bit opcode into instruction control states).
 * 2. Register selection (translating 3-bit register address into write-enable lines).
 * 3. Memory address decoding.
 *
 * Implemented using NOT and AND gates.
 */

import { not, and } from './gates.js';
import { validateSignal } from './signals.js';

/**
 * 2-to-4 Binary Decoder with Enable
 *
 * Outputs:
 *   Y0 = Enable · ¬A1 · ¬A0
 *   Y1 = Enable · ¬A1 ·  A0
 *   Y2 = Enable ·  A1 · ¬A0
 *   Y3 = Enable ·  A1 ·  A0
 *
 * @param {number} a1 - High-order address bit
 * @param {number} a0 - Low-order address bit
 * @param {number} [enable=1] - Active-high enable signal
 * @returns {number[]} 4-element one-hot active array [Y0, Y1, Y2, Y3]
 */
export function decoder2to4(a1, a0, enable = 1) {
  validateSignal(a1, 'A1');
  validateSignal(a0, 'A0');
  validateSignal(enable, 'Enable');

  const na1 = not(a1);
  const na0 = not(a0);

  const y0 = and(enable, and(na1, na0));
  const y1 = and(enable, and(na1, a0));
  const y2 = and(enable, and(a1, na0));
  const y3 = and(enable, and(a1, a0));

  return [y0, y1, y2, y3];
}

/**
 * 3-to-8 Binary Decoder with Enable
 * Decodes a 3-bit address (e.g. register select R0..R7) into 8 discrete enable lines.
 *
 * @param {number} a2 - Bit 2 (MSB)
 * @param {number} a1 - Bit 1
 * @param {number} a0 - Bit 0 (LSB)
 * @param {number} [enable=1] - Active-high enable
 * @returns {number[]} 8-element array [Y0, Y1, Y2, Y3, Y4, Y5, Y6, Y7]
 */
export function decoder3to8(a2, a1, a0, enable = 1) {
  validateSignal(a2, 'A2');
  validateSignal(a1, 'A1');
  validateSignal(a0, 'A0');
  validateSignal(enable, 'Enable');

  // Decompose using two 2-to-4 decoders enabled by a2
  const notA2 = not(a2);
  const lowerEnable = and(enable, notA2); // Active when A2 is 0 (outputs 0..3)
  const upperEnable = and(enable, a2);    // Active when A2 is 1 (outputs 4..7)

  const lower4 = decoder2to4(a1, a0, lowerEnable);
  const upper4 = decoder2to4(a1, a0, upperEnable);

  return [...lower4, ...upper4];
}

/**
 * Decodes an array of 3 address bits [A2, A1, A0] into 8 select lines.
 *
 * @param {number[]} addrBits - 3-bit array
 * @param {number} [enable=1]
 * @returns {number[]}
 */
export function decodeRegisterAddress(addrBits, enable = 1) {
  if (addrBits.length !== 3) {
    throw new Error(`Register address must be exactly 3 bits, got ${addrBits.length}`);
  }
  return decoder3to8(addrBits[0], addrBits[1], addrBits[2], enable);
}

