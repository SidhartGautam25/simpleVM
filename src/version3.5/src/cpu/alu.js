import { toUint16 } from '../utils/bit-utils.js';
import { SIGN_BIT, FLAG_NEGATIVE, FLAG_ZERO, FLAG_POSITIVE } from '../constants.js';

/**
 * Arithmetic Logic Unit (ALU) - Hardware Execution Unit
 *
 * Implements 16-bit combinational logic arithmetic and status flag evaluation.
 *
 * Supported Operations:
 * - 'ADD': Computes (inputA + inputB) & 0xFFFF
 *
 * Flag Evaluation (combinational zero-detector and sign-bit checker):
 * - Negative (N): Bit 15 is 1
 * - Zero (Z)    : All 16 bits are 0
 * - Positive (P): Bit 15 is 0 and not zero
 */
export class ALU {
  /**
   * Evaluates condition flags for a 16-bit result.
   *
   * @param {number} result - 16-bit unsigned integer
   * @returns {{ negative: boolean, zero: boolean, positive: boolean, psrFlag: number }}
   */
  static evaluateFlags(result) {
    const isNegative = Boolean(result & SIGN_BIT);
    const isZero = (result & 0xFFFF) === 0;
    const isPositive = !isNegative && !isZero;

    let psrFlag = FLAG_POSITIVE;
    if (isNegative) psrFlag = FLAG_NEGATIVE;
    else if (isZero) psrFlag = FLAG_ZERO;

    return {
      negative: isNegative,
      zero: isZero,
      positive: isPositive,
      psrFlag,
    };
  }

  /**
   * Executes an arithmetic/logic operation on two 16-bit inputs.
   *
   * @param {number} inputA - First 16-bit operand
   * @param {number} inputB - Second 16-bit operand
   * @param {string} [op='ADD'] - ALU operation selector
   * @returns {{
   *   result: number,
   *   op: string,
   *   inputA: number,
   *   inputB: number,
   *   flags: { negative: boolean, zero: boolean, positive: boolean, psrFlag: number }
   * }}
   */
  static compute(inputA, inputB, op = 'ADD') {
    let result = 0;

    switch (op) {
      case 'ADD':
        result = toUint16(inputA + inputB);
        break;

      default:
        throw new Error(`Unsupported ALU operation: ${op}`);
    }

    const flags = ALU.evaluateFlags(result);

    return {
      result,
      op,
      inputA: toUint16(inputA),
      inputB: toUint16(inputB),
      flags,
    };
  }

  /**
   * Executes an ALU operation, accepting (opcode, inputA, inputB) or (opName, inputA, inputB).
   */
  static execute(op, inputA, inputB) {
    const opStr = (typeof op === 'string') ? op : 'ADD';
    return this.compute(inputA, inputB, opStr);
  }
}

