/**
 * Example for Version 3.2 LC-3 Virtual Machine
 * Demonstrates:
 *   - Microcoded FSM Control Sequencer (MicroSequencer) driven by Control Store ROM
 *   - Micro-Program Counter (uPC) state transitions:
 *       • State 18: FETCH-1 (MAR <= PC, MemRead=1)
 *       • State 33: FETCH-2 (MDR <= RAM[MAR])
 *       • State 35: FETCH-3 (IR <= MDR, PC <= PC + 1)
 *       • State 32: DECODE  (Micro-branch on opcode)
 *       • State 1 : ADD Execute & Write-Back (Returns to State 18) [5 cycles]
 *       • State 2 : LD Address Calc (Advances to State 25)
 *       • State 25: LD Memory Read & Write-Back (Returns to State 18) [6 cycles]
 *   - Two operational granularities:
 *       1. vm.tick(): Single clock-cycle micro-state transition
 *       2. vm.step(): Multi-cycle macro-step executing complete instructions
 *   - Central Internal Datapath Bus (InternalBus) with tri-state gating (Gate*) and load enables (LD_*)
 */

import VM, { formatConditionCode } from './src/index.js';

const vm = new VM();

const program = [
  '; 1. Load literal 25 into R1 (6 cycles: States 18 -> 33 -> 35 -> 32 -> 2 -> 25)',
  'LD R1, #25',
  '; 2. Load literal -10 into R2 (6 cycles: States 18 -> 33 -> 35 -> 32 -> 2 -> 25)',
  'LD R2, #-10',
  '',
  '; 3. Compute R0 = R1 + R2 = 15 (5 cycles: States 18 -> 33 -> 35 -> 32 -> 1)',
  'ADD R0, R1, R2',
  '',
  '; 4. Compute R3 = R0 + #5 = 20 (5 cycles: States 18 -> 33 -> 35 -> 32 -> 1)',
  'ADD R3, R0, #5',
  '',
  '; 5. Compute R4 = R0 + #-15 = 0, sets ZERO flag (5 cycles: States 18 -> 33 -> 35 -> 32 -> 1)',
  'ADD R4, R0, #-15',
];

console.log('======================================================================');
console.log('   VERSION 3.2 VM: MICROCODED FSM CONTROL SEQUENCER TRACE             ');
console.log('======================================================================\n');

vm.load(program);

console.log('--- PART 1: MICRO-STEPPING INSTRUCTION 1 VIA uPC STATES (vm.tick()) ---');
console.log('Stepping through "LD R1, #25" across the Control Store ROM states:\n');

let tickCount = 0;
while (true) {
  const tickResult = vm.tick();
  if (!tickResult) break;
  tickCount++;

  console.log(`[Clock Tick ${tickResult.cycle}] Micro-State uPC: ${tickResult.uPC} -> ${tickResult.microOp}`);
  tickResult.events.forEach((ev) => console.log(`   ${ev}`));
  console.log(`   Bus State   : ${tickResult.cycleRecord.busState}`);
  console.log(`   MAR: ${tickResult.cycleRecord.latches.MAR} | MDR: ${tickResult.cycleRecord.latches.MDR} | PC: ${tickResult.cycleRecord.latches.PC}`);
  console.log('----------------------------------------------------------------------');

  if (tickResult.instructionComplete) {
    console.log(`>>> Instruction 1 completed in ${tickCount} clock cycles! <<<\n`);
    break;
  }
}

console.log('--- PART 2: MACRO-STEPPING REMAINING INSTRUCTIONS (vm.step()) ---');
let stepIndex = 1;
while (!vm.halted) {
  const stepResult = vm.step();
  if (!stepResult) break;
  stepIndex++;

  console.log(`\n=================== MACRO-STEP ${stepIndex} (Address: ${stepResult.pc}) ===================`);
  console.log(stepResult.description.formatted);
  console.log(`>>> Microcode Flow: ${stepResult.description.uPCPath} (${stepResult.cyclesTaken} cycles) <<<`);
}

console.log('\n======================================================================');
console.log('                    FINAL HARDWARE STORAGE STATE                      ');
console.log('======================================================================');

console.log('\n--- Dedicated Internal CPU Latches ---');
const latches = vm.latches.snapshot();
console.log(`Program Counter (PC)          : ${latches.PC} (0x${latches.PC.toString(16).toUpperCase()})`);
console.log(`Instruction Register (IR)     : 0x${latches.IR.toString(16).padStart(4, '0').toUpperCase()} (0b${latches.IR.toString(2).padStart(16, '0')})`);
console.log(`Memory Address Register (MAR) : ${latches.MAR}`);
console.log(`Memory Data Register (MDR)    : ${latches.MDR}`);
console.log(`Processor Status Reg (PSR)    : 0b${latches.PSR.toString(2).padStart(3, '0')} (${formatConditionCode(latches.PSR)})`);

console.log('\n--- Microcoded FSM Control Sequencer State ---');
console.log(`Micro-Program Counter (uPC)   : ${vm.uPC} (Ready at Entry State 18)`);
console.log(`Total Physical Clock Cycles   : ${vm.clock.currentCycle} cycles`);
console.log(`Total Instructions Executed   : ${vm.instructionCount} instructions`);
console.log(`Average Cycles Per Instruction: ${(vm.clock.currentCycle / vm.instructionCount).toFixed(2)} CPI`);

console.log('\n--- General-Purpose Register File (R0 through R7) ---');
const regSnapshot = vm.regFile.snapshot();
regSnapshot.forEach((val, i) => {
  const signed = (val << 16) >> 16;
  const signedStr = signed < 0 ? ` (signed: ${signed})` : '';
  console.log(`  R${i}: ${val}${signedStr}`);
});

console.log('\n--- Central Internal Datapath Bus ---');
console.log(`Current Bus State             : ${vm.pipeline.internalBus.describeState()}`);
console.log(`Last Bus Transaction          : Driver: ${vm.pipeline.internalBus.lastTransaction.driver}, Value: ${vm.pipeline.internalBus.lastTransaction.value}`);

console.log('\n--- Architectural State ---');
console.log(`Halted: ${vm.halted}`);
console.log('======================================================================\n');
