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
  FLAG_NEGATIVE,
  FLAG_ZERO,
  FLAG_POSITIVE,
} from '../src/index.js';

describe('Version 2.1 - Bit Utilities', () => {
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

describe('Version 2.1 - Condition Codes', () => {
  it('determines positive, zero, and negative flags correctly', () => {
    assert.strictEqual(calculateConditionFlag(42), FLAG_POSITIVE);
    assert.strictEqual(calculateConditionFlag(0), FLAG_ZERO);
    assert.strictEqual(calculateConditionFlag(0x8000), FLAG_NEGATIVE);
    assert.strictEqual(calculateConditionFlag(0xFFFF), FLAG_NEGATIVE);
  });
});

describe('Version 2.1 - Register File (Storage Module)', () => {
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

    // Attempt write with writeEnable = false
    const record = rf.write(3, 999, false);
    assert.strictEqual(record.written, false);
    assert.strictEqual(rf.readPortA(3), 50); // Remains unchanged
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

describe('Version 2.1 - Hardware Latches (Storage Module)', () => {
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

describe('Version 2.1 - Instruction Decoder', () => {
  it('decodes register-mode ADD', () => {
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

describe('Version 2.1 - Assembler', () => {
  it('deduplicates identical literals in the literal pool', () => {
    const assembler = new Assembler(0x3000);
    const result = assembler.assemble([
      'LD R0, #42',
      'LD R1, #42',
    ]);

    assert.strictEqual(result.literals.length, 1);
    assert.strictEqual(result.literals[0], 42);
  });

  it('throws on out-of-range immediate values', () => {
    const assembler = new Assembler(0x3000);
    assert.throws(() => {
      assembler.assemble(['ADD R0, R1, #20']);
    }, /Immediate value 20 out of range/);
  });

  it('throws on out-of-range register indices', () => {
    const assembler = new Assembler(0x3000);
    assert.throws(() => {
      assembler.assemble(['ADD R8, R1, R2']);
    }, /Invalid register R8/);
  });
});

describe('Version 2.1 - VM Execution with Hardware Storage Units', () => {
  it('automatically runs program updating RegisterFile and Latches', () => {
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
  });

  it('generates 5-phase hardware storage workflow descriptions', () => {
    const vm = new VM();
    vm.load(['LD R1, #42', 'ADD R0, R1, #5']);

    const step1 = vm.step();
    assert.strictEqual(step1.description.memoryLocation, 12288);
    assert.match(step1.description.formatted, /Hardware Storage & Latches Workflow/);
    assert.match(step1.description.formatted, /\[IF Stage\]\s+Memory Address Register \(MAR\)/);
    assert.match(step1.description.formatted, /\[MEM Stage\]\s+Memory Address Register \(MAR\)/);
    assert.match(step1.description.formatted, /\[WB Stage\]\s+Register File: Write Port R1/);
    assert.match(step1.description.formatted, /Storage State \(End of Step\)/);

    const step2 = vm.step();
    assert.strictEqual(step2.description.memoryLocation, 12289);
    assert.match(step2.description.formatted, /\[ID Stage\]\s+Register File: Read Port A <= R1/);
    assert.match(step2.description.formatted, /\[EX Stage\]\s+ALU Unit/);
    assert.match(step2.description.formatted, /\[WB Stage\]\s+Register File: Write Port R0 <= 47/);
  });
});
