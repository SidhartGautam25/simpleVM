/**
 * Example for Version 3.3 LC-3 Virtual Machine
 *
 * Demonstrates:
 *   1. Memory-Mapped I/O (MMIO) & Bus Address Decoder (`memory/address-decoder.js`)
 *   2. Address Bus Partitioning:
 *       • 0x0000 - 0xFDFF (0 to 65023): Physical RAM (Asserts RAM_CS)
 *       • 0xFE00 - 0xFFFF (65024 to 65535): Hardware Device Registers (Asserts IO_CS)
 *   3. Hardware Device Registers:
 *       • 0xFE00 (KBSR): Keyboard Status Register (Bit 15 = Ready bit)
 *       • 0xFE02 (KBDR): Keyboard Data Register (Reading clears KBSR ready bit!)
 *       • 0xFE04 (DSR) : Display Status Register (Bit 15 = Ready bit)
 *       • 0xFE06 (DDR) : Display Data Register (Writing transmits character to screen!)
 *   4. Elimination of software console.log abstractions in favor of real hardware MMIO.
 *   5. Seamless coordination with Microcoded FSM Sequencer (uPC) and Central Internal Bus.
 */

import VM, { formatConditionCode, DEV_ADDR } from './src/index.js';

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
console.log('   VERSION 3.3 VM: MEMORY-MAPPED I/O & BUS ADDRESS DECODER TRACE      ');
console.log('======================================================================\n');

vm.load(program);

// -----------------------------------------------------------------------------
// PART 1: PHYSICAL RAM PROGRAM EXECUTION (Address Decoder -> RAM_CS)
// -----------------------------------------------------------------------------
console.log('--- PART 1: PHYSICAL RAM PROGRAM EXECUTION VIA ADDRESS DECODER ---');
console.log('Executing instructions loaded in RAM (0x3000..0x3004). Address Decoder monitors MAR:\n');

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
// PART 2: KEYBOARD MMIO INPUT (KBSR 0xFE00 & KBDR 0xFE02)
// -----------------------------------------------------------------------------
console.log('======================================================================');
console.log('--- PART 2: HARDWARE KEYBOARD INPUT VIA MMIO & ADDRESS DECODER ---');
console.log('======================================================================\n');

console.log('[Step 2.1] CPU polls Keyboard Status Register (KBSR 0xFE00) before any key is pressed:');
const kbsrBefore = vm.readMemory(DEV_ADDR.KBSR);
const lastTx1 = vm.bus.lastTransaction;
console.log(`   Address Bus: MAR = 0x${lastTx1.address.toString(16).toUpperCase()} (${lastTx1.address})`);
console.log(`   Address Decoder: ${lastTx1.description} (Assert IO_CS: ${lastTx1.deviceChipSelect})`);
console.log(`   Data Bus   : MDR <= 0x${kbsrBefore.toString(16).padStart(4, '0').toUpperCase()} (Ready Bit 15: ${(kbsrBefore & 0x8000) ? '1 [KEY_READY]' : '0 [NO_KEY]'})`);

console.log('\n[Step 2.2] User types key "K" on the physical keyboard peripheral:');
vm.typeChar('K');

console.log('\n[Step 2.3] CPU polls Keyboard Status Register (KBSR 0xFE00) again:');
const kbsrAfter = vm.readMemory(DEV_ADDR.KBSR);
const lastTx2 = vm.bus.lastTransaction;
console.log(`   Address Bus: MAR = 0x${lastTx2.address.toString(16).toUpperCase()} (${lastTx2.address})`);
console.log(`   Address Decoder: ${lastTx2.description} (Assert IO_CS: ${lastTx2.deviceChipSelect})`);
console.log(`   Data Bus   : MDR <= 0x${kbsrAfter.toString(16).padStart(4, '0').toUpperCase()} (Ready Bit 15: ${(kbsrAfter & 0x8000) ? '1 [KEY_READY]' : '0 [NO_KEY]'})`);

console.log('\n[Step 2.4] Since Ready Bit = 1, CPU reads Keyboard Data Register (KBDR 0xFE02):');
const charData = vm.readMemory(DEV_ADDR.KBDR);
const lastTx3 = vm.bus.lastTransaction;
console.log(`   Address Bus: MAR = 0x${lastTx3.address.toString(16).toUpperCase()} (${lastTx3.address})`);
console.log(`   Address Decoder: ${lastTx3.description} (Assert IO_CS: ${lastTx3.deviceChipSelect})`);
console.log(`   Data Bus   : MDR <= 0x${charData.toString(16).padStart(4, '0').toUpperCase()} (ASCII: ${charData} -> Character: '${String.fromCharCode(charData)}')`);

console.log('\n[Step 2.5] Verify HARDWARE SIDE EFFECT: Reading KBDR automatically cleared KBSR Ready Bit:');
const kbsrCleared = vm.readMemory(DEV_ADDR.KBSR);
console.log(`   Polled KBSR: 0x${kbsrCleared.toString(16).padStart(4, '0').toUpperCase()} (Ready Bit 15: ${(kbsrCleared & 0x8000) ? '1 [KEY_READY]' : '0 [CLEARED/IDLE]'})`);

// -----------------------------------------------------------------------------
// PART 3: DISPLAY SCREEN MMIO OUTPUT (DSR 0xFE04 & DDR 0xFE06)
// -----------------------------------------------------------------------------
console.log('\n======================================================================');
console.log('--- PART 3: HARDWARE DISPLAY OUTPUT VIA MMIO & ADDRESS DECODER ---');
console.log('======================================================================\n');

console.log('[Step 3.1] CPU checks Display Status Register (DSR 0xFE04):');
const dsrVal = vm.readMemory(DEV_ADDR.DSR);
const lastTx4 = vm.bus.lastTransaction;
console.log(`   Address Bus: MAR = 0x${lastTx4.address.toString(16).toUpperCase()} (${lastTx4.address})`);
console.log(`   Address Decoder: ${lastTx4.description} (Assert IO_CS: ${lastTx4.deviceChipSelect})`);
console.log(`   Data Bus   : MDR <= 0x${dsrVal.toString(16).padStart(4, '0').toUpperCase()} (Ready Bit 15: ${(dsrVal & 0x8000) ? '1 [DISPLAY_READY]' : '0 [BUSY]'})`);

console.log('\n[Step 3.2] CPU transmits characters to Display Data Register (DDR 0xFE06) via Memory Bus:');
const message = 'HELLO, WORLD!';
for (const char of message) {
  const ascii = char.charCodeAt(0);
  vm.writeMemory(DEV_ADDR.DDR, ascii);
  const tx = vm.bus.lastTransaction;
  console.log(`   Bus Write: MAR=0x${tx.address.toString(16).toUpperCase()} (${tx.deviceName}), MDR=0x${tx.data.toString(16).toUpperCase()} ('${char}') -> Screen Buffer: "${vm.getDisplayOutput()}"`);
}

console.log(`\n>>> Final Hardware Display Screen Output: "${vm.getDisplayOutput()}" <<<\n`);

// -----------------------------------------------------------------------------
// PART 4: FINAL HARDWARE STORAGE & MMIO STATE
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

console.log('\n--- Memory-Mapped I/O Device Registers (0xFE00..0xFFFF) ---');
const mmio = vm.mmioState;
console.log(`Keyboard Status Reg (KBSR)    : 0x${mmio.kbsr.toString(16).padStart(4, '0').toUpperCase()} (Ready Bit 15: ${mmio.kbsrReady ? 1 : 0})`);
console.log(`Keyboard Data Reg   (KBDR)    : 0x${mmio.kbdr.toString(16).padStart(4, '0').toUpperCase()} (ASCII: ${mmio.kbdr}, Char: '${mmio.kbdrChar || ' '}')`);
console.log(`Display Status Reg  (DSR)     : 0x${mmio.dsr.toString(16).padStart(4, '0').toUpperCase()} (Ready Bit 15: ${mmio.dsrReady ? 1 : 0})`);
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
