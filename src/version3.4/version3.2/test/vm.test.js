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
  MicroSequencer,
  CONTROL_STORE_ROM,
  COND,
  CpuPipeline,
  FLAG_NEGATIVE,
  FLAG_ZERO,
  FLAG_POSITIVE,
  OPCODE,
} from '../src/index.js';

describe('Version 3.2 - Bit Utilities', () => {
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

describe('Version 3.2 - Microcoded FSM Control Sequencer (Hardware Core)', () => {
  it('initializes uPC to entry State 18 (Fetch 1)', () => {
    const seq = new MicroSequencer();
    assert.strictEqual(seq.uPC, 18);
    assert.strictEqual(seq.currentMicroInstruction.state, 18);
    assert.strictEqual(seq.currentMicroInstruction.signals.GatePC, true);
    assert.strictEqual(seq.currentMicroInstruction.signals.LD_MAR, true);
  });

  it('sequences through standard Fetch micro-states: 18 -> 33 -> 35 -> 32', () => {
    const seq = new MicroSequencer();

    const s1 = seq.step();
    assert.strictEqual(s1.currentState, 18);
    assert.strictEqual(s1.nextState, 33);
    assert.strictEqual(seq.uPC, 33);

    const s2 = seq.step();
    assert.strictEqual(s2.currentState, 33);
    assert.strictEqual(s2.nextState, 35);
    assert.strictEqual(seq.uPC, 35);

    const s3 = seq.step();
    assert.strictEqual(s3.currentState, 35);
    assert.strictEqual(s3.nextState, 32);
    assert.strictEqual(seq.uPC, 32);
  });

  it('micro-branches in State 32 based on opcode (ADD -> State 1, LD -> State 2)', () => {
    // Test ADD branch
    const seqAdd = new MicroSequencer();
    seqAdd.uPC = 32;
    const addNext = seqAdd.computeNextState(OPCODE.ADD);
    assert.strictEqual(addNext, 1);

    // Test LD branch
    const seqLd = new MicroSequencer();
    seqLd.uPC = 32;
    const ldNext = seqLd.computeNextState(OPCODE.LD);
    assert.strictEqual(ldNext, 2);
  });

  it('verifies State 1 (ADD) completes instruction and loops back to State 18', () => {
    const seq = new MicroSequencer();
    seq.uPC = 1;

    const s = seq.step();
    assert.strictEqual(s.currentState, 1);
    assert.strictEqual(s.instructionComplete, true);
    assert.strictEqual(s.nextState, 18);
    assert.strictEqual(seq.uPC, 18);
  });

  it('verifies State 2 and State 25 (LD) sequence to completion and loop back to State 18', () => {
    const seq = new MicroSequencer();
    seq.uPC = 2;

    const s2 = seq.step();
    assert.strictEqual(s2.currentState, 2);
    assert.strictEqual(s2.nextState, 25);
    assert.strictEqual(s2.instructionComplete, false);

    const s25 = seq.step();
    assert.strictEqual(s25.currentState, 25);
    assert.strictEqual(s25.instructionComplete, true);
    assert.strictEqual(s25.nextState, 18);
    assert.strictEqual(seq.uPC, 18);
  });
});

describe('Version 3.2 - Multi-Cycle Micro-Stepping (vm.tick()) driven by uPC', () => {
  it('executes ADD instruction through exact states: 18 -> 33 -> 35 -> 32 -> 1', () => {
    const vm = new VM();
    vm.load(['ADD R0, R1, #5']);
    vm.regFile.write(1, 10, true);

    const expectedStates = [18, 33, 35, 32, 1];
    const actualStates = [];

    while (true) {
      const t = vm.tick();
      assert.ok(t !== null);
      actualStates.push(t.uPC);
      if (t.instructionComplete) break;
    }

    assert.deepStrictEqual(actualStates, expectedStates);
    assert.strictEqual(actualStates.length, 5); // Exactly 5 clock cycles
    assert.strictEqual(vm.regFile.readPortA(0), 15);
    assert.strictEqual(vm.latches.PSR, FLAG_POSITIVE);
    assert.strictEqual(vm.uPC, 18); // Ready at entry state for next instruction
  });

  it('executes LD instruction through exact states: 18 -> 33 -> 35 -> 32 -> 2 -> 25', () => {
    const vm = new VM();
    vm.load(['LD R1, #25']);

    const expectedStates = [18, 33, 35, 32, 2, 25];
    const actualStates = [];

    while (true) {
      const t = vm.tick();
      assert.ok(t !== null);
      actualStates.push(t.uPC);
      if (t.instructionComplete) break;
    }

    assert.deepStrictEqual(actualStates, expectedStates);
    assert.strictEqual(actualStates.length, 6); // Exactly 6 clock cycles
    assert.strictEqual(vm.regFile.readPortA(1), 25);
    assert.strictEqual(vm.latches.PSR, FLAG_POSITIVE);
    assert.strictEqual(vm.uPC, 18);
  });
});

describe('Version 3.2 - Multi-Cycle Macro-Stepping (vm.step()) & Full Program', () => {
  it('macro-steps instructions and accumulates total clock cycles and uPC paths', () => {
    const vm = new VM();
    vm.load([
      'LD R1, #10',    // 6 cycles: 18 -> 33 -> 35 -> 32 -> 2 -> 25
      'LD R2, #20',    // 6 cycles: 18 -> 33 -> 35 -> 32 -> 2 -> 25
      'ADD R0, R1, R2',// 5 cycles: 18 -> 33 -> 35 -> 32 -> 1
      'LD R4, #-30',   // 6 cycles: 18 -> 33 -> 35 -> 32 -> 2 -> 25
      'ADD R3, R0, R4',// 5 cycles: 18 -> 33 -> 35 -> 32 -> 1
    ]);

    const s1 = vm.step();
    assert.strictEqual(s1.cyclesTaken, 6);
    assert.strictEqual(s1.description.uPCPath, '18 -> 33 -> 35 -> 32 -> 2 -> 25');
    assert.strictEqual(vm.clock.currentCycle, 6);

    const s2 = vm.step();
    assert.strictEqual(s2.cyclesTaken, 6);
    assert.strictEqual(vm.clock.currentCycle, 12);

    const s3 = vm.step();
    assert.strictEqual(s3.cyclesTaken, 5);
    assert.strictEqual(s3.description.uPCPath, '18 -> 33 -> 35 -> 32 -> 1');
    assert.strictEqual(vm.clock.currentCycle, 17);

    const s4 = vm.step();
    assert.strictEqual(s4.cyclesTaken, 6);
    assert.strictEqual(vm.clock.currentCycle, 23);

    const s5 = vm.step();
    assert.strictEqual(s5.cyclesTaken, 5);
    assert.strictEqual(vm.clock.currentCycle, 28);

    assert.strictEqual(vm.regFile.readPortA(0), 30);
    assert.strictEqual(vm.regFile.readPortA(3), 0);
    assert.strictEqual(vm.latches.PSR, FLAG_ZERO);
  });

  it('generates descriptions showing Microcode FSM state sequences', () => {
    const vm = new VM();
    vm.load(['LD R1, #42', 'ADD R0, R1, #5']);

    const s1 = vm.step();
    assert.strictEqual(s1.description.memoryLocation, 12288);
    assert.match(s1.description.formatted, /Microcode FSM State Sequence : 18 -> 33 -> 35 -> 32 -> 2 -> 25/);
    assert.match(s1.description.formatted, /6 Clock Cycles/);

    const s2 = vm.step();
    assert.strictEqual(s2.description.memoryLocation, 12289);
    assert.match(s2.description.formatted, /Microcode FSM State Sequence : 18 -> 33 -> 35 -> 32 -> 1/);
    assert.match(s2.description.formatted, /5 Clock Cycles/);
  });
});
