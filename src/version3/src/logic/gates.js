/**
 * Primitive Logic Gates
 *
 * All gates in this module model pure combinational logic:
 * 1. They operate strictly on binary signals (0 and 1).
 * 2. They do not maintain internal state.
 * 3. Their outputs are determined purely by their current inputs.
 * 4. All inputs are validated before evaluation.
 *
 * In physical digital electronics (specifically CMOS technology):
 * - Gates are built using Complementary MOS (PMOS pull-up and NMOS pull-down networks).
 * - Naturally inverting gates (NAND, NOR, NOT) require fewer transistors and are faster
 *   than non-inverting gates (AND, OR).
 */

import { validateSignal } from './signals.js';

/**
 * NOT Gate (Inverter)
 * Boolean: Y = ¬A (or A')
 * CMOS: 2 transistors (1 PMOS pull-up, 1 NMOS pull-down).
 *
 * Truth Table:
 * | A | Y |
 * |---|---|
 * | 0 | 1 |
 * | 1 | 0 |
 *
 * @param {number} a - Binary input signal (0 or 1).
 * @returns {number} Binary output signal (0 or 1).
 */
export function not(a) {
  validateSignal(a, 'A');
  return a === 0 ? 1 : 0;
}

/**
 * AND Gate
 * Boolean: Y = A · B
 * CMOS: 6 transistors (4 for NAND + 2 for inverter).
 *
 * Truth Table:
 * | A | B | Y |
 * |---|---|---|
 * | 0 | 0 | 0 |
 * | 0 | 1 | 0 |
 * | 1 | 0 | 0 |
 * | 1 | 1 | 1 |
 *
 * @param {number} a - Binary input signal A.
 * @param {number} b - Binary input signal B.
 * @returns {number} Binary output signal.
 */
export function and(a, b) {
  validateSignal(a, 'A');
  validateSignal(b, 'B');
  return a === 1 && b === 1 ? 1 : 0;
}

/**
 * OR Gate
 * Boolean: Y = A + B
 * CMOS: 6 transistors (4 for NOR + 2 for inverter).
 *
 * Truth Table:
 * | A | B | Y |
 * |---|---|---|
 * | 0 | 0 | 0 |
 * | 0 | 1 | 1 |
 * | 1 | 0 | 1 |
 * | 1 | 1 | 1 |
 *
 * @param {number} a - Binary input signal A.
 * @param {number} b - Binary input signal B.
 * @returns {number} Binary output signal.
 */
export function or(a, b) {
  validateSignal(a, 'A');
  validateSignal(b, 'B');
  return a === 1 || b === 1 ? 1 : 0;
}

/**
 * NAND Gate (Universal Gate)
 * Boolean: Y = ¬(A · B)
 * CMOS: 4 transistors (2 parallel PMOS, 2 series NMOS).
 *
 * Truth Table:
 * | A | B | Y |
 * |---|---|---|
 * | 0 | 0 | 1 |
 * | 0 | 1 | 1 |
 * | 1 | 0 | 1 |
 * | 1 | 1 | 0 |
 *
 * @param {number} a - Binary input signal A.
 * @param {number} b - Binary input signal B.
 * @returns {number} Binary output signal.
 */
export function nand(a, b) {
  validateSignal(a, 'A');
  validateSignal(b, 'B');
  return a === 1 && b === 1 ? 0 : 1;
}

/**
 * NOR Gate (Universal Gate)
 * Boolean: Y = ¬(A + B)
 * CMOS: 4 transistors (2 series PMOS, 2 parallel NMOS).
 *
 * Truth Table:
 * | A | B | Y |
 * |---|---|---|
 * | 0 | 0 | 1 |
 * | 0 | 1 | 0 |
 * | 1 | 0 | 0 |
 * | 1 | 1 | 0 |
 *
 * @param {number} a - Binary input signal A.
 * @param {number} b - Binary input signal B.
 * @returns {number} Binary output signal.
 */
export function nor(a, b) {
  validateSignal(a, 'A');
  validateSignal(b, 'B');
  return a === 0 && b === 0 ? 1 : 0;
}

/**
 * XOR Gate (Exclusive OR)
 * Boolean: Y = A ⊕ B = (A · ¬B) + (¬A · B)
 * CMOS: ~8 to 12 transistors depending on circuit topology.
 *
 * High when inputs differ, low when inputs are identical.
 * Essential for binary addition (Half Adder SUM bit).
 *
 * Truth Table:
 * | A | B | Y |
 * |---|---|---|
 * | 0 | 0 | 0 |
 * | 0 | 1 | 1 |
 * | 1 | 0 | 1 |
 * | 1 | 1 | 0 |
 *
 * @param {number} a - Binary input signal A.
 * @param {number} b - Binary input signal B.
 * @returns {number} Binary output signal.
 */
export function xor(a, b) {
  validateSignal(a, 'A');
  validateSignal(b, 'B');
  return a !== b ? 1 : 0;
}

/**
 * Generates an exhaustive truth table for any 1-input or 2-input logic gate.
 *
 * @param {Function} gateFn - The gate function to evaluate.
 * @param {number} [numInputs=2] - Number of inputs (1 or 2).
 * @returns {Array<{ inputs: number[], output: number }>}
 */
export function generateTruthTable(gateFn, numInputs = 2) {
  if (numInputs === 1) {
    return [0, 1].map((a) => ({ inputs: [a], output: gateFn(a) }));
  }
  if (numInputs === 2) {
    const table = [];
    for (const a of [0, 1]) {
      for (const b of [0, 1]) {
        table.push({ inputs: [a, b], output: gateFn(a, b) });
      }
    }
    return table;
  }
  throw new Error(`generateTruthTable currently supports 1 or 2 inputs, got: ${numInputs}`);
}

