/**
 * Stage 2: Half Adder
 *
 * Adds two 1-bit binary signals A and B.
 * Produces:
 *   SUM   = A ⊕ B (using XOR gate)
 *   CARRY = A · B (using AND gate)
 *
 * Truth Table:
 * | A | B | SUM | CARRY |
 * |---|---|:---:|:-----:|
 * | 0 | 0 |  0  |   0   |
 * | 0 | 1 |  1  |   0   |
 * | 1 | 0 |  1  |   0   |
 * | 1 | 1 |  0  |   1   |
 *
 * In physical terms:
 * 1 + 1 in binary is 10 (base 2), which is two bits: SUM=0, CARRY=1.
 */

import { xor, and } from './gates.js';

/**
 * Computes half addition of two binary inputs.
 *
 * @param {number} a - Binary input bit A (0 or 1).
 * @param {number} b - Binary input bit B (0 or 1).
 * @returns {{ sum: number, carry: number }}
 */
export function halfAdder(a, b) {
  const sum = xor(a, b);
  const carry = and(a, b);
  return { sum, carry };
}

