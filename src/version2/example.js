/**
 * Example for Version 2 LC-3 Virtual Machine
 * Demonstrates:
 *   - Automatic program execution with detailed step explanations
 *   - Loading memory location in decimal format
 *   - Binary instruction representation
 *   - Opcode details and operand explanations
 */

import VM from './src/index.js';

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
console.log('        VERSION 2 VM: DETAILED STEP-BY-STEP EXECUTION TRACE           ');
console.log('======================================================================');

// Running with verbose: true automatically outputs detailed step-by-step descriptions
vm.run(program, { verbose: true });

console.log('\n======================================================================');
console.log('                    FINAL MACHINE ARCHITECTURE STATE                  ');
console.log('======================================================================');
console.log(`R0: ${vm.reg[0]}`);
console.log(`R1: ${vm.reg[1]}`);
console.log(`R2: ${vm.reg[2]} (signed: ${(vm.reg[2] << 16) >> 16})`);
console.log(`R3: ${vm.reg[3]}`);
console.log(`R4: ${vm.reg[4]}`);
console.log(`PC: ${vm.reg[8]} (0x${vm.reg[8].toString(16).toUpperCase()})`);
console.log(`PSR: 0b${vm.reg[9].toString(2).padStart(3, '0')}`);
console.log(`Halted: ${vm.halted}`);
console.log('======================================================================\n');
