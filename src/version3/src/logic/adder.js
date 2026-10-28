/**
 * Stage 4: Multi-Bit Ripple-Carry Adder
 *
 * Implements an N-bit ripple-carry adder by chaining N 1-bit Full Adders.
 * The carry output of bit i ripples into the carry input of bit i+1.
 *
 * All bit arrays are arranged with MSB at index 0 and LSB at index N-1.
 * Addition proceeds from LSB (index N-1) down to MSB (index 0).
 *
 * Signed Overflow Detection:
 *   In two's complement arithmetic, signed overflow occurs if:
 *     - Adding two positives yields a negative.
 *     - Adding two negatives yields a positive.
 *   At the gate level, this is detected by:
 *     Overflow = CarryIn_to_MSB ⊕ CarryOut_of_MSB
 */

import { fullAdder } from './full-adder.js';
import { xor, nor } from './gates.js';

/**
 * Adds two N-bit binary words with an incoming carry bit.
 *
 * @param {number[]} aBits - Bit array for operand A (MSB at index 0).
 * @param {number[]} bBits - Bit array for operand B (MSB at index 0).
 * @param {number} [carryIn=0] - Initial carry into the LSB.
 * @returns {{
 *   sumBits: number[],
 *   carryOut: number,
 *   overflow: number,
 *   zero: number,
 *   negative: number,
 *   carryInMSB: number
 * }}
 */
export function rippleCarryAdder(aBits, bBits, carryIn = 0) {
  if (aBits.length !== bBits.length) {
    throw new Error(
      `Bit width mismatch: A has ${aBits.length} bits, B has ${bBits.length} bits.`
    );
  }

  const width = aBits.length;
  const sumBits = new Array(width);
  let currentCarry = carryIn;
  let carryInMSB = 0;

  // Ripple from LSB (width - 1) to MSB (0)
  for (let i = width - 1; i >= 0; i--) {
    if (i === 0) {
      carryInMSB = currentCarry;
    }

    const stage = fullAdder(aBits[i], bBits[i], currentCarry);
    sumBits[i] = stage.sum;
    currentCarry = stage.carryOut;
  }

  const finalCarryOut = currentCarry;

  // Signed overflow = carry into MSB XOR carry out of MSB
  const overflow = xor(carryInMSB, finalCarryOut);

  // Negative flag = MSB of the result
  const negative = sumBits[0];

  // Zero flag: 1 if all sum bits are 0.
  // In hardware, this is an N-input NOR gate across all sum bits.
  let zeroAccumulator = 0;
  for (let i = 0; i < width; i++) {
    if (sumBits[i] === 1) {
      zeroAccumulator = 1;
      break;
    }
  }
  const zero = zeroAccumulator === 0 ? 1 : 0;

  return {
    sumBits,
    carryOut: finalCarryOut,
    overflow,
    zero,
    negative,
    carryInMSB,
  };
}

/**
 * 16-bit Ripple-Carry Adder convenience wrapper.
 */
export function adder16(aBits, bBits, carryIn = 0) {
  if (aBits.length !== 16 || bBits.length !== 16) {
    throw new Error('adder16 requires exactly 16-bit operands.');
  }
  return rippleCarryAdder(aBits, bBits, carryIn);
}

