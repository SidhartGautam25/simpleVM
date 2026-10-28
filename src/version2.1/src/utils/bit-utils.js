import { ADDR_MAX } from '../constants.js';

/**
 * Sign-extends an integer from a specified bit-width to 16 bits.
 *
 * @param {number} num - The value to sign-extend
 * @param {number} bits - Number of bits in the original representation
 * @returns {number} Sign-extended 16-bit integer
 */
export function signExtend(num, bits) {
  const signBit = 1 << (bits - 1);
  return (num & signBit) ? (num | (~0 << bits)) : num;
}

/**
 * Normalizes a number to an unsigned 16-bit word (0x0000 - 0xFFFF).
 *
 * @param {number} num
 * @returns {number}
 */
export function toUint16(num) {
  return num & ADDR_MAX;
}

/**
 * Extracts a contiguous range of bits from a 16-bit word.
 *
 * @param {number} word - 16-bit value
 * @param {number} startBit - Rightmost bit index (0-based)
 * @param {number} length - Number of bits to extract
 * @returns {number} Extracted bits shifted down to bit 0
 */
export function extractBits(word, startBit, length) {
  const mask = (1 << length) - 1;
  return (word >> startBit) & mask;
}

