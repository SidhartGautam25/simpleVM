import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOW,
  HIGH,
  isValidSignal,
  validateSignal,
  validateSignals,
  formatSignal,
} from '../../src/logic/signals.js';

describe('Binary Signal Representation and Validation', () => {
  it('defines LOW as 0 and HIGH as 1', () => {
    assert.equal(LOW, 0);
    assert.equal(HIGH, 1);
  });

  describe('isValidSignal', () => {
    it('returns true for valid binary values 0 and 1', () => {
      assert.equal(isValidSignal(0), true);
      assert.equal(isValidSignal(1), true);
    });

    it('returns false for non-binary numbers', () => {
      assert.equal(isValidSignal(-1), false);
      assert.equal(isValidSignal(2), false);
      assert.equal(isValidSignal(0.5), false);
      assert.equal(isValidSignal(NaN), false);
      assert.equal(isValidSignal(Infinity), false);
    });

    it('returns false for booleans (we enforce explicit binary numbers 0/1)', () => {
      assert.equal(isValidSignal(true), false);
      assert.equal(isValidSignal(false), false);
    });

    it('returns false for strings, null, undefined, objects', () => {
      assert.equal(isValidSignal('0'), false);
      assert.equal(isValidSignal('1'), false);
      assert.equal(isValidSignal(null), false);
      assert.equal(isValidSignal(undefined), false);
      assert.equal(isValidSignal({}), false);
      assert.equal(isValidSignal([]), false);
    });
  });

  describe('validateSignal', () => {
    it('does not throw for binary 0 and 1', () => {
      assert.doesNotThrow(() => validateSignal(0));
      assert.doesNotThrow(() => validateSignal(1));
    });

    it('throws descriptive TypeError for invalid values', () => {
      assert.throws(
        () => validateSignal(true, 'DataWire'),
        /Invalid digital signal for "DataWire": expected binary 0 or 1, but received true \(type: boolean\)\./
      );

      assert.throws(
        () => validateSignal('1', 'ClockPin'),
        /Invalid digital signal for "ClockPin": expected binary 0 or 1, but received "1" \(type: string\)\./
      );

      assert.throws(
        () => validateSignal(2, 'BusBit'),
        /Invalid digital signal for "BusBit": expected binary 0 or 1, but received 2 \(type: number\)\./
      );
    });
  });

  describe('validateSignals', () => {
    it('validates a group of named signals successfully', () => {
      assert.doesNotThrow(() => {
        validateSignals({ A: 0, B: 1, Enable: 1 });
      });
    });

    it('fails when any signal in the group is invalid', () => {
      assert.throws(
        () => validateSignals({ A: 0, B: 'invalid' }),
        /Invalid digital signal for "B"/
      );
    });
  });

  describe('formatSignal', () => {
    it('formats binary signals as strings "0" and "1"', () => {
      assert.equal(formatSignal(0), '0');
      assert.equal(formatSignal(1), '1');
    });

    it('throws if signal is invalid', () => {
      assert.throws(() => formatSignal(5));
    });
  });
});

