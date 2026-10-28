/**
 * Stage 4: Subtractor & Arithmetic Building Blocks
 *
 * Implements two's complement binary subtraction:
 *   A - B = A + (~B) + 1
 *
 * In physical ALUs, subtraction uses the SAME adder circuit with:
 * 1. An XOR gate on each bit of B controlled by the `sub` signal:
 *      B_effective[i] = B[i] ⊕ sub
 *    When sub = 0: B_effective = B, CarryIn = 0  => A + B (ADD)
 *    When sub = 1: B_effective = ~B, CarryIn = 1 => A + (~B) + 1 (SUB)
 */

import { rippleCarryAdder } from './adder.js';
import { xor, not } from './gates.js';
import { intToBits } from './bit-utils.js';

/**
 * Universal Adder / Subtractor
 *
 * @param {number[]} aBits - Operand A
 * @param {number[]} bBits - Operand B
 * @param {number} sub - 0 for ADD, 1 for SUB
 * @returns Results of addition or subtraction with condition flags.
 */
export function adderSubtractor(aBits, bBits, sub = 0) {
  const width = aBits.length;
  const effectiveB = new Array(width);

  // Controlled inversion: B_i XOR sub
  for (let i = 0; i < width; i++) {
    effectiveB[i] = xor(bBits[i], sub);
  }

  // CarryIn is equal to the sub signal (0 for ADD, 1 for SUB)
  return rippleCarryAdder(aBits, effectiveB, sub);
}

/**
 * Two's complement negation: -A = (~A) + 1
 *
 * @param {number[]} aBits
 * @returns {number[]} Negated bit array
 */
export function negate(aBits) {
  const width = aBits.length;
  const zeroBits = new Array(width).fill(0);
  // 0 - A = ~A + 1
  return adderSubtractor(zeroBits, aBits, 1).sumBits;
}

/**
 * Increments an N-bit value by 1: A + 1
 *
 * @param {number[]} aBits
 * @returns {number[]} Incremented bit array
 */
export function increment(aBits) {
  const width = aBits.length;
  const zeroBits = new Array(width).fill(0);
  return rippleCarryAdder(aBits, zeroBits, 1).sumBits;
}

/**
 * Decrements an N-bit value by 1: A - 1
 *
 * @param {number[]} aBits
 * @returns {number[]} Decremented bit array
 */
export function decrement(aBits) {
  const width = aBits.length;
  const oneBits = intToBits(1, width);
  return adderSubtractor(aBits, oneBits, 1).sumBits;
}

