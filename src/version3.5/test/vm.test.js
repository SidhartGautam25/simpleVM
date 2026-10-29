import { describe, it } from 'node:test';
import assert from 'node:assert';
import VM, {
  STAGE,
  FORWARD_MUX,
  FORWARD_MUX_NAMES,
  HAZARD_TYPE,
  HazardUnit,
  ForwardingUnit,
  HazardDetectionUnit,
  CpuPipeline,
  createEmptyPipelineRegister,
  InstructionDecoder,
  InstructionDescriber,
  Assembler,
  RegisterFile,
  Latches,
  ClockGenerator,
  MemoryBusInterface,
  OPCODE,
  FLAG_ZERO,
  FLAG_POSITIVE,
  FLAG_NEGATIVE,
  DEV_ADDR,
  READY_BIT,
} from '../src/index.js';

describe('Version 3.5 - Pipeline Stage & Hazard Constants', () => {
  it('defines 5 pipeline stages: IF, ID, EX, MEM, WB', () => {
    assert.strictEqual(STAGE.IF, 'IF');
    assert.strictEqual(STAGE.ID, 'ID');
    assert.strictEqual(STAGE.EX, 'EX');
    assert.strictEqual(STAGE.MEM, 'MEM');
    assert.strictEqual(STAGE.WB, 'WB');
  });

  it('defines 2-bit Forwarding MUX selector codes', () => {
    assert.strictEqual(FORWARD_MUX.ORIGINAL, 0b00);
    assert.strictEqual(FORWARD_MUX.EX_MEM, 0b01);
    assert.strictEqual(FORWARD_MUX.MEM_WB, 0b10);

    assert.strictEqual(FORWARD_MUX_NAMES[FORWARD_MUX.ORIGINAL], 'ORIGINAL (ID/EX)');
    assert.strictEqual(FORWARD_MUX_NAMES[FORWARD_MUX.EX_MEM], 'FORWARD_EX_MEM');
    assert.strictEqual(FORWARD_MUX_NAMES[FORWARD_MUX.MEM_WB], 'FORWARD_MEM_WB');
  });

  it('defines pipeline hazard types', () => {
    assert.strictEqual(HAZARD_TYPE.NONE, 'NONE');
    assert.strictEqual(HAZARD_TYPE.LOAD_USE, 'LOAD_USE');
    assert.strictEqual(HAZARD_TYPE.RAW_FORWARDED, 'RAW_FORWARDED');
  });
});

describe('Version 3.5 - Forwarding / Bypassing Unit', () => {
  it('passes through original operands when no RAW hazard exists', () => {
    const id_ex = {
      valid: true,
      sr1Val: 10,
      sr2Val: 20,
      decoded: { opcode: OPCODE.ADD, dr: 1, sr1: 2, sr2: 3, immFlag: 0 },
    };
    const ex_mem = { valid: false };
    const mem_wb = { valid: false };

    const fwd = ForwardingUnit.resolve(id_ex, ex_mem, mem_wb);
    assert.strictEqual(fwd.forwardA, FORWARD_MUX.ORIGINAL);
    assert.strictEqual(fwd.forwardB, FORWARD_MUX.ORIGINAL);
    assert.strictEqual(fwd.valueA, 10);
    assert.strictEqual(fwd.valueB, 20);
    assert.strictEqual(fwd.isForwardedA, false);
    assert.strictEqual(fwd.isForwardedB, false);
  });

  it('detects EX->EX Hazard and forwards ALU result from EX/MEM to Input A (sr1)', () => {
    const id_ex = {
      valid: true,
      sr1Val: 10, // Outdated value in RegFile
      sr2Val: 5,
      decoded: { opcode: OPCODE.ADD, dr: 3, sr1: 1, sr2: 4, immFlag: 0 },
    };
    const ex_mem = {
      valid: true,
      control: { RegWrite: 1 },
      decoded: { dr: 1 }, // Writes to R1!
      aluResult: 42,      // Fresh result!
    };
    const mem_wb = { valid: false };

    const fwd = ForwardingUnit.resolve(id_ex, ex_mem, mem_wb);
    assert.strictEqual(fwd.forwardA, FORWARD_MUX.EX_MEM);
    assert.strictEqual(fwd.valueA, 42); // Successfully forwarded!
    assert.strictEqual(fwd.isForwardedA, true);
    assert.strictEqual(fwd.forwardB, FORWARD_MUX.ORIGINAL);
    assert.strictEqual(fwd.valueB, 5);
  });

  it('detects EX->EX Hazard and forwards ALU result from EX/MEM to Input B (sr2)', () => {
    const id_ex = {
      valid: true,
      sr1Val: 5,
      sr2Val: 0,
      decoded: { opcode: OPCODE.ADD, dr: 3, sr1: 4, sr2: 2, immFlag: 0 },
    };
    const ex_mem = {
      valid: true,
      control: { RegWrite: 1 },
      decoded: { dr: 2 },
      aluResult: 99,
    };
    const mem_wb = { valid: false };

    const fwd = ForwardingUnit.resolve(id_ex, ex_mem, mem_wb);
    assert.strictEqual(fwd.forwardA, FORWARD_MUX.ORIGINAL);
    assert.strictEqual(fwd.forwardB, FORWARD_MUX.EX_MEM);
    assert.strictEqual(fwd.valueB, 99);
    assert.strictEqual(fwd.isForwardedB, true);
  });

  it('detects MEM->EX Hazard and forwards committed value from MEM/WB', () => {
    const id_ex = {
      valid: true,
      sr1Val: 10,
      sr2Val: 20,
      decoded: { opcode: OPCODE.ADD, dr: 3, sr1: 1, sr2: 2, immFlag: 0 },
    };
    const ex_mem = {
      valid: true,
      control: { RegWrite: 1 },
      decoded: { dr: 5 }, // No conflict
      aluResult: 100,
    };
    const mem_wb = {
      valid: true,
      control: { RegWrite: 1 },
      decoded: { dr: 1 }, // Conflict with sr1
      finalValue: 77,
    };

    const fwd = ForwardingUnit.resolve(id_ex, ex_mem, mem_wb);
    assert.strictEqual(fwd.forwardA, FORWARD_MUX.MEM_WB);
    assert.strictEqual(fwd.valueA, 77); // Forwarded from MEM/WB!
    assert.strictEqual(fwd.isForwardedA, true);
  });

  it('prioritizes EX/MEM forward over MEM/WB forward when both write to same register', () => {
    // Both previous instructions wrote to R1; the most recent one (EX/MEM) must take precedence
    const id_ex = {
      valid: true,
      sr1Val: 0,
      decoded: { opcode: OPCODE.ADD, dr: 4, sr1: 1, sr2: 0, immFlag: 1, imm5: 2 },
    };
    const ex_mem = {
      valid: true,
      control: { RegWrite: 1 },
      decoded: { dr: 1 },
      aluResult: 200, // Newer value
    };
    const mem_wb = {
      valid: true,
      control: { RegWrite: 1 },
      decoded: { dr: 1 },
      finalValue: 100, // Older value
    };

    const fwd = ForwardingUnit.resolve(id_ex, ex_mem, mem_wb);
    assert.strictEqual(fwd.forwardA, FORWARD_MUX.EX_MEM);
    assert.strictEqual(fwd.valueA, 200);
  });
});

describe('Version 3.5 - Hazard Detection Unit & Pipeline Interlocks', () => {
  it('detects LOAD-USE Hazard when ID needs register loaded by EX stage', () => {
    const if_id = {
      valid: true,
      decoded: { opcode: OPCODE.ADD, dr: 2, sr1: 1, sr2: 0, immFlag: 1, imm5: 5 },
    };
    const id_ex = {
      valid: true,
      control: { MemRead: 1, RegWrite: 1 }, // LD in EX stage
      decoded: { opcode: OPCODE.LD, dr: 1 }, // Loading into R1
    };

    const hazard = HazardDetectionUnit.check(if_id, id_ex);
    assert.strictEqual(hazard.stall, true);
    assert.strictEqual(hazard.hazardType, HAZARD_TYPE.LOAD_USE);
    assert.strictEqual(hazard.bubbleInserted, true);
    assert.strictEqual(hazard.conflictedRegister, 1);
  });

  it('does NOT stall on ALU-to-ALU dependency because ForwardingUnit handles it', () => {
    const if_id = {
      valid: true,
      decoded: { opcode: OPCODE.ADD, dr: 2, sr1: 1, sr2: 0, immFlag: 1, imm5: 5 },
    };
    const id_ex = {
      valid: true,
      control: { MemRead: 0, RegWrite: 1 }, // ADD in EX stage (NOT a load)
      decoded: { opcode: OPCODE.ADD, dr: 1 },
    };

    const hazard = HazardDetectionUnit.check(if_id, id_ex);
    assert.strictEqual(hazard.stall, false);
    assert.strictEqual(hazard.hazardType, HAZARD_TYPE.NONE);
  });

  it('tracks hazard statistics in unified HazardUnit', () => {
    const unit = new HazardUnit();
    const if_id = {
      valid: true,
      decoded: { opcode: OPCODE.ADD, dr: 3, sr1: 1, immFlag: 1, imm5: 2 },
    };
    const id_ex = {
      valid: true,
      control: { MemRead: 1, RegWrite: 1 },
      decoded: { opcode: OPCODE.LD, dr: 1 },
    };

    const result = unit.checkHazard(if_id, id_ex);
    assert.strictEqual(result.stall, true);
    assert.strictEqual(unit.totalStalls, 1);
    assert.strictEqual(unit.totalBubbles, 1);
  });
});

describe('Version 3.5 - True 5-Stage In-Flight Pipelined Overlap & High Throughput', () => {
  it('executes back-to-back dependent ADD instructions with 0 stalls via forwarding', () => {
    const vm = new VM();
    vm.load([
      'ADD R1, R1, #5',  // R1 = 5
      'ADD R2, R1, #10', // Dependent on R1! EX->EX forwarded! R2 = 15
      'ADD R3, R2, #15', // Dependent on R2! EX->EX forwarded! R3 = 30
    ]);

    // Run to completion
    vm.run();

    assert.strictEqual(vm.regFile.read(1), 5);
    assert.strictEqual(vm.regFile.read(2), 15);
    assert.strictEqual(vm.regFile.read(3), 30);

    // 3 instructions:
    // Cycle 1: Fetch I1
    // Cycle 2: Fetch I2, Decode I1
    // Cycle 3: Fetch I3, Decode I2, Execute I1
    // Cycle 4: Decode I3, Execute I2 (FWD), Mem I1
    // Cycle 5: Execute I3 (FWD), Mem I2, WB I1 (I1 commits)
    // Cycle 6: Mem I3, WB I2 (I2 commits)
    // Cycle 7: WB I3 (I3 commits)
    // Total physical cycles = 7 for 3 instructions (No stalls!)
    assert.strictEqual(vm.pipeline.graduatedInstructions, 3);
    assert.strictEqual(vm.clock.currentCycle, 7);
    assert.strictEqual(vm.hazardUnit.totalStalls, 0); // ZERO stalls!
    assert.ok(vm.hazardUnit.totalForwardings >= 2);   // Forwarding used!
  });

  it('demonstrates high throughput approaching IPC = 1.0 on compute sequence', () => {
    const vm = new VM();
    const program = [];
    for (let i = 0; i < 20; i++) {
      program.push(`ADD R1, R1, #1`);
    }
    vm.load(program);
    vm.run();

    assert.strictEqual(vm.regFile.read(1), 20);
    assert.strictEqual(vm.pipeline.graduatedInstructions, 20);

    // For 20 instructions, pipelined datapath needs:
    // 4 cycles to fill pipeline + 20 cycles = 24 cycles total!
    // Non-pipelined multi-cycle (v3.4) would take 20 * 5 = 100 cycles!
    assert.strictEqual(vm.clock.currentCycle, 24);
    assert.ok(vm.ipc > 0.8, `Expected IPC > 0.8, got ${vm.ipc}`);
    assert.ok(vm.cpi < 1.25, `Expected CPI < 1.25, got ${vm.cpi}`);
  });

  it('inserts exactly 1 NOP bubble stall on Load-Use RAW Hazard and forwards from MEM/WB', () => {
    const vm = new VM();
    vm.load([
      'LD R1, #50',     // Loads 50 into R1 from literal pool
      'ADD R2, R1, #5', // Dependent on R1 immediately after LD! (Load-Use Hazard)
    ]);

    vm.run();

    assert.strictEqual(vm.regFile.read(1), 50);
    assert.strictEqual(vm.regFile.read(2), 55);

    // Exactly 1 stall cycle and 1 bubble inserted
    assert.strictEqual(vm.hazardUnit.totalStalls, 1);
    assert.strictEqual(vm.hazardUnit.totalBubbles, 1);

    // Check that MEM/WB forward occurred
    assert.ok(vm.hazardUnit.totalForwardings >= 1);
  });

  it('supports micro-stepping via vm.tick() and provides reservation table snapshots', () => {
    const vm = new VM();
    vm.load([
      'ADD R1, R1, #3',
      'ADD R2, R2, #4',
    ]);

    // Tick 1
    const t1 = vm.tick();
    assert.strictEqual(t1.cycle, 1);
    assert.strictEqual(t1.stalled, false);
    assert.strictEqual(t1.graduated, null);

    // Step to completion
    vm.run();
    assert.strictEqual(vm.regFile.read(1), 3);
    assert.strictEqual(vm.regFile.read(2), 4);
    assert.ok(vm.cycleRecords.length > 0);

    // Reservation table output
    const table = vm.describePipeline(10);
    assert.ok(table.includes('PIPELINE RESERVATION TABLE'));
    assert.ok(table.includes('ADD'));
  });

  it('reads MMIO Device Registers (KBSR/KBDR/DSR) through pipelined datapath', () => {
    const vm = new VM();
    // Pre-populate keyboard buffer
    vm.typeChar('Z');

    // Load KBSR address and read
    // KBSR is at 0xFE00, status has READY_BIT set
    assert.strictEqual(vm.addressDecoder.read(DEV_ADDR.KBSR), READY_BIT);
    // Read character from KBDR (0xFE02)
    assert.strictEqual(vm.addressDecoder.read(DEV_ADDR.KBDR), 90); // ASCII 'Z' = 90
  });

  it('forwards both operands simultaneously (dual forwarding: A from EX/MEM, B from MEM/WB)', () => {
    const vm = new VM();
    vm.load([
      'ADD R1, R1, #4',   // I1: R1 = 4
      'ADD R2, R2, #6',   // I2: R2 = 6
      'ADD R3, R1, R2',   // I3: R3 = R1 + R2 (Dual Forward: R1 from MEM/WB, R2 from EX/MEM!)
    ]);

    vm.run();

    assert.strictEqual(vm.regFile.read(1), 4);
    assert.strictEqual(vm.regFile.read(2), 6);
    assert.strictEqual(vm.regFile.read(3), 10);
    assert.strictEqual(vm.hazardUnit.totalStalls, 0); // Zero stalls!
  });

  it('handles macro-step stepping instruction by instruction until halted', () => {
    const vm = new VM();
    vm.load([
      'ADD R1, R1, #1',
      'ADD R2, R2, #2',
    ]);

    const step1 = vm.step();
    assert.ok(step1);
    assert.strictEqual(step1.decoded.dr, 1);
    assert.strictEqual(vm.regFile.read(1), 1);

    const step2 = vm.step();
    assert.ok(step2);
    assert.strictEqual(step2.decoded.dr, 2);
    assert.strictEqual(vm.regFile.read(2), 2);

    const step3 = vm.step();
    assert.strictEqual(step3, null); // Halted!
    assert.strictEqual(vm.halted, true);
  });
});

describe('Version 3.5 - Pipeline Reservation Table & Describer Visuals', () => {
  it('formats instruction graduation commit description', () => {
    const vm = new VM();
    vm.load(['ADD R3, R3, #7']);
    const stepResult = vm.step();

    assert.ok(stepResult);
    assert.ok(stepResult.description.includes('PIPELINE GRADUATION REPORT'));
    assert.ok(stepResult.description.includes('R3'));
    assert.ok(stepResult.description.includes('IPC ='));
  });

  it('formats hazard performance summary', () => {
    const vm = new VM();
    vm.load([
      'LD R1, #100',
      'ADD R2, R1, #12',
    ]);
    vm.run();

    const summary = InstructionDescriber.describeHazardSummary(vm);
    assert.ok(summary.includes('PIPELINE PERFORMANCE & HAZARD SUMMARY'));
    assert.ok(summary.includes('Load-Use Interlock Stalls'));
    assert.ok(summary.includes('RAW Operand Forwardings'));
  });
});
