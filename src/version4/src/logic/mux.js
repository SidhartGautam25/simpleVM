/**
 * Stage 5: Multiplexers (Data Selectors)
 *
 * Multiplexers select one of several data inputs and forward the selected input
 * to a single output line based on selection control signals.
 *
 * All selection behavior is constructed using logic gates (NOT, AND, OR)
 * rather than high-level JavaScript switch or if/else shortcuts.
 */

import { not, and, or } from './gates.js';
import { validateSignal } from './signals.js';

/**
 * 2-to-1 Multiplexer (1-bit)
 * Formula: Y = (¬S · D0) + (S · D1)
 *
 * @param {number} d0 - Input 0
 * @param {number} d1 - Input 1
 * @param {number} sel - Select signal (0 picks d0, 1 picks d1)
 * @returns {number} Selected output
 */
export function mux2(d0, d1, sel) {
  validateSignal(d0, 'D0');
  validateSignal(d1, 'D1');
  validateSignal(sel, 'Sel');

  const notSel = not(sel);
  const term0 = and(d0, notSel);
  const term1 = and(d1, sel);

  return or(term0, term1);
}

/**
 * 4-to-1 Multiplexer (1-bit)
 * Constructed from three 2-to-1 multiplexers in a tree:
 *   Stage 1: m0 = mux2(d0, d1, s0), m1 = mux2(d2, d3, s0)
 *   Stage 2: out = mux2(m0, m1, s1)
 *
 * @param {number} d0
 * @param {number} d1
 * @param {number} d2
 * @param {number} d3
 * @param {number} s1 - Most significant select bit
 * @param {number} s0 - Least significant select bit
 * @returns {number}
 */
export function mux4(d0, d1, d2, d3, s1, s0) {
  const m0 = mux2(d0, d1, s0);
  const m1 = mux2(d2, d3, s0);
  return mux2(m0, m1, s1);
}

/**
 * Multi-bit 2-to-1 Multiplexer.
 * Selects between two N-bit binary words based on a single select signal.
 *
 * @param {number[]} word0 - Array of bits for input 0
 * @param {number[]} word1 - Array of bits for input 1
 * @param {number} sel - 0 selects word0, 1 selects word1
 * @returns {number[]} Selected N-bit word
 */
export function muxWord2(word0, word1, sel) {
  if (word0.length !== word1.length) {
    throw new Error('muxWord2 inputs must have identical bit widths.');
  }
  const result = new Array(word0.length);
  for (let i = 0; i < word0.length; i++) {
    result[i] = mux2(word0[i], word1[i], sel);
  }
  return result;
}

/**
 * N-way Multi-bit Multiplexer (for selecting among 2^k words).
 *
 * @param {number[][]} words - Array of input words (length must be a power of 2)
 * @param {number[]} selBits - Array of selection bits (MSB at index 0)
 * @returns {number[]} Selected word
 */
export function muxWordN(words, selBits) {
  if (selBits.length === 0) return words[0];

  let currentLevel = words;
  // Apply select bits from LSB to MSB
  for (let bitIdx = selBits.length - 1; bitIdx >= 0; bitIdx--) {
    const nextLevel = [];
    const sel = selBits[bitIdx];
    for (let i = 0; i < currentLevel.length; i += 2) {
      nextLevel.push(muxWord2(currentLevel[i], currentLevel[i + 1], sel));
    }
    currentLevel = nextLevel;
  }
  return currentLevel[0];
}

