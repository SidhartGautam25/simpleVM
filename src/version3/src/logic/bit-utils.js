/**
 * Bit Utility Functions
 *
 * Helpers for converting between standard JavaScript integers and
 * fixed-width arrays of binary signals (0 and 1).
 *
 * All bit arrays are BIG-ENDIAN by index convention:
 *   bits[0] is the Most Significant Bit (MSB, Bit 15 for 16-bit).
 *   bits[length - 1] is the Least Significant Bit (LSB, Bit 0).
 */

import { validateSignal } from './signals.js';

/**
 * Converts a number to an array of binary bits (0 or 1).
 *
 * @param {number} value - Integer to convert.
 * @param {number} width - Bit width (e.g. 8 or 16).
 * @returns {number[]} Array of binary signals of length `width`.
 */
export function intToBits(value, width) {
  const bits = new Array(width);
  // Mask to unsigned within width
  const unsigned = (value >>> 0) & ((1 << width) - 1);
  for (let i = 0; i < width; i++) {
    // bits[0] is MSB, bits[width - 1] is LSB
    const bitPos = width - 1 - i;
    bits[i] = (unsigned >> bitPos) & 1;
  }
  return bits;
}

/**
 * Converts an array of binary bits (MSB first) to an unsigned integer.
 *
 * @param {number[]} bits - Array of 0s and 1s.
 * @returns {number} Unsigned integer.
 */
export function bitsToUnsigned(bits) {
  let result = 0;
  for (let i = 0; i < bits.length; i++) {
    validateSignal(bits[i], `bits[${i}]`);
    result = (result << 1) | bits[i];
  }
  return result >>> 0;
}

/**
 * Converts an array of binary bits (MSB first) to a signed two's-complement integer.
 *
 * @param {number[]} bits - Array of 0s and 1s.
 * @returns {number} Signed integer.
 */
export function bitsToSigned(bits) {
  const unsigned = bitsToUnsigned(bits);
  const width = bits.length;
  const signBit = 1 << (width - 1);
  if (unsigned & signBit) {
    return unsigned - (1 << width);
  }
  return unsigned;
}

/**
 * Formats a bit array as a string of '0' and '1's.
 *
 * @param {number[]} bits
 * @returns {string} e.g. "0000 0000 0000 1000"
 */
export function formatBitString(bits, groupSize = 4) {
  const str = bits.map((b) => (b === 1 ? '1' : '0')).join('');
  if (!groupSize) return str;
  const groups = [];
  for (let i = 0; i < str.length; i += groupSize) {
    groups.push(str.slice(i, i + groupSize));
  }
  return groups.join(' ');
}

/**
 * Sign-extends a bit array of length `fromWidth` to `toWidth`.
 *
 * @param {number[]} bits - Original bits (MSB at index 0).
 * @param {number} toWidth - Target width.
 * @returns {number[]} Sign-extended bit array.
 */
export function signExtendBits(bits, toWidth) {
  if (bits.length >= toWidth) return bits.slice(bits.length - toWidth);
  const sign = bits[0];
  const extension = new Array(toWidth - bits.length).fill(sign);
  return [...extension, ...bits];
}

