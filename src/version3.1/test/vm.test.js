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
  InternalBus,
  ClockGenerator,
  CpuPipeline,
  FLAG_NEGATIVE,
  FLAG_ZERO,
  FLAG_POSITIVE,
  OPCODE,
} from '../src/index.js';

describe('Version 3.1 - Bit Utilities', () => {
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

describe('Version 3.1 - Clock Generator (Physical Quartz Oscillator)', () => {
  it('increments cycleCount on each tick and emits rising phase', () => {
    const clock = new ClockGenerator();
    assert.strictEqual(clock.currentCycle, 0);

    const tick1 = clock.tick();
    assert.strictEqual(tick1.cycle, 1);
    assert.strictEqual(tick1.phase, 'RISING');
    assert.strictEqual(clock.currentCycle, 1);

    const tick2 = clock.tick();
    assert.strictEqual(tick2.cycle, 2);
    assert.strictEqual(clock.currentCycle, 2);
  });

  it('resets clock back to cycle 0', () => {
    const clock = new ClockGenerator();
    clock.tick();
    clock.tick();
    assert.strictEqual(clock.currentCycle, 2);

    clock.reset();
    assert.strictEqual(clock.currentCycle, 0);
  });
});

describe('Version 3.1 - Central Internal Datapath Bus', () => {
  it('drives 16-bit words from specified tri-state source and latches value', () => {
    const bus = new InternalBus();
    bus.drive('PC', 0x3000);

    assert.strictEqual(bus.driver, 'PC');
    assert.strictEqual(bus.read(), 0x3000);
    assert.strictEqual(bus.lastTransaction.driver, 'PC');
    assert.strictEqual(bus.lastTransaction.value, 0x3000);
    assert.strictEqual(bus.describeState(), 'BUS <= PC (12288)');
  });

  it('clamps driven values to 16-bit unsigned bounds', () => {
    const bus = new InternalBus();
    bus.drive('ALU', -1);
    assert.strictEqual(bus.read(), 0xFFFF);

    bus.drive('MDR', 0x10042);
    assert.strictEqual(bus.read(), 0x0042);
  });

  it('floats to high-impedance state on float() or reset()', () => {
    const bus = new InternalBus();
    bus.drive('MDR', 42);
    bus.float();

    assert.strictEqual(bus.driver, null);
    assert.strictEqual(bus.describeState(), 'BUS: High-Z (Floating)');

    bus.drive('ALU', 100);
    bus.reset();
    assert.strictEqual(bus.driver, null);
    assert.strictEqual(bus.value, 0);
  });
});

describe('Version 3.1 - Memory Bus Interface', () => {
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
    assert.strictEqual(latches.MDR, 0x0000);
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

    latches._mar = 0x10000;
    assert.throws(() => bus.readCycle(latches, true), RangeError);
  });
});

describe('Version 3.1 - Control Unit (Hardware Module & Bus Gating)', () => {
  it('asserts correct control signals and bus gates for register-mode ADD', () => {
    const decoded = { opcode: OPCODE.ADD, immFlag: 0 };
    const signals = ControlUnit.generateSignals(decoded);

    assert.strictEqual(signals.RegWrite, true);
    assert.strictEqual(signals.LD_REG, true);
    assert.strictEqual(signals.ALUSrc, 'REG');
    assert.strictEqual(signals.MemRead, false);
    assert.strictEqual(signals.GateALU, true);
    assert.strictEqual(signals.GateMDR, false);
    assert.strictEqual(signals.ALUOp, 'ADD');
    assert.strictEqual(signals.SetCC, true);
    assert.strictEqual(signals.LD_CC, true);
  });

  it('asserts correct control signals and bus gates for immediate-mode ADD', () => {
    const decoded = { opcode: OPCODE.ADD, immFlag: 1 };
    const signals = ControlUnit.generateSignals(decoded);

    assert.strictEqual(signals.RegWrite, true);
    assert.strictEqual(signals.LD_REG, true);
    assert.strictEqual(signals.ALUSrc, 'IMM');
    assert.strictEqual(signals.MemRead, false);
    assert.strictEqual(signals.GateALU, true);
    assert.strictEqual(signals.GateMDR, false);
    assert.strictEqual(signals.ALUOp, 'ADD');
    assert.strictEqual(signals.SetCC, true);
  });

  it('asserts correct control signals and bus gates for LD (PC-relative load)', () => {
    const decoded = { opcode: OPCODE.LD };
    const signals = ControlUnit.generateSignals(decoded);

    assert.strictEqual(signals.RegWrite, true);
    assert.strictEqual(signals.LD_REG, true);
    assert.strictEqual(signals.ALUSrc, 'IMM');
    assert.strictEqual(signals.MemRead, true);
    assert.strictEqual(signals.GateMDR, true);
    assert.strictEqual(signals.GateALU, false);
    assert.strictEqual(signals.GateMARMUX, true);
    assert.strictEqual(signals.LD_MAR, true);
    assert.strictEqual(signals.ALUOp, 'ADD');
    assert.strictEqual(signals.SetCC, true);
  });
});

describe('Version 3.1 - Arithmetic Logic Unit (ALU Module)', () => {
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

describe('Version 3.1 - Register File (General-Purpose Storage)', () => {
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

describe('Version 3.1 - Hardware Latches (Dedicated Internal Registers)', () => {
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

describe('Version 3.1 - Multi-Cycle Micro-Stepping (vm.tick())', () => {
  it('executes ADD instruction in exactly 5 clock cycles', () => {
    const vm = new VM();
    vm.load(['ADD R0, R1, #5']);
    vm.regFile.write(1, 10, true);

    // Cycle 1: Fetch 1 (MAR <= PC)
    const t1 = vm.tick();
    assert.strictEqual(t1.cycle, 1);
    assert.strictEqual(t1.instructionComplete, false);
    assert.strictEqual(vm.latches.MAR, 12288);

    // Cycle 2: Fetch 2 (Memory Read -> MDR)
    const t2 = vm.tick();
    assert.strictEqual(t2.cycle, 2);
    assert.strictEqual(t2.instructionComplete, false);

    // Cycle 3: Fetch 3 (IR <= MDR, PC <= PC + 1)
    const t3 = vm.tick();
    assert.strictEqual(t3.cycle, 3);
    assert.strictEqual(t3.instructionComplete, false);
    assert.strictEqual(vm.latches.PC, 12289);

    // Cycle 4: Decode & Register Read
    const t4 = vm.tick();
    assert.strictEqual(t4.cycle, 4);
    assert.strictEqual(t4.instructionComplete, false);

    // Cycle 5: Execute & Write-Back (ALU compute -> Central Bus -> R0)
    const t5 = vm.tick();
    assert.strictEqual(t5.cycle, 5);
    assert.strictEqual(t5.instructionComplete, true);
    assert.strictEqual(vm.regFile.readPortA(0), 15);
    assert.strictEqual(vm.latches.PSR, FLAG_POSITIVE);
  });

  it('executes LD instruction in exactly 6 clock cycles', () => {
    const vm = new VM();
    vm.load(['LD R1, #25']);

    let cycleCount = 0;
    while (true) {
      const t = vm.tick();
      assert.ok(t !== null);
      cycleCount++;
      if (t.instructionComplete) break;
    }

    assert.strictEqual(cycleCount, 6);
    assert.strictEqual(vm.regFile.readPortA(1), 25);
    assert.strictEqual(vm.latches.PSR, FLAG_POSITIVE);
  });
});

describe('Version 3.1 - Multi-Cycle Macro-Stepping (vm.step()) & Full Program', () => {
  it('macro-steps instructions and accumulates total clock cycles', () => {
    const vm = new VM();
    vm.load([
      'LD R1, #10',    // 6 cycles
      'LD R2, #20',    // 6 cycles
      'ADD R0, R1, R2',// 5 cycles
      'LD R4, #-30',   // 6 cycles
      'ADD R3, R0, R4',// 5 cycles
    ]);

    // Total expected cycles = 6 + 6 + 5 + 6 + 5 = 28 cycles
    const s1 = vm.step();
    assert.strictEqual(s1.cyclesTaken, 6);
    assert.strictEqual(vm.clock.currentCycle, 6);

    const s2 = vm.step();
    assert.strictEqual(s2.cyclesTaken, 6);
    assert.strictEqual(vm.clock.currentCycle, 12);

    const s3 = vm.step();
    assert.strictEqual(s3.cyclesTaken, 5);
    assert.strictEqual(vm.clock.currentCycle, 17);

    const s4 = vm.step();
    assert.strictEqual(s4.cyclesTaken, 6);
    assert.strictEqual(vm.clock.currentCycle, 23);

    const s5 = vm.step();
    assert.strictEqual(s5.cyclesTaken, 5);
    assert.strictEqual(vm.clock.currentCycle, 28);

    // Verify registers
    assert.strictEqual(vm.regFile.readPortA(0), 30);
    assert.strictEqual(vm.regFile.readPortA(3), 0);
    assert.strictEqual(vm.latches.PSR, FLAG_ZERO);
  });

  it('generates descriptions showing clock timing and micro-operation details', () => {
    const vm = new VM();
    vm.load(['LD R1, #42', 'ADD R0, R1, #5']);

    const s1 = vm.step();
    assert.strictEqual(s1.description.memoryLocation, 12288);
    assert.match(s1.description.formatted, /6 Clock Cycles/);
    assert.match(s1.description.formatted, /Central Internal Bus: GatePC=1/);
    assert.match(s1.description.formatted, /Central Internal Bus: GateMDR=1 -> BUS <= MDR \(42\)/);

    const s2 = vm.step();
    assert.strictEqual(s2.description.memoryLocation, 12289);
    assert.match(s2.description.formatted, /5 Clock Cycles/);
    assert.match(s2.description.formatted, /ALU Execution:\s+42 ADD 5 = 47/);
  });
});
