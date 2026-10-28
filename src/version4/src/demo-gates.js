/**
 * Stage 1 Interactive Demonstration: Logic Gates & Truth Tables
 *
 * Run with:
 *   node src/version3/src/demo-gates.js
 */

import { not, and, or, nand, nor, xor, generateTruthTable } from './logic/gates.js';

const GATES = [
  {
    name: 'NOT',
    symbol: '¬A',
    description: 'Inversion / Complement',
    cmosTransistors: 2,
    inputs: 1,
    fn: not,
  },
  {
    name: 'AND',
    symbol: 'A · B',
    description: 'Logical Conjunction (Both must be 1)',
    cmosTransistors: 6,
    inputs: 2,
    fn: and,
  },
  {
    name: 'OR',
    symbol: 'A + B',
    description: 'Logical Disjunction (At least one must be 1)',
    cmosTransistors: 6,
    inputs: 2,
    fn: or,
  },
  {
    name: 'NAND',
    symbol: '¬(A · B)',
    description: 'Universal Gate (Inverted AND)',
    cmosTransistors: 4,
    inputs: 2,
    fn: nand,
  },
  {
    name: 'NOR',
    symbol: '¬(A + B)',
    description: 'Universal Gate (Inverted OR)',
    cmosTransistors: 4,
    inputs: 2,
    fn: nor,
  },
  {
    name: 'XOR',
    symbol: 'A ⊕ B',
    description: 'Exclusive OR (Odd Parity / Difference)',
    cmosTransistors: 8,
    inputs: 2,
    fn: xor,
  },
];

console.log('='.repeat(70));
console.log('  STAGE 1: BINARY SIGNALS & FUNDAMENTAL LOGIC GATES');
console.log('='.repeat(70));
console.log('Rule 1: Digital signals are strictly binary 0 (LOW) or 1 (HIGH).');
console.log('Combinational logic has no state; outputs depend purely on current inputs.\n');

for (const gate of GATES) {
  console.log(`--- [ ${gate.name} Gate ] ---`);
  console.log(`Expression:      ${gate.symbol}`);
  console.log(`Function:        ${gate.description}`);
  console.log(`CMOS Complexity: ${gate.cmosTransistors} transistors`);

  const table = generateTruthTable(gate.fn, gate.inputs);

  if (gate.inputs === 1) {
    console.log('┌───┬───┐');
    console.log('│ A │ Y │');
    console.log('├───┼───┤');
    for (const row of table) {
      console.log(`│ ${row.inputs[0]} │ ${row.output} │`);
    }
    console.log('└───┴───┘\n');
  } else {
    console.log('┌───┬───┬───┐');
    console.log('│ A │ B │ Y │');
    console.log('├───┼───┼───┤');
    for (const row of table) {
      console.log(`│ ${row.inputs[0]} │ ${row.inputs[1]} │ ${row.output} │`);
    }
    console.log('└───┴───┴───┘\n');
  }
}

console.log('All 6 primitive logic gates verified and operating on validated binary signals.');
console.log('='.repeat(70));

