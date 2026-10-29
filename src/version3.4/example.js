/**
 * Example for Version 3.4 LC-3 Virtual Machine
 *
 * Demonstrates:
 *   1. Unified 3-Part System Bus (memory/system-bus.js):
 *       • 16-bit Address Bus (lines A15..A0 driven by MAR)
 *       • 16-bit Bidirectional Data Bus (lines D15..D0 driven by RAM/MDR)
 *       • 1-bit Physical Control Bus (MEM_READ, MEM_WRITE, MEM_READY)
 *   2. Central Internal Datapath Bus with 3-bit Gate Selector Codes:
 *       • Code 000 (0): None (Hi-Z)
 *       • Code 001 (1): GatePC
 *       • Code 010 (2): GateMDR
 *       • Code 011 (3): GateALU
 *       • Code 100 (4): GateMARMUX
 *   3. Strict Binary Signals:
 *       • All load enables and control wires represented as physical 0/1 bits.
 *   4. Memory-Mapped I/O (MMIO) and Bus Address Decoder integration.
 */

import VM, { formatConditionCode, DEV_ADDR, BUS_GATE, BUS_GATE_NAMES } from './src/index.js';

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
console.log('   VERSION 3.4 VM: UNIFIED 3-PART SYSTEM BUS & 3-BIT GATE DECODER      ');
console.log('======================================================================\n');

vm.load(program);

// -----------------------------------------------------------------------------
// PART 1: PHYSICAL RAM PROGRAM EXECUTION VIA 3-PART SYSTEM BUS
// -----------------------------------------------------------------------------
console.log('--- PART 1: PROGRAM EXECUTION VIA UNIFIED 3-PART SYSTEM BUS ---');
console.log('Executing instructions across Address Bus, Data Bus, and Control Bus:\n');

let stepIndex = 0;
while (!vm.halted) {
  const stepResult = vm.step();
  if (!stepResult) break;
  stepIndex++;

  console.log(`=================== MACRO-STEP ${stepIndex} (Address: ${stepResult.pc}) ===================`);
  console.log(stepResult.description.formatted);
  console.log(`>>> Microcode Flow: ${stepResult.description.uPCPath} (${stepResult.cyclesTaken} cycles) <<<\n`);
}

// -----------------------------------------------------------------------------
// PART 2: KEYBOARD MMIO INPUT VIA UNIFIED 3-PART SYSTEM BUS
// -----------------------------------------------------------------------------
console.log('======================================================================');
console.log('--- PART 2: KEYBOARD INPUT ACROSS ADDRESS, DATA, & CONTROL BUSES ---');
console.log('======================================================================\n');

console.log('[Step 2.1] CPU polls Keyboard Status Register (KBSR 0xFE00):');
const kbsrBefore = vm.readMemory(DEV_ADDR.KBSR);
const lastTx1 = vm.bus.lastTransaction;
console.log(`   Address Bus (16-bit): ${lastTx1.addressBusDesc}`);
console.log(`   Address Decoder     : ${lastTx1.description} (IO_CS=${lastTx1.deviceChipSelect})`);
console.log(`   Control Bus (1-bit) : ${lastTx1.controlBusDesc}`);
console.log(`   Data Bus (16-bit)   : ${lastTx1.dataBusDesc} -> Ready Bit 15: ${(kbsrBefore & 0x8000) ? 1 : 0} [NO_KEY]`);

console.log('\n[Step 2.2] User types key "Z" on physical keyboard:');
vm.typeChar('Z');

console.log('\n[Step 2.3] CPU polls Keyboard Status Register (KBSR 0xFE00) again:');
const kbsrAfter = vm.readMemory(DEV_ADDR.KBSR);
const lastTx2 = vm.bus.lastTransaction;
console.log(`   Address Bus (16-bit): ${lastTx2.addressBusDesc}`);
console.log(`   Control Bus (1-bit) : ${lastTx2.controlBusDesc}`);
console.log(`   Data Bus (16-bit)   : ${lastTx2.dataBusDesc} -> Ready Bit 15: ${(kbsrAfter & 0x8000) ? 1 : 0} [KEY_READY!]`);

console.log('\n[Step 2.4] Since Ready Bit = 1, CPU reads Keyboard Data Register (KBDR 0xFE02):');
const charData = vm.readMemory(DEV_ADDR.KBDR);
const lastTx3 = vm.bus.lastTransaction;
console.log(`   Address Bus (16-bit): ${lastTx3.addressBusDesc}`);
console.log(`   Control Bus (1-bit) : ${lastTx3.controlBusDesc}`);
console.log(`   Data Bus (16-bit)   : ${lastTx3.dataBusDesc} (ASCII: ${charData} -> Character: '${String.fromCharCode(charData)}')`);

console.log('\n[Step 2.5] Hardware Side Effect: Reading KBDR automatically cleared KBSR Ready Bit:');
const kbsrCleared = vm.readMemory(DEV_ADDR.KBSR);
console.log(`   Polled KBSR: 0x${kbsrCleared.toString(16).padStart(4, '0').toUpperCase()} (Ready Bit 15: ${(kbsrCleared & 0x8000) ? 1 : 0} [CLEARED/IDLE])`);

// -----------------------------------------------------------------------------
// PART 3: DISPLAY MMIO OUTPUT VIA UNIFIED 3-PART SYSTEM BUS
// -----------------------------------------------------------------------------
console.log('\n======================================================================');
console.log('--- PART 3: DISPLAY SCREEN OUTPUT VIA UNIFIED 3-PART SYSTEM BUS ---');
console.log('======================================================================\n');

console.log('[Step 3.1] CPU checks Display Status Register (DSR 0xFE04):');
const dsrVal = vm.readMemory(DEV_ADDR.DSR);
const lastTx4 = vm.bus.lastTransaction;
console.log(`   Address Bus (16-bit): ${lastTx4.addressBusDesc}`);
console.log(`   Control Bus (1-bit) : ${lastTx4.controlBusDesc}`);
console.log(`   Data Bus (16-bit)   : ${lastTx4.dataBusDesc} (Display Ready: ${(dsrVal & 0x8000) ? 1 : 0})`);

console.log('\n[Step 3.2] CPU transmits characters to Display Data Register (DDR 0xFE06):');
const message = 'SYSTEM BUS OK!';
for (const char of message) {
  const ascii = char.charCodeAt(0);
  vm.writeMemory(DEV_ADDR.DDR, ascii);
  const tx = vm.bus.lastTransaction;
  console.log(`   Write Cycle: AddrBus=${tx.addressBusDesc} | DataBus=${tx.dataBusDesc} | CtrlBus=[${tx.controlBusDesc}] -> Display: "${vm.getDisplayOutput()}"`);
}

console.log(`\n>>> Final Hardware Display Screen Output: "${vm.getDisplayOutput()}" <<<\n`);

// -----------------------------------------------------------------------------
// PART 4: FINAL HARDWARE STORAGE & BUS STATE
// -----------------------------------------------------------------------------
console.log('======================================================================');
console.log('                    FINAL HARDWARE STORAGE STATE                      ');
console.log('======================================================================');

console.log('\n--- Dedicated Internal CPU Latches ---');
const latches = vm.latches.snapshot();
console.log(`Program Counter (PC)          : ${latches.PC} (0x${latches.PC.toString(16).toUpperCase()})`);
console.log(`Instruction Register (IR)     : 0x${latches.IR.toString(16).padStart(4, '0').toUpperCase()} (0b${latches.IR.toString(2).padStart(16, '0')})`);
console.log(`Memory Address Register (MAR) : ${latches.MAR} (0x${latches.MAR.toString(16).toUpperCase()})`);
console.log(`Memory Data Register (MDR)    : ${latches.MDR} (0x${latches.MDR.toString(16).toUpperCase()})`);
console.log(`Processor Status Reg (PSR)    : 0b${latches.PSR.toString(2).padStart(3, '0')} (${formatConditionCode(latches.PSR)})`);

console.log('\n--- Central Internal Bus (3-to-8 Decoder State) ---');
console.log(`Current Bus State             : ${vm.pipeline.internalBus.describeState()}`);
console.log(`Active 3-bit Gate Code        : 0b${vm.pipeline.internalBus.gateCode.toString(2).padStart(3, '0')} (${BUS_GATE_NAMES[vm.pipeline.internalBus.gateCode]})`);
console.log(`Last Bus Transaction Value   : ${vm.pipeline.internalBus.lastTransaction.value}`);

console.log('\n--- Unified 3-Part System Bus ---');
console.log(`Address Bus (16-bit)          : ${vm.bus.addressBus.describe()}`);
console.log(`Data Bus (16-bit)             : ${vm.bus.dataBus.describe()}`);
console.log(`Control Bus (1-bit lines)     : ${vm.bus.controlBus.describe()}`);

console.log('\n--- Memory-Mapped I/O Device Registers (0xFE00..0xFFFF) ---');
const mmio = vm.mmioState;
console.log(`Keyboard Status Reg (KBSR)    : 0x${mmio.kbsr.toString(16).padStart(4, '0').toUpperCase()} (Ready: ${mmio.kbsrReady ? 1 : 0})`);
console.log(`Keyboard Data Reg   (KBDR)    : 0x${mmio.kbdr.toString(16).padStart(4, '0').toUpperCase()} (ASCII: ${mmio.kbdr}, Char: '${mmio.kbdrChar || ' '}')`);
console.log(`Display Status Reg  (DSR)     : 0x${mmio.dsr.toString(16).padStart(4, '0').toUpperCase()} (Ready: ${mmio.dsrReady ? 1 : 0})`);
console.log(`Display Data Reg    (DDR)     : 0x${mmio.ddr.toString(16).padStart(4, '0').toUpperCase()} (ASCII: ${mmio.ddr}, Char: '${mmio.ddrChar || ' '}')`);
console.log(`Physical Display Screen Buffer: "${mmio.displayOutput}"`);

console.log('\n--- General-Purpose Register File (R0 through R7) ---');
const regSnapshot = vm.regFile.snapshot();
regSnapshot.forEach((val, i) => {
  const signed = (val << 16) >> 16;
  const signedStr = signed < 0 ? ` (signed: ${signed})` : '';
  console.log(`  R${i}: ${val}${signedStr}`);
});

console.log('\n--- Microcoded FSM Control Sequencer State ---');
console.log(`Micro-Program Counter (uPC)   : ${vm.uPC} (Ready at Entry State 18)`);
console.log(`Total Physical Clock Cycles   : ${vm.clock.currentCycle} cycles`);
console.log(`Total Instructions Executed   : ${vm.instructionCount} instructions`);
console.log(`Average Cycles Per Instruction: ${(vm.clock.currentCycle / vm.instructionCount).toFixed(2)} CPI`);

console.log('\n--- Architectural State ---');
console.log(`Halted: ${vm.halted}`);
console.log('======================================================================\n');
