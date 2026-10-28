/**
 * Example for Version 3.1 LC-3 Virtual Machine
 * Demonstrates:
 *   - Physical Clock Generator (ClockGenerator) pulsing clock cycles
 *   - Two distinct operational granularities:
 *       1. vm.tick(): Single clock-cycle micro-step (Cycle 1 -> Cycle 2 -> ... -> Complete)
 *       2. vm.step(): Multi-cycle macro-step executing complete instructions
 *   - Instruction Cycle Timing:
 *       • LD  takes 6 physical clock cycles
 *       • ADD takes 5 physical clock cycles
 *   - Central Internal Datapath Bus (InternalBus) with tri-state gating (Gate*) and load enables (LD_*)
 */

import VM, { formatConditionCode } from './src/index.js';

const vm = new VM();

const program = [
  '; 1. Load literal 25 into R1 (6 clock cycles)',
  'LD R1, #25',
  '; 2. Load literal -10 into R2 (6 clock cycles)',
  'LD R2, #-10',
  '',
  '; 3. Compute R0 = R1 + R2 = 15 (5 clock cycles)',
  'ADD R0, R1, R2',
  '',
  '; 4. Compute R3 = R0 + #5 = 20 (5 clock cycles)',
  'ADD R3, R0, #5',
  '',
  '; 5. Compute R4 = R0 + #-15 = 0, sets ZERO flag (5 clock cycles)',
  'ADD R4, R0, #-15',
];

console.log('======================================================================');
console.log('   VERSION 3.1 VM: MULTI-CYCLE CLOCK & MICRO-STEPPING TRACE           ');
console.log('======================================================================\n');

vm.load(program);

console.log('--- PART 1: MICRO-STEPPING INSTRUCTION 1 CYCLE-BY-CYCLE (vm.tick()) ---');
console.log('Instruction 1 is "LD R1, #25". Stepping through its 6 clock cycles:\n');

let tickCount = 0;
while (true) {
  const tickResult = vm.tick();
  if (!tickResult) break;
  tickCount++;

  console.log(`[Clock Tick ${tickResult.cycle}] Micro-Operation: ${tickResult.microOp}`);
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
// Step through instructions 2 through 5 using vm.step()
let stepIndex = 1;
while (!vm.halted) {
  const stepResult = vm.step();
  if (!stepResult) break;
  stepIndex++;

  console.log(`\n=================== MACRO-STEP ${stepIndex} (Address: ${stepResult.pc}) ===================`);
  console.log(stepResult.description.formatted);
  console.log(`>>> Instruction took ${stepResult.cyclesTaken} clock cycles (Total CPU Clock Cycles: ${vm.clock.currentCycle}) <<<`);
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

console.log('\n--- Clock Generator State ---');
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
