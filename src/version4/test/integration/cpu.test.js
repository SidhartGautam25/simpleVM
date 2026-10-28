import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Assembler } from '../../src/assembler/assembler.js';
import { CPU } from '../../src/cpu/cpu.js';

describe('CPU Integration Tests (Gate-Level Execution)', () => {
  const assembler = new Assembler();

  it('Example A: Adds two operands using gate-level Ripple-Carry Adder (5 + 3 = 8)', () => {
    const source = `
      .ORIG 0x3000
      AND R1, R1, #0
      ADD R1, R1, #5
      AND R2, R2, #0
      ADD R2, R2, #3
      ADD R0, R1, R2
      HALT
      .END
    `;
    const binary = assembler.assemble(source);
    const cpu = new CPU(binary.origin);
    cpu.ram.loadProgram(binary.origin, binary.words);
    cpu.run(100);

    assert.equal(cpu.regFile.getReg(0), 8);
    assert.equal(cpu.regFile.getReg(1), 5);
    assert.equal(cpu.regFile.getReg(2), 3);
    assert.equal(cpu.controlUnit.currentState, 'HALTED');
  });

  it('Example B: Memory Store and Load through MAR and MDR', () => {
    const source = `
      .ORIG 0x3000
      AND R1, R1, #0
      ADD R1, R1, #15
      ADD R1, R1, #15
      ADD R1, R1, #12    ; R1 = 42
      ST  R1, DATA       ; Store 42 into memory variable DATA
      AND R2, R2, #0     ; Clear R2 = 0
      LD  R2, DATA       ; Load from memory variable DATA into R2
      HALT
      DATA:
      .FILL 0x0000
      .END
    `;
    const binary = assembler.assemble(source);
    const cpu = new CPU(binary.origin);
    cpu.ram.loadProgram(binary.origin, binary.words);
    cpu.run(200);

    const dataAddr = binary.symbols['DATA'];
    assert.equal(cpu.ram.read(dataAddr), 42);
    assert.equal(cpu.regFile.getReg(2), 42);
    assert.equal(cpu.controlUnit.currentState, 'HALTED');
  });

  it('Example C: Loops and calculates sum of 1..5 using conditional branch (Sum = 15)', () => {
    const source = `
      .ORIG 0x3000
      AND R0, R0, #0    ; sum = 0
      AND R1, R1, #0
      ADD R1, R1, #5    ; count = 5
      LOOP:
      ADD R0, R0, R1    ; sum = sum + count
      ADD R1, R1, #-1   ; count--
      BRp LOOP          ; branch if positive
      HALT
      .END
    `;
    const binary = assembler.assemble(source);
    const cpu = new CPU(binary.origin);
    cpu.ram.loadProgram(binary.origin, binary.words);
    cpu.run(500);

    assert.equal(cpu.regFile.getReg(0), 15);
    assert.equal(cpu.regFile.getReg(1), 0);
    assert.equal(cpu.controlUnit.currentState, 'HALTED');
  });
});

