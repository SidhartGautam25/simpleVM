import { FLAG_NEGATIVE, FLAG_ZERO, FLAG_POSITIVE, SIGN_BIT, ADDR_MAX } from '../constants.js';

/**
 * Computes the Processor Status Register (PSR) condition flag
 * based on the 16-bit value of a register.
 *
 * @param {number} value - 16-bit register value
 * @returns {number} FLAG_NEGATIVE, FLAG_ZERO, or FLAG_POSITIVE
 */
export function calculateConditionFlag(value) {
  if (value & SIGN_BIT) {
    return FLAG_NEGATIVE;
  }
  if ((value & ADDR_MAX) === 0) {
    return FLAG_ZERO;
  }
  return FLAG_POSITIVE;
}


