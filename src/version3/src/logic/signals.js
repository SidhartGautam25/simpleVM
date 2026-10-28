/**
 * Binary Signal Representation & Validation
 *
 * In our hardware simulation, every physical wire or line carries a digital signal.
 * We represent digital signals strictly as binary values:
 *   LOW  = 0 (Ground / VSS / False)
 *   HIGH = 1 (Supply Voltage / VDD / True)
 *
 * Silently accepting non-binary types (such as `true`, `false`, `2`, `"1"`, `null`, `undefined`)
 * creates insidious simulation bugs where arithmetic or bitwise operators produce invalid wire states.
 */

export const LOW = 0;
export const HIGH = 1;

/**
 * Checks if a value is a valid binary signal (strictly 0 or 1).
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isValidSignal(value) {
  return value === 0 || value === 1;
}

/**
 * Asserts that a value is a valid binary signal (0 or 1).
 * Throws a TypeError if the value is invalid.
 *
 * @param {*} value - The signal to validate.
 * @param {string} [name='Signal'] - The name of the signal/pin for descriptive error messages.
 * @throws {TypeError} If value is not strictly 0 or 1.
 */
export function validateSignal(value, name = 'Signal') {
  if (value !== 0 && value !== 1) {
    const formattedVal = typeof value === 'string' ? `"${value}"` : String(value);
    throw new TypeError(
      `Invalid digital signal for "${name}": expected binary 0 or 1, but received ${formattedVal} (type: ${typeof value}).`
    );
  }
}

/**
 * Validates multiple binary signals.
 *
 * @param {Record<string, *>} signals - Map of signal name to signal value.
 */
export function validateSignals(signals) {
  for (const [name, value] of Object.entries(signals)) {
    validateSignal(value, name);
  }
}

/**
 * Formats a binary signal as a single character '0' or '1'.
 *
 * @param {number} signal
 * @returns {string}
 */
export function formatSignal(signal) {
  validateSignal(signal);
  return signal === 1 ? '1' : '0';
}

