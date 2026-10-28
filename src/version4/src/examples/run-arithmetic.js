/**
 * Example 1: Arithmetic & Hardware Gate-Level Addition
 *
 * Demonstrates:
 *   1. Assembly and loading of an arithmetic program.
 *   2. Establishing operands R1 = 5, R2 = 3.
 *   3. Executing ADD R0, R1, R2.
 *   4. Inspecting how the gate-level Ripple-Carry Adder calculates 5 + 3 = 8.
 *   5. Synchronous register capture on clock edges.
 *
 * Run with:
 *   node src/version3/src/examples/run-arithmetic.js
 */

import { Assembler } from '../assembler/assembler.js';
import { CPU } from '../cpu/cpu.js';

const source = `
.ORIG 0x3000
AND R1, R1, #0    ; Clear R1 = 0
ADD R1, R1, #5    ; R1 = 5
AND R2, R2, #0    ; Clear R2 = 0
ADD R2, R2, #3    ; R2 = 3
ADD R0, R1, R2    ; R0 = R1 + R2 (5 + 3 = 8 via gate-level adder!)
HALT
.END
`;

console.log('='.repeat(75));
console.log('  EXAMPLE 1: GATE-LEVEL ARITHMETIC EXECUTION (5 + 3 = 8)');
console.log('='.repeat(75));

// 1. Assemble Program
const assembler = new Assembler();
const binary = assembler.assemble(source);

console.log('Assembly Listing:');
for (const stmt of binary.machineCode) {
  console.log(`  [0x${stmt.address.toString(16).toUpperCase()}] ${stmt.hex}  |  ${stmt.raw}`);
}
console.log('');

// 2. Load into CPU Memory
const cpu = new CPU(binary.origin);
cpu.ram.loadProgram(binary.origin, binary.words);

console.log('Initial CPU State:');
console.log(`PC: 0x${cpu.pc.readUint().toString(16).toUpperCase()}, State: ${cpu.controlUnit.currentState}\n`);

// 3. Step Instruction-by-Instruction with Hardware Trace
let instCount = 0;
while (cpu.controlUnit.currentState !== 'HALTED') {
  instCount++;
  console.log(`--- [ Instruction #${instCount} ] ---`);
  
  // Step through each clock cycle of this instruction
  do {
    const cycle = cpu.clock.cycleCount + 1;
    const stateBefore = cpu.controlUnit.currentState;
    cpu.stepClock();
    const trace = cpu.lastTrace;
    console.log(`  Cycle ${String(cycle).padStart(2)}: State=${stateBefore.padEnd(10)} -> ${trace.notes}`);
  } while (cpu.controlUnit.currentState !== 'FETCH_1' && cpu.controlUnit.currentState !== 'HALTED');

  console.log(`  => Current Registers: R0=${cpu.regFile.getReg(0)}, R1=${cpu.regFile.getReg(1)}, R2=${cpu.regFile.getReg(2)}\n`);
}

console.log('='.repeat(75));
console.log('FINAL HARDWARE AUDIT:');
console.log(`R0 (Result):   ${cpu.regFile.getReg(0)} (Expected: 8)`);
console.log(`R1 (Operand):  ${cpu.regFile.getReg(1)} (Expected: 5)`);
console.log(`R2 (Operand):  ${cpu.regFile.getReg(2)} (Expected: 3)`);
console.log(`Total Cycles:  ${cpu.clock.cycleCount}`);
console.log(`CPU Halted:    ${cpu.controlUnit.currentState === 'HALTED' ? 'YES (TRAP 0x25)' : 'NO'}`);

if (cpu.regFile.getReg(0) === 8) {
  console.log('\n[SUCCESS] Hardware gate-level adder correctly calculated 5 + 3 = 8!');
} else {
  console.error('\n[FAILURE] Arithmetic mismatch!');
  process.exit(1);
}
console.log('='.repeat(75));

