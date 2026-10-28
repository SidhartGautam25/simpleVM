/**
 * Example 3: Looping & Conditional Branching (PSR & Program Counter)
 *
 * Demonstrates:
 *   1. Initializing sum = 0 (R0) and count = 5 (R1).
 *   2. Looping:
 *        LOOP:
 *          sum += count      (ADD R0, R0, R1 via gate-level adder)
 *          count -= 1        (ADD R1, R1, #-1)
 *          BRp LOOP          (Branch if count was positive: PSR bit P == 1)
 *   3. Verifying loop termination when count reaches 0 (PSR bit Z becomes 1, P becomes 0).
 *   4. Verifying final accumulated sum in R0 equals 15 (5 + 4 + 3 + 2 + 1).
 *
 * Run with:
 *   node src/version3/src/examples/run-loop.js
 */

import { Assembler } from '../assembler/assembler.js';
import { CPU } from '../cpu/cpu.js';

const source = `
.ORIG 0x3000
AND R0, R0, #0    ; sum = 0
AND R1, R1, #0
ADD R1, R1, #5    ; count = 5

LOOP:
ADD R0, R0, R1    ; sum = sum + count
ADD R1, R1, #-1   ; count = count - 1 (updates PSR flags)
BRp LOOP          ; Repeat if count > 0 (Positive flag set)

HALT
.END
`;

console.log('='.repeat(75));
console.log('  EXAMPLE 3: CONDITIONAL BRANCHING & LOOP ACCUMULATION (SUM 1..5 = 15)');
console.log('='.repeat(75));

const assembler = new Assembler();
const binary = assembler.assemble(source);

console.log('Assembly Listing:');
for (const stmt of binary.machineCode) {
  console.log(`  [0x${stmt.address.toString(16).toUpperCase()}] ${stmt.hex}  |  ${stmt.raw}`);
}
console.log(`Symbols:`, binary.symbols);
console.log('');

const cpu = new CPU(binary.origin);
cpu.ram.loadProgram(binary.origin, binary.words);

let instCount = 0;
while (cpu.controlUnit.currentState !== 'HALTED') {
  instCount++;
  
  // Step full instruction
  cpu.stepInstruction();

  const trace = cpu.lastTrace;
  const psrVal = cpu.psr.readUint();
  const psrStr = `N=${(psrVal >> 2) & 1} Z=${(psrVal >> 1) & 1} P=${psrVal & 1}`;
  console.log(
    `[Inst #${String(instCount).padStart(2)}] PC=0x${cpu.pc.readUint().toString(16).toUpperCase()} | PSR=[${psrStr}] | R0(sum)=${String(cpu.regFile.getReg(0)).padStart(2)} | R1(count)=${cpu.regFile.getReg(1)} | ${trace.notes}`
  );

  if (instCount > 50) {
    console.error('Watchdog timeout: potential infinite loop detected!');
    break;
  }
}

console.log('='.repeat(75));
console.log('FINAL LOOP AUDIT:');
console.log(`R0 (Sum 1..5):   ${cpu.regFile.getReg(0)} (Expected: 15)`);
console.log(`R1 (Final Count):${cpu.regFile.getReg(1)} (Expected: 0)`);
console.log(`Total Cycles:    ${cpu.clock.cycleCount}`);
console.log(`CPU Halted:      ${cpu.controlUnit.currentState === 'HALTED' ? 'YES' : 'NO'}`);

if (cpu.regFile.getReg(0) === 15 && cpu.regFile.getReg(1) === 0) {
  console.log('\n[SUCCESS] Loop executed and branched accurately using modeled PSR condition flags!');
} else {
  console.error('\n[FAILURE] Loop calculation mismatch!');
  process.exit(1);
}
console.log('='.repeat(75));

