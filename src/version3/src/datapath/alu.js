/**
 * Stage 11: 16-Bit Arithmetic Logic Unit (ALU)
 *
 * The ALU performs arithmetic and bitwise logical operations on two 16-bit operands
 * (A and B) under the direction of an ALU operation control signal.
 *
 * Critical Architecture Rule (Rule 2):
 *   The ALU MUST NOT calculate results using JavaScript's `+`, `-`, or other math shortcuts.
 *   All arithmetic is performed by the gate-based ripple-carry adder and subtractor circuits.
 *
 * Supported Operations:
 *   - ADD:   A + B (via ripple-carry adder)
 *   - SUB:   A - B (via two's-complement subtractor)
 *   - AND:   A · B (bitwise AND gates)
 *   - OR:    A + B (bitwise OR gates)
 *   - NOT:   ¬A (bitwise NOT gates on operand A)
 *   - XOR:   A ⊕ B (bitwise XOR gates)
 *   - PASSA: Passes A unchanged (useful for register transfer)
 *
 * Combinational Flags Generated:
 *   - Zero (Z): 1 if all result bits are 0
 *   - Negative (N): 1 if MSB (bit 15) is 1
 *   - Positive (P): 1 if result is non-zero and non-negative
 *   - CarryOut: Final carry from adder
 *   - Overflow (V): Signed two's complement overflow
 */

import { adderSubtractor } from '../logic/subtractor.js';
import { and, or, not, xor } from '../logic/gates.js';
import { intToBits, bitsToUnsigned, bitsToSigned } from '../logic/bit-utils.js';

export const ALU_OP = {
  ADD: 0,
  SUB: 1,
  AND: 2,
  OR: 3,
  NOT: 4,
  XOR: 5,
  PASSA: 6,
};

export class ALU {
  constructor(width = 16) {
    this.width = width;
  }

  /**
   * Executes the combinational ALU operation.
   *
   * @param {number[]} aBits - 16-bit Operand A
   * @param {number[]} bBits - 16-bit Operand B
   * @param {number} aluOp - ALU_OP control signal
   * @returns {{
   *   resultBits: number[],
   *   resultUint: number,
   *   resultInt: number,
   *   zero: number,
   *   negative: number,
   *   positive: number,
   *   carryOut: number,
   *   overflow: number
   * }}
   */
  execute(aBits, bBits, aluOp) {
    if (aBits.length !== this.width || bBits.length !== this.width) {
      throw new Error(`ALU operands must be ${this.width} bits.`);
    }

    let resultBits = new Array(this.width);
    let carryOut = 0;
    let overflow = 0;

    switch (aluOp) {
      case ALU_OP.ADD: {
        const res = adderSubtractor(aBits, bBits, 0);
        resultBits = res.sumBits;
        carryOut = res.carryOut;
        overflow = res.overflow;
        break;
      }

      case ALU_OP.SUB: {
        const res = adderSubtractor(aBits, bBits, 1);
        resultBits = res.sumBits;
        carryOut = res.carryOut;
        overflow = res.overflow;
        break;
      }

      case ALU_OP.AND: {
        for (let i = 0; i < this.width; i++) {
          resultBits[i] = and(aBits[i], bBits[i]);
        }
        break;
      }

      case ALU_OP.OR: {
        for (let i = 0; i < this.width; i++) {
          resultBits[i] = or(aBits[i], bBits[i]);
        }
        break;
      }

      case ALU_OP.NOT: {
        for (let i = 0; i < this.width; i++) {
          resultBits[i] = not(aBits[i]);
        }
        break;
      }

      case ALU_OP.XOR: {
        for (let i = 0; i < this.width; i++) {
          resultBits[i] = xor(aBits[i], bBits[i]);
        }
        break;
      }

      case ALU_OP.PASSA: {
        resultBits = [...aBits];
        break;
      }

      default:
        throw new Error(`Invalid ALU operation code: ${aluOp}`);
    }

    // Evaluate condition flags directly from result bits
    const negative = resultBits[0]; // MSB is sign bit in two's complement

    // Zero detection: NOR across all bits
    let nonZeroFound = 0;
    for (let i = 0; i < this.width; i++) {
      if (resultBits[i] === 1) {
        nonZeroFound = 1;
        break;
      }
    }
    const zero = not(nonZeroFound);

    // Positive: Non-zero AND non-negative
    const positive = and(not(negative), not(zero));

    const resultUint = bitsToUnsigned(resultBits);
    const resultInt = bitsToSigned(resultBits);

    return {
      resultBits,
      resultUint,
      resultInt,
      zero,
      negative,
      positive,
      carryOut,
      overflow,
    };
  }
}

