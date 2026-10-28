import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  not,
  and,
  or,
  nand,
  nor,
  xor,
  generateTruthTable,
} from '../../src/logic/gates.js';

describe('Stage 1: Logic Gates', () => {
  describe('NOT Gate', () => {
    it('implements truth table: NOT(0) = 1, NOT(1) = 0', () => {
      assert.equal(not(0), 1);
      assert.equal(not(1), 0);
    });

    it('returns strict binary numbers (0 or 1)', () => {
      assert.strictEqual(not(0), 1);
      assert.strictEqual(not(1), 0);
    });

    it('rejects invalid signals', () => {
      assert.throws(() => not(2), /Invalid digital signal/);
      assert.throws(() => not(true), /Invalid digital signal/);
      assert.throws(() => not('0'), /Invalid digital signal/);
    });
  });

  describe('AND Gate', () => {
    it('exhaustively satisfies truth table: high only when both inputs are 1', () => {
      const expected = [
        { a: 0, b: 0, out: 0 },
        { a: 0, b: 1, out: 0 },
        { a: 1, b: 0, out: 0 },
        { a: 1, b: 1, out: 1 },
      ];

      for (const { a, b, out } of expected) {
        assert.strictEqual(
          and(a, b),
          out,
          `Failed for AND(${a}, ${b}) expected ${out}`
        );
      }
    });

    it('rejects invalid inputs on any port', () => {
      assert.throws(() => and(0, 2), /Invalid digital signal for "B"/);
      assert.throws(() => and(null, 1), /Invalid digital signal for "A"/);
    });
  });

  describe('OR Gate', () => {
    it('exhaustively satisfies truth table: high when at least one input is 1', () => {
      const expected = [
        { a: 0, b: 0, out: 0 },
        { a: 0, b: 1, out: 1 },
        { a: 1, b: 0, out: 1 },
        { a: 1, b: 1, out: 1 },
      ];

      for (const { a, b, out } of expected) {
        assert.strictEqual(
          or(a, b),
          out,
          `Failed for OR(${a}, ${b}) expected ${out}`
        );
      }
    });

    it('rejects invalid inputs on any port', () => {
      assert.throws(() => or(undefined, 0), /Invalid digital signal for "A"/);
      assert.throws(() => or(1, '1'), /Invalid digital signal for "B"/);
    });
  });

  describe('NAND Gate', () => {
    it('exhaustively satisfies truth table: inverse of AND', () => {
      const expected = [
        { a: 0, b: 0, out: 1 },
        { a: 0, b: 1, out: 1 },
        { a: 1, b: 0, out: 1 },
        { a: 1, b: 1, out: 0 },
      ];

      for (const { a, b, out } of expected) {
        assert.strictEqual(
          nand(a, b),
          out,
          `Failed for NAND(${a}, ${b}) expected ${out}`
        );
      }
    });

    it('rejects invalid inputs', () => {
      assert.throws(() => nand(1, false), /Invalid digital signal/);
    });
  });

  describe('NOR Gate', () => {
    it('exhaustively satisfies truth table: inverse of OR', () => {
      const expected = [
        { a: 0, b: 0, out: 1 },
        { a: 0, b: 1, out: 0 },
        { a: 1, b: 0, out: 0 },
        { a: 1, b: 1, out: 0 },
      ];

      for (const { a, b, out } of expected) {
        assert.strictEqual(
          nor(a, b),
          out,
          `Failed for NOR(${a}, ${b}) expected ${out}`
        );
      }
    });

    it('rejects invalid inputs', () => {
      assert.throws(() => nor(-1, 0), /Invalid digital signal/);
    });
  });

  describe('XOR Gate', () => {
    it('exhaustively satisfies truth table: high when inputs differ (odd parity)', () => {
      const expected = [
        { a: 0, b: 0, out: 0 },
        { a: 0, b: 1, out: 1 },
        { a: 1, b: 0, out: 1 },
        { a: 1, b: 1, out: 0 },
      ];

      for (const { a, b, out } of expected) {
        assert.strictEqual(
          xor(a, b),
          out,
          `Failed for XOR(${a}, ${b}) expected ${out}`
        );
      }
    });

    it('rejects invalid inputs', () => {
      assert.throws(() => xor('x', 0), /Invalid digital signal/);
    });
  });

  describe('generateTruthTable helper', () => {
    it('generates all 2 combinations for 1-input gate', () => {
      const table = generateTruthTable(not, 1);
      assert.deepEqual(table, [
        { inputs: [0], output: 1 },
        { inputs: [1], output: 0 },
      ]);
    });

    it('generates all 4 combinations for 2-input gate', () => {
      const table = generateTruthTable(and, 2);
      assert.deepEqual(table, [
        { inputs: [0, 0], output: 0 },
        { inputs: [0, 1], output: 0 },
        { inputs: [1, 0], output: 0 },
        { inputs: [1, 1], output: 1 },
      ]);
    });
  });
});

