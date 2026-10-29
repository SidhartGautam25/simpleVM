import { describe, it } from 'node:test';
import assert from 'node:assert';
import VM, {
  signExtend,
  toUint16,
  extractBits,
  calculateConditionFlag,
  InstructionDecoder,
  InstructionDescriber,
  Assembler,
  RegisterFile,
  Latches,
  ControlUnit,
  ALU,
  MemoryBusInterface,
  AddressDecoder,
  InternalBus,
  ClockGenerator,
  MicroSequencer,
  CONTROL_STORE_ROM,
  COND,
  CpuPipeline,
  RAM_START,
  RAM_END,
  MMIO_START,
  MMIO_END,
  DEV_ADDR,
  READY_BIT,
  FLAG_NEGATIVE,
  FLAG_ZERO,
  FLAG_POSITIVE,
  OPCODE,
} from '../src/index.js';

describe('Version 3.3 - Bit Utilities & Architectural Constants', () => {
  it('sign-extends 5-bit numbers', () => {
    assert.strictEqual(signExtend(0b00001, 5), 1);
    assert.strictEqual(signExtend(0b01111, 5), 15);
    assert.strictEqual(signExtend(0b10000, 5), -16);
    assert.strictEqual(signExtend(0b11111, 5), -1);
  });

  it('sign-extends 9-bit numbers', () => {
    assert.strictEqual(signExtend(0b000000001, 9), 1);
    assert.strictEqual(signExtend(0b111111111, 9), -1);
  });

  it('clamps numbers to 16-bit unsigned range', () => {
    assert.strictEqual(toUint16(0x10005), 5);
    assert.strictEqual(toUint16(-1), 0xFFFF);
  });

  it('verifies MMIO and RAM address boundaries', () => {
    assert.strictEqual(RAM_START, 0x0000);
    assert.strictEqual(RAM_END, 0xFDFF);
    assert.strictEqual(MMIO_START, 0xFE00);
    assert.strictEqual(MMIO_END, 0xFFFF);
    assert.strictEqual(DEV_ADDR.KBSR, 0xFE00);
    assert.strictEqual(DEV_ADDR.KBDR, 0xFE02);
    assert.strictEqual(DEV_ADDR.DSR,  0xFE04);
    assert.strictEqual(DEV_ADDR.DDR,  0xFE06);
    assert.strictEqual(READY_BIT, 0x8000);
  });
});

describe('Version 3.3 - Bus Address Decoder (Hardware Decoding Logic)', () => {
  it('routes addresses 0x0000 through 0xFDFF to physical RAM (asserts RAM_CS)', () => {
    const decoder = new AddressDecoder();

    const d1 = decoder.decode(0x0000);
    assert.strictEqual(d1.target, 'RAM');
    assert.strictEqual(d1.ramChipSelect, true);
    assert.strictEqual(d1.deviceChipSelect, false);

    const d2 = decoder.decode(0x3000);
    assert.strictEqual(d2.target, 'RAM');
    assert.strictEqual(d2.ramChipSelect, true);
    assert.strictEqual(d2.deviceChipSelect, false);

    const d3 = decoder.decode(0xFDFF);
    assert.strictEqual(d3.target, 'RAM');
    assert.strictEqual(d3.ramChipSelect, true);
    assert.strictEqual(d3.deviceChipSelect, false);
  });

  it('routes addresses 0xFE00 through 0xFFFF to MMIO Device Registers (asserts IO_CS)', () => {
    const decoder = new AddressDecoder();

    const dKbsr = decoder.decode(0xFE00);
    assert.strictEqual(dKbsr.target, 'DEVICE');
    assert.strictEqual(dKbsr.ramChipSelect, false);
    assert.strictEqual(dKbsr.deviceChipSelect, true);
    assert.strictEqual(dKbsr.deviceName, 'KBSR');

    const dKbdr = decoder.decode(0xFE02);
    assert.strictEqual(dKbdr.deviceName, 'KBDR');

    const dDsr = decoder.decode(0xFE04);
    assert.strictEqual(dDsr.deviceName, 'DSR');

    const dDdr = decoder.decode(0xFE06);
    assert.strictEqual(dDdr.deviceName, 'DDR');

    const dReserved = decoder.decode(0xFE10);
    assert.strictEqual(dReserved.target, 'DEVICE');
    assert.strictEqual(dReserved.deviceName, 'RESERVED_DEVICE');
  });

  it('throws RangeError for addresses exceeding 16-bit space', () => {
    const decoder = new AddressDecoder();
    assert.throws(() => decoder.decode(-1), RangeError);
    assert.throws(() => decoder.decode(0x10000), RangeError);
  });
});

describe('Version 3.3 - Hardware Device Registers & Peripheral Side Effects', () => {
  it('handles Keyboard Status (KBSR) and Data (KBDR) with automatic ready-bit clearing', () => {
    const decoder = new AddressDecoder();
    const latches = new Latches(0x3000, FLAG_ZERO);

    // Initial state: KBSR ready bit is 0
    const initialKbsr = decoder.read(DEV_ADDR.KBSR, latches);
    assert.strictEqual(initialKbsr, 0x0000);
    assert.strictEqual((initialKbsr & READY_BIT), 0);

    // User types key 'A' (ASCII 65)
    decoder.typeChar('A');

    // Polling KBSR now reports Ready Bit 15 = 1 (0x8000)
    const polledKbsr = decoder.read(DEV_ADDR.KBSR, latches);
    assert.strictEqual(polledKbsr, 0x8000);
    assert.strictEqual((polledKbsr & READY_BIT) !== 0, true);

    // Reading KBDR returns ASCII 65
    const charRead = decoder.read(DEV_ADDR.KBDR, latches);
    assert.strictEqual(charRead, 65);
    assert.strictEqual(latches.MDR, 65);

    // HARDWARE SIDE EFFECT: KBSR ready bit must now be automatically cleared back to 0!
    const clearedKbsr = decoder.read(DEV_ADDR.KBSR, latches);
    assert.strictEqual(clearedKbsr, 0x0000);
    assert.strictEqual((clearedKbsr & READY_BIT), 0);
  });

  it('queues multiple keyboard inputs and advances on each KBDR read', () => {
    const decoder = new AddressDecoder();
    const latches = new Latches(0x3000, FLAG_ZERO);

    decoder.queueInput('XYZ');

    // First char: 'X' (88)
    assert.strictEqual(decoder.read(DEV_ADDR.KBSR, latches), 0x8000);
    assert.strictEqual(decoder.read(DEV_ADDR.KBDR, latches), 88);

    // Second char: 'Y' (89)
    assert.strictEqual(decoder.read(DEV_ADDR.KBSR, latches), 0x8000);
    assert.strictEqual(decoder.read(DEV_ADDR.KBDR, latches), 89);

    // Third char: 'Z' (90)
    assert.strictEqual(decoder.read(DEV_ADDR.KBSR, latches), 0x8000);
    assert.strictEqual(decoder.read(DEV_ADDR.KBDR, latches), 90);

    // Buffer empty: KBSR clears to 0
    assert.strictEqual(decoder.read(DEV_ADDR.KBSR, latches), 0x0000);
  });

  it('handles Display Status (DSR) and Display Data (DDR) screen output', () => {
    const decoder = new AddressDecoder();
    const latches = new Latches(0x3000, FLAG_ZERO);

    // DSR should report display ready (0x8000)
    const dsr = decoder.read(DEV_ADDR.DSR, latches);
    assert.strictEqual(dsr, 0x8000);

    // Writing characters to DDR transmits to screen buffer
    decoder.write(DEV_ADDR.DDR, 'C'.charCodeAt(0), latches);
    decoder.write(DEV_ADDR.DDR, 'P'.charCodeAt(0), latches);
    decoder.write(DEV_ADDR.DDR, 'U'.charCodeAt(0), latches);

    assert.strictEqual(decoder.getDisplayOutput(), 'CPU');
    assert.strictEqual(decoder.ddr, 'U'.charCodeAt(0));

    decoder.clearDisplayOutput();
    assert.strictEqual(decoder.getDisplayOutput(), '');
  });
});

describe('Version 3.3 - MemoryBusInterface Integration with AddressDecoder', () => {
  it('reads and writes to RAM via MAR/MDR through AddressDecoder', () => {
    const bus = new MemoryBusInterface();
    const latches = new Latches(0x3000, FLAG_ZERO);

    // Write to RAM at address 0x3050
    latches.latchMAR(0x3050);
    latches.latchMDR(0xABCD);
    const writeOk = bus.writeCycle(latches, true);
    assert.strictEqual(writeOk, true);
    assert.strictEqual(bus.lastTransaction.target, 'RAM');
    assert.strictEqual(bus.lastTransaction.ramChipSelect, true);
    assert.strictEqual(bus.lastTransaction.deviceChipSelect, false);

    // Read back from RAM at address 0x3050
    latches.latchMDR(0);
    const readVal = bus.readCycle(latches, true);
    assert.strictEqual(readVal, 0xABCD);
    assert.strictEqual(latches.MDR, 0xABCD);
    assert.strictEqual(bus.lastTransaction.target, 'RAM');
  });

  it('routes MMIO reads and writes through MemoryBusInterface via MAR/MDR', () => {
    const bus = new MemoryBusInterface();
    const latches = new Latches(0x3000, FLAG_ZERO);

    // Write character 'H' (72) to DDR (0xFE06)
    latches.latchMAR(DEV_ADDR.DDR);
    latches.latchMDR(72);
    bus.writeCycle(latches, true);

    assert.strictEqual(bus.lastTransaction.target, 'DEVICE');
    assert.strictEqual(bus.lastTransaction.deviceName, 'DDR');
    assert.strictEqual(bus.lastTransaction.deviceChipSelect, true);
    assert.strictEqual(bus.getDisplayOutput(), 'H');

    // Simulate key 'Q' (81) and read via MAR=0xFE02
    bus.typeChar('Q');
    latches.latchMAR(DEV_ADDR.KBDR);
    const readKey = bus.readCycle(latches, true);

    assert.strictEqual(readKey, 81);
    assert.strictEqual(latches.MDR, 81);
    assert.strictEqual(bus.lastTransaction.deviceName, 'KBDR');
  });
});

describe('Version 3.3 - Full VM Execution & Telemetry with MMIO', () => {
  it('executes instructions and updates Address Decoder telemetry', () => {
    const vm = new VM();
    vm.load([
      'LD R1, #25',
      'LD R2, #-10',
      'ADD R0, R1, R2',
    ]);

    const s1 = vm.step();
    assert.strictEqual(s1.cyclesTaken, 6);
    assert.match(s1.description.formatted, /Address Bus Decoding/);
    assert.match(s1.description.formatted, /Physical RAM/);
    assert.match(s1.description.formatted, /MMIO Hardware Device Registers/);

    const s2 = vm.step();
    assert.strictEqual(s2.cyclesTaken, 6);

    const s3 = vm.step();
    assert.strictEqual(s3.cyclesTaken, 5);
    assert.strictEqual(vm.regFile.readPortA(0), 15);
  });

  it('exposes VM MMIO helper methods for keyboard input and screen output', () => {
    const vm = new VM();

    // Type character 'M' and read through VM memory interface
    vm.typeChar('M');
    assert.strictEqual(vm.mmioState.kbsrReady, true);

    const charVal = vm.readMemory(DEV_ADDR.KBDR);
    assert.strictEqual(charVal, 'M'.charCodeAt(0));
    assert.strictEqual(vm.mmioState.kbsrReady, false);

    // Output "OK" to display screen via VM writeMemory
    vm.writeMemory(DEV_ADDR.DDR, 'O'.charCodeAt(0));
    vm.writeMemory(DEV_ADDR.DDR, 'K'.charCodeAt(0));
    assert.strictEqual(vm.getDisplayOutput(), 'OK');
  });
});
