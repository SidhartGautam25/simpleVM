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
  FLAG_NEGATIVE,
  FLAG_ZERO,
  FLAG_POSITIVE,
  OPCODE,
} from '../src/index.js';

describe('Version 2.3 - Bit Utilities', () => {
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

  it('extracts bit fields accurately', () => {
    const word = 0b1010_011_010_1_00101;
    assert.strictEqual(extractBits(word, 12, 4), 0b1010);
    assert.strictEqual(extractBits(word, 9, 3), 0b011);
    assert.strictEqual(extractBits(word, 6, 3), 0b010);
    assert.strictEqual(extractBits(word, 5, 1), 1);
    assert.strictEqual(extractBits(word, 0, 5), 0b00101);
  });
});

describe('Version 2.3 - Memory Bus Interface', () => {
  it('reads from RAM via MAR into MDR when MemRead is true', () => {
    const bus = new MemoryBusInterface();
    const latches = new Latches(0x3000, FLAG_ZERO);

    bus.loadEntries([{ address: 0x3005, value: 0x1234 }]);
    latches.latchMAR(0x3005);

    const readData = bus.readCycle(latches, true);
    assert.strictEqual(readData, 0x1234);
    assert.strictEqual(latches.MDR, 0x1234);
    assert.strictEqual(bus.lastTransaction.type, 'READ');
    assert.strictEqual(bus.lastTransaction.address, 0x3005);
  });

  it('remains idle and does not read when MemRead is false', () => {
    const bus = new MemoryBusInterface();
    const latches = new Latches(0x3000, FLAG_ZERO);

    bus.loadEntries([{ address: 0x3005, value: 0x1234 }]);
    latches.latchMAR(0x3005);
    latches.latchMDR(0x0000);

    const readData = bus.readCycle(latches, false);
    assert.strictEqual(readData, null);
    assert.strictEqual(latches.MDR, 0x0000); // Unchanged
    assert.strictEqual(bus.lastTransaction.type, 'IDLE');
  });

  it('writes data from MDR into RAM at MAR when MemWrite is true', () => {
    const bus = new MemoryBusInterface();
    const latches = new Latches(0x3000, FLAG_ZERO);

    latches.latchMAR(0x3010);
    latches.latchMDR(0x5678);

    const writeSuccess = bus.writeCycle(latches, true);
    assert.strictEqual(writeSuccess, true);
    assert.strictEqual(bus.inspect(0x3010), 0x5678);
    assert.strictEqual(bus.lastTransaction.type, 'WRITE');
  });

  it('remains idle and does not write when MemWrite is false', () => {
    const bus = new MemoryBusInterface();
    const latches = new Latches(0x3000, FLAG_ZERO);

    latches.latchMAR(0x3010);
    latches.latchMDR(0x9999);

    const writeSuccess = bus.writeCycle(latches, false);
    assert.strictEqual(writeSuccess, false);
    assert.strictEqual(bus.inspect(0x3010), 0);
    assert.strictEqual(bus.lastTransaction.type, 'IDLE');
  });

  it('throws RangeError if MAR address is out of 16-bit range', () => {
    const bus = new MemoryBusInterface();
    const latches = new Latches(0x3000, FLAG_ZERO);

    latches._mar = 0x10000; // 65536 is beyond 0xFFFF
    assert.throws(() => bus.readCycle(latches, true), RangeError);
  });
});

describe('Version 2.3 - Control Unit (Hardware Module)', () => {
  it('asserts correct control signals for register-mode ADD', () => {
    const decoded = { opcode: OPCODE.ADD, immFlag: 0 };
    const signals = ControlUnit.generateSignals(decoded);

    assert.strictEqual(signals.RegWrite, true);
    assert.strictEqual(signals.ALUSrc, 'REG');
    assert.strictEqual(signals.MemRead, false);
    assert.strictEqual(signals.MemWrite, false);
    assert.strictEqual(signals.MemToReg, false);
    assert.strictEqual(signals.ALUOp, 'ADD');
    assert.strictEqual(signals.SetCC, true);
  });

  it('asserts correct control signals for immediate-mode ADD', () => {
    const decoded = { opcode: OPCODE.ADD, immFlag: 1 };
    const signals = ControlUnit.generateSignals(decoded);

    assert.strictEqual(signals.RegWrite, true);
    assert.strictEqual(signals.ALUSrc, 'IMM');
    assert.strictEqual(signals.MemRead, false);
    assert.strictEqual(signals.MemToReg, false);
    assert.strictEqual(signals.ALUOp, 'ADD');
    assert.strictEqual(signals.SetCC, true);
  });

  it('asserts correct control signals for LD (PC-relative load)', () => {
    const decoded = { opcode: OPCODE.LD };
    const signals = ControlUnit.generateSignals(decoded);

    assert.strictEqual(signals.RegWrite, true);
    assert.strictEqual(signals.ALUSrc, 'IMM');
    assert.strictEqual(signals.MemRead, true); // Strobe memory read
    assert.strictEqual(signals.MemWrite, false);
    assert.strictEqual(signals.MemToReg, true);
    assert.strictEqual(signals.ALUOp, 'ADD');
    assert.strictEqual(signals.SetCC, true);
  });
});

describe('Version 2.3 - Arithmetic Logic Unit (ALU Module)', () => {
  it('computes 16-bit addition with positive result', () => {
    const aluRes = ALU.compute(15, 25, 'ADD');
    assert.strictEqual(aluRes.result, 40);
    assert.strictEqual(aluRes.flags.positive, true);
    assert.strictEqual(aluRes.flags.zero, false);
    assert.strictEqual(aluRes.flags.negative, false);
    assert.strictEqual(aluRes.flags.psrFlag, FLAG_POSITIVE);
  });

  it('computes addition resulting in 0 and asserts ZERO flag', () => {
    const aluRes = ALU.compute(15, toUint16(-15), 'ADD');
    assert.strictEqual(aluRes.result, 0);
    assert.strictEqual(aluRes.flags.zero, true);
    assert.strictEqual(aluRes.flags.positive, false);
    assert.strictEqual(aluRes.flags.negative, false);
    assert.strictEqual(aluRes.flags.psrFlag, FLAG_ZERO);
  });

  it('computes addition resulting in negative number and asserts NEGATIVE flag', () => {
    const aluRes = ALU.compute(5, toUint16(-10), 'ADD');
    assert.strictEqual(aluRes.result, 0xFFFB);
    assert.strictEqual(aluRes.flags.negative, true);
    assert.strictEqual(aluRes.flags.zero, false);
    assert.strictEqual(aluRes.flags.positive, false);
    assert.strictEqual(aluRes.flags.psrFlag, FLAG_NEGATIVE);
  });

  it('throws for unsupported ALU operations', () => {
    assert.throws(() => ALU.compute(1, 2, 'UNKNOWN_OP'), /Unsupported ALU operation/);
  });
});

describe('Version 2.3 - Register File (Storage Module)', () => {
  it('reads and writes registers via hardware ports', () => {
    const rf = new RegisterFile();
    rf.write(1, 100, true);
    rf.write(2, 200, true);

    assert.strictEqual(rf.readPortA(1), 100);
    assert.strictEqual(rf.readPortB(2), 200);
  });

  it('ignores writes when writeEnable is false (hardware gating)', () => {
    const rf = new RegisterFile();
    rf.write(3, 50, true);
    assert.strictEqual(rf.readPortA(3), 50);

    const record = rf.write(3, 999, false);
    assert.strictEqual(record.written, false);
    assert.strictEqual(rf.readPortA(3), 50);
  });

  it('throws RangeError when accessing registers outside R0-R7', () => {
    const rf = new RegisterFile();
    assert.throws(() => rf.readPortA(8), RangeError);
    assert.throws(() => rf.write(-1, 10), RangeError);
  });

  it('resets all registers to 0 and provides full snapshot', () => {
    const rf = new RegisterFile();
    rf.write(0, 42, true);
    rf.write(7, 99, true);

    rf.reset();
    const snap = rf.snapshot();
    assert.strictEqual(snap.length, 8);
    assert.ok(snap.every((val) => val === 0));
  });
});

describe('Version 2.3 - Hardware Latches (Storage Module)', () => {
  it('latches MAR, MDR, IR, PC, and PSR with 16-bit bounds', () => {
    const latches = new Latches(0x3000, FLAG_ZERO);

    latches.latchMAR(0x3005);
    latches.latchMDR(0x1234);
    latches.latchIR(0x2204);
    latches.latchPC(0x3001);
    latches.latchPSR(FLAG_POSITIVE);

    assert.strictEqual(latches.MAR, 0x3005);
    assert.strictEqual(latches.MDR, 0x1234);
    assert.strictEqual(latches.IR, 0x2204);
    assert.strictEqual(latches.PC, 0x3001);
    assert.strictEqual(latches.PSR, FLAG_POSITIVE);
  });

  it('snapshots and resets latches to initial defaults', () => {
    const latches = new Latches(0x3000, FLAG_ZERO);
    latches.latchMAR(100);
    latches.reset();

    const snap = latches.snapshot();
    assert.strictEqual(snap.PC, 0x3000);
    assert.strictEqual(snap.MAR, 0);
    assert.strictEqual(snap.MDR, 0);
    assert.strictEqual(snap.IR, 0);
    assert.strictEqual(snap.PSR, FLAG_ZERO);
  });
});

describe('Version 2.3 - VM Execution with Mediated Memory Bus', () => {
  it('executes program through MemoryBusInterface, ControlUnit, ALU, and RegisterFile', () => {
    const vm = new VM();
    vm.run([
      'LD R1, #10',
      'LD R2, #20',
      'ADD R0, R1, R2',
      'LD R4, #-30',
      'ADD R3, R0, R4',
    ]);

    // Verify Register File
    assert.strictEqual(vm.regFile.readPortA(1), 10);
    assert.strictEqual(vm.regFile.readPortA(2), 20);
    assert.strictEqual(vm.regFile.readPortA(0), 30);
    assert.strictEqual(vm.regFile.readPortA(4), toUint16(-30));
    assert.strictEqual(vm.regFile.readPortA(3), 0);

    // Verify Hardware Latches
    assert.strictEqual(vm.latches.PSR, FLAG_ZERO);
    assert.strictEqual(vm.halted, true);

    // Verify RAM inspection through bus
    assert.strictEqual(vm.bus.inspect(vm.codeEnd), 10); // First literal
  });

  it('generates descriptions containing Memory Bus transactions and Control Unit signals', () => {
    const vm = new VM();
    vm.load(['LD R1, #42', 'ADD R0, R1, #5']);

    const step1 = vm.step();
    assert.strictEqual(step1.description.memoryLocation, 12288);
    assert.match(step1.description.formatted, /Memory Bus Interface/);
    assert.match(step1.description.formatted, /MemRead: ENABLED/);
    assert.match(step1.description.formatted, /Data Bus <= 42/);

    const step2 = vm.step();
    assert.strictEqual(step2.description.memoryLocation, 12289);
    assert.match(step2.description.formatted, /Memory Bus Interface: IDLE/);
    assert.match(step2.description.formatted, /ALU Execution:\s+42 ADD 5 = 47/);
  });
});
