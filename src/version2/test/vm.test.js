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
  FLAG_NEGATIVE,
  FLAG_ZERO,
  FLAG_POSITIVE,
  REG_PC,
  REG_PSR,
} from '../src/index.js';

describe('Version 2 - Bit Utilities', () => {
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

describe('Version 2 - Condition Codes', () => {
  it('determines positive, zero, and negative flags correctly', () => {
    assert.strictEqual(calculateConditionFlag(42), FLAG_POSITIVE);
    assert.strictEqual(calculateConditionFlag(0), FLAG_ZERO);
    assert.strictEqual(calculateConditionFlag(0x8000), FLAG_NEGATIVE);
    assert.strictEqual(calculateConditionFlag(0xFFFF), FLAG_NEGATIVE);
  });
});

describe('Version 2 - Instruction Decoder', () => {
  it('decodes register-mode ADD', () => {
    // ADD R1, R2, R3 -> opcode=0001, dr=001, sr1=010, imm=0, sr2=011
    const instruction = (0b0001 << 12) | (1 << 9) | (2 << 6) | (0 << 5) | 3;
    const decoded = InstructionDecoder.decode(instruction);

    assert.strictEqual(decoded.opcode, 0b0001);
    assert.strictEqual(decoded.opcodeName, 'ADD');
    assert.strictEqual(decoded.dr, 1);
    assert.strictEqual(decoded.sr1, 2);
    assert.strictEqual(decoded.immFlag, 0);
    assert.strictEqual(decoded.sr2, 3);
  });

  it('decodes immediate-mode ADD', () => {
    // ADD R4, R5, #-3 -> imm5=-3 (0b11101)
    const imm5Raw = (-3) & 0b11111;
    const instruction = (0b0001 << 12) | (4 << 9) | (5 << 6) | (1 << 5) | imm5Raw;
    const decoded = InstructionDecoder.decode(instruction);

    assert.strictEqual(decoded.opcode, 0b0001);
    assert.strictEqual(decoded.dr, 4);
    assert.strictEqual(decoded.sr1, 5);
    assert.strictEqual(decoded.immFlag, 1);
    assert.strictEqual(decoded.imm5, -3);
  });
});

describe('Version 2 - Assembler', () => {
  it('deduplicates identical literals in the literal pool', () => {
    const assembler = new Assembler(0x3000);
    const result = assembler.assemble([
      'LD R0, #42',
      'LD R1, #42',
    ]);

    // Should only have 1 entry in literal pool
    assert.strictEqual(result.literals.length, 1);
    assert.strictEqual(result.literals[0], 42);
  });

  it('throws on out-of-range immediate values', () => {
    const assembler = new Assembler(0x3000);
    assert.throws(() => {
      assembler.assemble(['ADD R0, R1, #20']); // > 15
    }, /Immediate value 20 out of range/);
  });

  it('throws on out-of-range register indices', () => {
    const assembler = new Assembler(0x3000);
    assert.throws(() => {
      assembler.assemble(['ADD R8, R1, R2']); // R8 invalid
    }, /Invalid register R8/);
  });
});

describe('Version 2 - VM Execution', () => {
  it('automatically runs a complete program with vm.run() without manual step calls', () => {
    const vm = new VM();
    vm.run([
      'LD R1, #10',
      'LD R2, #20',
      'ADD R0, R1, R2',
      'LD R4, #-30',
      'ADD R3, R0, R4',
    ]);

    assert.strictEqual(vm.reg[1], 10);
    assert.strictEqual(vm.reg[2], 20);
    assert.strictEqual(vm.reg[0], 30);
    assert.strictEqual(vm.reg[4], toUint16(-30));
    assert.strictEqual(vm.reg[3], 0);
    assert.strictEqual(vm.reg[REG_PSR], FLAG_ZERO);
    assert.strictEqual(vm.halted, true);
  });

  it('allows manual stepping when program is prepared with vm.load()', () => {
    const vm = new VM();
    vm.load([
      'LD R1, #10',
      'LD R2, #20',
      'ADD R0, R1, R2',
    ]);

    // Step 1: LD R1, #10
    vm.step();
    assert.strictEqual(vm.reg[1], 10);
    assert.strictEqual(vm.reg[REG_PSR], FLAG_POSITIVE);

    // Step 2: LD R2, #20
    vm.step();
    assert.strictEqual(vm.reg[2], 20);
    assert.strictEqual(vm.reg[REG_PSR], FLAG_POSITIVE);

    // Step 3: ADD R0, R1, R2 -> 30
    vm.step();
    assert.strictEqual(vm.reg[0], 30);
    assert.strictEqual(vm.reg[REG_PSR], FLAG_POSITIVE);
  });

  it('handles negative results and sets NEGATIVE flag automatically in vm.run()', () => {
    const vm = new VM();
    vm.run([
      'LD R1, #5',
      'ADD R0, R1, #-10',
    ]);

    assert.strictEqual(vm.reg[0], 0xFFFB);
    assert.strictEqual(vm.reg[REG_PSR], FLAG_NEGATIVE);
    assert.strictEqual(vm.halted, true);
  });

  it('generates detailed step descriptions with decimal address, binary, and opcode', () => {
    const vm = new VM();
    vm.load(['LD R1, #42', 'ADD R0, R1, #5']);

    const step1 = vm.step();
    assert.strictEqual(step1.description.memoryLocation, 12288); // 0x3000 in decimal
    assert.match(step1.description.instruction, /^0010/); // LD opcode binary
    assert.match(step1.description.opcodeDetail, /0010 \(LD: Load PC-relative\)/);
    assert.match(step1.description.formatted, /Loading from memory location : 12288/);
    assert.match(step1.description.formatted, /Instruction\s+: 0010 001/);

    const step2 = vm.step();
    assert.strictEqual(step2.description.memoryLocation, 12289);
    assert.match(step2.description.instruction, /^0001/); // ADD opcode binary
    assert.match(step2.description.opcodeDetail, /0001 \(ADD: Addition\)/);
    assert.match(step2.description.formatted, /Mode\s+: Immediate Mode/);
  });
});
