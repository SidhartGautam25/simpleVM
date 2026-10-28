/**
 * Example for Version 2.1 LC-3 Virtual Machine
 * Demonstrates:
 *   - Dedicated Storage Units: RegisterFile (R0-R7) and Hardware Latches (PC, IR, MAR, MDR, PSR)
 *   - 5-Phase hardware execution trace (Fetch, Decode, Execute, Memory, Write-Back)
 *   - Dual read ports and gated write-enable port
 *   - Memory bus communication via MAR and MDR
 */

import VM, { formatConditionCode } from './src/index.js';

const vm = new VM();

const program = [
  '; Initialize registers with literals',
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
console.log('    VERSION 2.1 VM: HARDWARE STORAGE & 5-PHASE EXECUTION TRACE        ');
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
