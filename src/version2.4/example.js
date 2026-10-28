/**
 * Example for Version 2.4 LC-3 Virtual Machine
 * Demonstrates:
 *   - CpuPipeline orchestrating the sequential execution of the 5 distinct phases:
 *       1. phaseFetch()
 *       2. phaseDecode()
 *       3. phaseExecute()
 *       4. phaseMemory()
 *       5. phaseWriteBack()
 *   - Memory Bus Interface mediating access to RAM strictly via MAR and MDR with read/write control lines
 *   - Control Unit asserting micro-architectural control wire signals
 *   - ALU computing 16-bit arithmetic and evaluating condition codes
 *   - Dedicated Storage: RegisterFile (R0-R7) and Hardware Latches (PC, IR, MAR, MDR, PSR)
 */

import VM, { formatConditionCode } from './src/index.js';

const vm = new VM();

const program = [
  '; Initialize registers with literals via memory bus',
  'LD R1, #25',
  'LD R2, #-10',
  '',
  '; Compute R0 = R1 + R2 (25 + -10 = 15)',
  'ADD R0, R1, R2',
  '',
  '; Compute R3 = R0 + #5 (15 + 5 = 20)',
  'ADD R3, R0, #5',
  '',
  '; Compute R4 = R0 + #-15 (15 + -15 = 0, sets ZERO flag)',
  'ADD R4, R0, #-15',
];

console.log('======================================================================');
console.log('   VERSION 2.4 VM: SEQUENTIAL 5-PHASE CPU PIPELINE EXECUTION TRACE    ');
console.log('======================================================================');

// Running with verbose: true automatically outputs the hardware workflow for each step
vm.run(program, { verbose: true });

console.log('\n======================================================================');
console.log('                    FINAL HARDWARE STORAGE STATE                      ');
console.log('======================================================================');

console.log('\n--- Special Hardware Latches ---');
const latches = vm.latches.snapshot();
console.log(`Program Counter (PC)          : ${latches.PC} (0x${latches.PC.toString(16).toUpperCase()})`);
console.log(`Instruction Register (IR)     : 0x${latches.IR.toString(16).padStart(4, '0').toUpperCase()} (0b${latches.IR.toString(2).padStart(16, '0')})`);
console.log(`Memory Address Register (MAR) : ${latches.MAR}`);
console.log(`Memory Data Register (MDR)    : ${latches.MDR}`);
console.log(`Processor Status Reg (PSR)    : 0b${latches.PSR.toString(2).padStart(3, '0')} (${formatConditionCode(latches.PSR)})`);

console.log('\n--- Memory Bus Interface State ---');
console.log(`Last Bus Transaction          : ${JSON.stringify(vm.bus.lastTransaction)}`);
console.log(`RAM at Address 12293 (Literal): ${vm.bus.inspect(12293)}`);
console.log(`RAM at Address 12294 (Literal): ${vm.bus.inspect(12294)}`);

console.log('\n--- Register File (R0 through R7) ---');
const regSnapshot = vm.regFile.snapshot();
regSnapshot.forEach((val, i) => {
  const signed = (val << 16) >> 16;
  const signedStr = signed < 0 ? ` (signed: ${signed})` : '';
  console.log(`  R${i}: ${val}${signedStr}`);
});

console.log('\n--- Architectural State ---');
console.log(`Halted: ${vm.halted}`);
console.log('======================================================================\n');
