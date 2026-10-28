/**
 * Stage 3: Full Adder
 *
 * Adds two binary operand bits A and B plus an incoming carry bit (CarryIn).
 * Constructed using two Half Adders and an OR gate.
 *
 * Equations:
 *   SUM      = A ⊕ B ⊕ CarryIn
 *   CarryOut = (A · B) + (CarryIn · (A ⊕ B))
 *
 * Truth Table:
 * | A | B | Cin | SUM | Cout |
 * |---|---|:---:|:---:|:----:|
 * | 0 | 0 |  0  |  0  |  0   |
 * | 0 | 0 |  1  |  1  |  0   |
 * | 0 | 1 |  0  |  1  |  0   |
 * | 0 | 1 |  1  |  0  |  1   |
 * | 1 | 0 |  0  |  1  |  0   |
 * | 1 | 0 |  1  |  0  |  1   |
 * | 1 | 1 |  0  |  0  |  1   |
 * | 1 | 1 |  1  |  1  |  1   |
 */

import { halfAdder } from './half-adder.js';
import { or } from './gates.js';

/**
 * Computes full addition of A, B, and CarryIn using two half adders.
 *
 * @param {number} a - Binary operand bit A.
 * @param {number} b - Binary operand bit B.
 * @param {number} carryIn - Incoming carry bit (0 or 1).
 * @returns {{ sum: number, carryOut: number }}
 */
export function fullAdder(a, b, carryIn = 0) {
  // First stage: Add A and B
  const ha1 = halfAdder(a, b);

  // Second stage: Add ha1.sum with CarryIn
  const ha2 = halfAdder(ha1.sum, carryIn);

  // Final CarryOut is generated if either half-adder generated a carry
  const carryOut = or(ha1.carry, ha2.carry);

  return {
    sum: ha2.sum,
    carryOut,
  };
}

