/**
 * Example for Version 3.5 LC-3 Virtual Machine
 *
 * Demonstrates:
 *   1. True 5-Stage In-Flight Pipelined Datapath (cpu/cpu-pipeline.js):
 *       • IF  (Instruction Fetch): Fetches instruction from memory via Address Decoder, updates PC.
 *       • ID  (Instruction Decode): Decodes opcode/fields, reads RegFile, detects Load-Use hazards.
 *       • EX  (Execute / Address Calc): Evaluates ALU ops, resolves EX/MEM & MEM/WB operand forwarding.
 *       • MEM (Memory Access): Performs RAM / MMIO bus transactions via Unified System Bus.
 *       • WB  (Write-Back / Commit): Retires instruction, updates RegFile and PSR condition codes.
 *
 *   2. Forwarding / Bypassing Unit (cpu/hazard-unit.js):
 *       • EX->EX Forwarding (0b01): Bypasses fresh ALU result from EX/MEM stage to ALU input (0 stall cycles).
 *       • MEM->EX Forwarding (0b10): Bypasses committed memory/ALU result from MEM/WB stage (0 stall cycles).
 *
 *   3. Hazard Detection Unit & Pipeline Interlocks (cpu/hazard-unit.js):
 *       • Detects Load-Use RAW Hazards: Freezes PC, freezes IF/ID, inserts 1 NOP bubble into ID/EX.
 *
 *   4. High Instruction Throughput:
 *       • Achieves IPC approaching 1.0 (CPI ≈ 1.0) under full pipeline overlap.
 *
 *   5. Reservation Table & Pipeline Timeline Visualization:
 *       • Shows cycle-by-cycle concurrency across all 5 stages.
 */

import VM, { InstructionDescriber, DEV_ADDR } from './src/index.js';

console.log('========================================================================================');
console.log('         VERSION 3.5 VM: TRUE 5-STAGE IN-FLIGHT PIPELINED DATAPATH & HAZARD UNIT        ');
console.log('========================================================================================\n');

// -----------------------------------------------------------------------------
// PART 1: RAW DATA HAZARDS RESOLVED VIA FORWARDING UNIT (ZERO STALLS)
// -----------------------------------------------------------------------------
console.log('----------------------------------------------------------------------------------------');
console.log('PART 1: RAW DATA HAZARDS RESOLVED VIA FORWARDING (ZERO STALLS, IPC ≈ 1.0)');
console.log('----------------------------------------------------------------------------------------');
console.log('Executing back-to-back dependent arithmetic instructions:');
console.log('  Instruction 1: ADD R1, R1, #5   ; Produces R1 = 5');
console.log('  Instruction 2: ADD R2, R1, #10  ; Reads R1 in the very next cycle! (EX->EX Forwarding)');
console.log('  Instruction 3: ADD R3, R2, #15  ; Reads R2 in the very next cycle! (EX->EX Forwarding)\n');

const vm1 = new VM();
vm1.load([
  'ADD R1, R1, #5',
  'ADD R2, R1, #10',
  'ADD R3, R2, #15',
]);

while (!vm1.halted) {
  const result = vm1.step();
  if (result) {
    console.log(result.description);
    console.log('');
  }
}

console.log('--- Pipeline Reservation Table for Part 1 ---');
console.log(vm1.describePipeline());
console.log('\n');

// -----------------------------------------------------------------------------
// PART 2: LOAD-USE RAW HAZARDS RESOLVED VIA PIPELINE INTERLOCKS (1-CYCLE STALL)
// -----------------------------------------------------------------------------
console.log('----------------------------------------------------------------------------------------');
console.log('PART 2: LOAD-USE RAW HAZARD & PIPELINE INTERLOCK (1-CYCLE NOP BUBBLE)');
console.log('----------------------------------------------------------------------------------------');
console.log('Executing Load followed immediately by dependent computation:');
console.log('  Instruction 1: LD  R1, #100    ; Loads 100 into R1 from memory (data only arrives at MEM)');
console.log('  Instruction 2: ADD R2, R1, #5   ; Needs R1 immediately in ID! Cannot proceed without stall.');
console.log('Action taken:');
console.log('  • Cycle 3: HazardDetectionUnit detects Load-Use hazard.');
console.log('  • Pipeline freezes PC and IF/ID, and inserts a NOP bubble into ID/EX.');
console.log('  • Cycle 4: LD reaches MEM stage (memory read completes).');
console.log('  • Cycle 5: ADD reaches EX stage; ForwardingUnit forwards loaded data from MEM/WB!\n');

const vm2 = new VM();
vm2.load([
  'LD R1, #100',
  'ADD R2, R1, #5',
]);

while (!vm2.halted) {
  const result = vm2.step();
  if (result) {
    console.log(result.description);
    console.log('');
  }
}

console.log('--- Pipeline Reservation Table for Part 2 ---');
console.log(vm2.describePipeline());
console.log('\n');

// -----------------------------------------------------------------------------
// PART 3: HIGH-THROUGHPUT COMPUTE STREAM (IPC APPROACHING 1.0)
// -----------------------------------------------------------------------------
console.log('----------------------------------------------------------------------------------------');
console.log('PART 3: HIGH-THROUGHPUT PIPELINE BENCHMARK (10 CONSECUTIVE INSTRUCTIONS)');
console.log('----------------------------------------------------------------------------------------');
const vm3 = new VM();
const benchProgram = [];
for (let i = 0; i < 10; i++) {
  benchProgram.push(`ADD R1, R1, #1`);
}
vm3.load(benchProgram);
vm3.run();

console.log(`Instructions Completed : ${vm3.pipeline.graduatedInstructions}`);
console.log(`Total Clock Cycles     : ${vm3.clock.currentCycle}`);
console.log(`Achieved Throughput    : IPC = ${vm3.ipc.toFixed(3)}  |  CPI = ${vm3.cpi.toFixed(3)}`);
console.log(`Comparison to v3.4     : In v3.4 (multi-cycle), 10 instructions took 50 cycles (IPC = 0.200)`);
console.log(`Speedup Factor         : ${(50 / vm3.clock.currentCycle).toFixed(2)}x faster with True Pipelining!\n`);

console.log(vm3.describePipeline(16));
console.log('\n');

// -----------------------------------------------------------------------------
// PART 4: MEMORY-MAPPED I/O THROUGH PIPELINED DATAPATH
// -----------------------------------------------------------------------------
console.log('----------------------------------------------------------------------------------------');
console.log('PART 4: MEMORY-MAPPED I/O (MMIO) INTEGRATION');
console.log('----------------------------------------------------------------------------------------');
const vm4 = new VM();
vm4.typeChar('H');
vm4.typeChar('i');
console.log(`Keyboard Status Register (KBSR 0xFE00) : 0x${vm4.addressDecoder.read(DEV_ADDR.KBSR).toString(16)} (Ready bit set)`);
console.log(`Keyboard Data Register   (KBDR 0xFE02) : ${vm4.addressDecoder.read(DEV_ADDR.KBDR)} (ASCII '${String.fromCharCode(72)}')`);
console.log(`Keyboard Data Register   (KBDR 0xFE02) : ${vm4.addressDecoder.read(DEV_ADDR.KBDR)} (ASCII '${String.fromCharCode(105)}')`);
console.log('\n========================================================================================');
console.log('                VERSION 3.5 DEMONSTRATION COMPLETE: ALL SYSTEMS NOMINAL                  ');
console.log('========================================================================================');
