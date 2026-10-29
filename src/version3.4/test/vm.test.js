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
  AddressBus,
  DataBus,
  ControlBus,
  SystemBus,
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
  BUS_GATE,
  BUS_GATE_NAMES,
  SIGNAL_LOW,
  SIGNAL_HIGH,
  FLAG_NEGATIVE,
  FLAG_ZERO,
  FLAG_POSITIVE,
  OPCODE,
} from '../src/index.js';

describe('Version 3.4 - Binary Signal Constants & 3-bit Gate Codes', () => {
  it('defines strict binary levels: SIGNAL_LOW = 0 and SIGNAL_HIGH = 1', () => {
    assert.strictEqual(SIGNAL_LOW, 0);
    assert.strictEqual(SIGNAL_HIGH, 1);
  });

  it('defines 3-bit BUS_GATE codes mapping to unique 3-bit binary numbers', () => {
    assert.strictEqual(BUS_GATE.NONE, 0b000);
    assert.strictEqual(BUS_GATE.PC, 0b001);
    assert.strictEqual(BUS_GATE.MDR, 0b010);
    assert.strictEqual(BUS_GATE.ALU, 0b011);
    assert.strictEqual(BUS_GATE.MARMUX, 0b100);

    assert.strictEqual(BUS_GATE_NAMES[BUS_GATE.NONE], 'NONE');
    assert.strictEqual(BUS_GATE_NAMES[BUS_GATE.PC], 'GatePC');
    assert.strictEqual(BUS_GATE_NAMES[BUS_GATE.MDR], 'GateMDR');
    assert.strictEqual(BUS_GATE_NAMES[BUS_GATE.ALU], 'GateALU');
    assert.strictEqual(BUS_GATE_NAMES[BUS_GATE.MARMUX], 'GateMARMUX');
  });

  it('verifies 3-to-8 line decoder activates exactly one line for each 3-bit code', () => {
    for (let code = 0; code <= 4; code++) {
      const lines = InternalBus.decode3to8(code);
      assert.strictEqual(lines.length, 8);
      assert.strictEqual(lines[code], 1);
      const activeCount = lines.filter((line) => line === 1).length;
      assert.strictEqual(activeCount, 1);
    }
  });
});

describe('Version 3.4 - Unified 3-Part System Bus (AddressBus, DataBus, ControlBus)', () => {
  it('drives and reads 16-bit address lines on AddressBus', () => {
    const bus = new AddressBus();
    assert.strictEqual(bus.read(), 0);

    bus.drive(0x3000);
    assert.strictEqual(bus.read(), 0x3000);
    assert.match(bus.describe(), /0x3000/);

    assert.throws(() => bus.drive(0x10000), RangeError);
    assert.throws(() => bus.drive(-1), RangeError);
  });

  it('drives, reads, and floats 16-bit lines on DataBus', () => {
    const bus = new DataBus();
    assert.strictEqual(bus.read(), 0);
    assert.strictEqual(bus.driver, 'FLOAT');

    bus.drive('RAM', 0xABCD);
    assert.strictEqual(bus.read(), 0xABCD);
    assert.strictEqual(bus.driver, 'RAM');

    bus.float();
    assert.strictEqual(bus.read(), 0);
    assert.strictEqual(bus.driver, 'FLOAT');
    assert.match(bus.describe(), /Hi-Z/);
  });

  it('asserts and deasserts 1-bit physical lines on ControlBus', () => {
    const bus = new ControlBus();
    assert.strictEqual(bus.lines.MEM_READ, SIGNAL_LOW);
    assert.strictEqual(bus.lines.MEM_WRITE, SIGNAL_LOW);
    assert.strictEqual(bus.lines.MEM_READY, SIGNAL_LOW);

    bus.assertRead();
    assert.strictEqual(bus.lines.MEM_READ, SIGNAL_HIGH);
    bus.setReady(1);
    assert.strictEqual(bus.lines.MEM_READY, SIGNAL_HIGH);
    assert.match(bus.describe(), /MEM_READ=1/);

    bus.clear();
    assert.strictEqual(bus.lines.MEM_READ, SIGNAL_LOW);
    assert.strictEqual(bus.lines.MEM_READY, SIGNAL_LOW);
  });

  it('executes coordinated readCycle and writeCycle across all 3 buses in SystemBus', () => {
    const ram = new Uint16Array(65536);
    ram[0x3000] = 0x1234;
    const decoder = new AddressDecoder(ram);
    const systemBus = new SystemBus(decoder);
    const latches = new Latches(0x3000, FLAG_ZERO);

    // Read cycle
    latches.latchMAR(0x3000);
    const data = systemBus.readCycle(latches);
    assert.strictEqual(data, 0x1234);
    assert.strictEqual(latches.MDR, 0x1234);
    assert.strictEqual(systemBus.lastTransaction.target, 'RAM');
    assert.strictEqual(systemBus.lastTransaction.ramChipSelect, 1);

    // Write cycle
    latches.latchMAR(0x3001);
    latches.latchMDR(0x5678);
    const writeOk = systemBus.writeCycle(latches);
    assert.strictEqual(writeOk, true);
    assert.strictEqual(ram[0x3001], 0x5678);
  });
});

describe('Version 3.4 - Central Internal Bus with 3-bit Gate Selector Code', () => {
  it('drives Central Internal Bus via 3-bit BUS_GATE codes', () => {
    const bus = new InternalBus();

    // Drive PC (Gate code 0b001)
    bus.driveWithGate(BUS_GATE.PC, 0x3000);
    assert.strictEqual(bus.read(), 0x3000);
    assert.strictEqual(bus.driver, 'GatePC');
    assert.strictEqual(bus.gateCode, 1);
    assert.strictEqual(bus.lastTransaction.gateCodeBinary, '0b001');

    // Drive ALU (Gate code 0b011)
    bus.driveWithGate(BUS_GATE.ALU, 42);
    assert.strictEqual(bus.read(), 42);
    assert.strictEqual(bus.driver, 'GateALU');
    assert.strictEqual(bus.gateCode, 3);
    assert.strictEqual(bus.lastTransaction.gateCodeBinary, '0b011');

    // Drive MDR (Gate code 0b010)
    bus.driveWithGate(BUS_GATE.MDR, 99);
    assert.strictEqual(bus.read(), 99);
    assert.strictEqual(bus.driver, 'GateMDR');

    // Drive MARMUX (Gate code 0b100)
    bus.driveWithGate(BUS_GATE.MARMUX, 0xFE00);
    assert.strictEqual(bus.read(), 0xFE00);
    assert.strictEqual(bus.driver, 'GateMARMUX');
  });

  it('rejects gate selector codes exceeding 3-bit capacity (0..7)', () => {
    const bus = new InternalBus();
    assert.throws(() => bus.driveWithGate(8, 100), RangeError);
    assert.throws(() => bus.driveWithGate(-1, 100), RangeError);
  });
});

describe('Version 3.4 - Microcoded FSM Control Sequencer & Binary Control Words', () => {
  it('verifies Control Store ROM uses strict 0/1 bits and 3-bit gate codes', () => {
    const rom = CONTROL_STORE_ROM;

    // State 18: GatePC (0b001), LD_MAR=1, MemRead=1
    assert.strictEqual(rom[18].gateCode, BUS_GATE.PC);
    assert.strictEqual(rom[18].signals.GatePC, 1);
    assert.strictEqual(rom[18].signals.LD_MAR, 1);
    assert.strictEqual(rom[18].signals.MemRead, 1);
    assert.strictEqual(rom[18].signals.MemWrite, 0);

    // State 35: GateMDR (0b010), LD_IR=1, LD_PC=1
    assert.strictEqual(rom[35].gateCode, BUS_GATE.MDR);
    assert.strictEqual(rom[35].signals.GateMDR, 1);
    assert.strictEqual(rom[35].signals.LD_IR, 1);
    assert.strictEqual(rom[35].signals.LD_PC, 1);

    // State 1: GateALU (0b011), LD_REG=1, LD_CC=1
    assert.strictEqual(rom[1].gateCode, BUS_GATE.ALU);
    assert.strictEqual(rom[1].signals.GateALU, 1);
    assert.strictEqual(rom[1].signals.LD_REG, 1);
    assert.strictEqual(rom[1].signals.LD_CC, 1);
  });

  it('packs micro-instruction signals into a 32-bit physical binary ROM word', () => {
    const inst18 = CONTROL_STORE_ROM[18];
    const packed18 = MicroSequencer.packMicroWord(inst18);

    assert.strictEqual(typeof packed18, 'number');
    assert.strictEqual(packed18 > 0, true);

    // Verify nextState J = 33 at bits [31:26]
    const extractedJ = (packed18 >>> 26) & 0x3F;
    assert.strictEqual(extractedJ, 33);

    // Verify gateCode = 1 (GatePC) at bits [23:21]
    const extractedGate = (packed18 >>> 21) & 0x7;
    assert.strictEqual(extractedGate, BUS_GATE.PC);

    // Verify LD_MAR = 1 at bit 20
    const extractedLdMar = (packed18 >>> 20) & 0x1;
    assert.strictEqual(extractedLdMar, 1);
  });
});

describe('Version 3.4 - Full VM Execution & Telemetry with 3-Part System Bus', () => {
  it('executes program through AddressBus, DataBus, and ControlBus', () => {
    const vm = new VM();
    vm.load([
      'LD R1, #25',
      'LD R2, #-10',
      'ADD R0, R1, R2',
    ]);

    const s1 = vm.step();
    assert.strictEqual(s1.cyclesTaken, 6);
    assert.match(s1.description.formatted, /GateCode=0b010/);
    assert.match(s1.description.formatted, /System Bus Operation/);
    assert.strictEqual(vm.bus.lastTransaction.ramChipSelect, 1);

    const s2 = vm.step();
    assert.strictEqual(s2.cyclesTaken, 6);

    const s3 = vm.step();
    assert.strictEqual(s3.cyclesTaken, 5);
    assert.match(s3.description.formatted, /GateCode=0b011/);
    assert.strictEqual(vm.regFile.readPortA(0), 15);
  });

  it('interacts with MMIO keyboard and display over Address, Data, and Control buses', () => {
    const vm = new VM();

    // Type character 'W'
    vm.typeChar('W');
    assert.strictEqual(vm.mmioState.kbsrReady, true);

    // Read KBDR via memory bus
    const char = vm.readMemory(DEV_ADDR.KBDR);
    assert.strictEqual(char, 87);
    assert.strictEqual(vm.bus.lastTransaction.deviceChipSelect, 1);
    assert.strictEqual(vm.bus.lastTransaction.deviceName, 'KBDR');
    assert.strictEqual(vm.mmioState.kbsrReady, false);

    // Write to DDR via memory bus
    vm.writeMemory(DEV_ADDR.DDR, 65); // 'A'
    assert.strictEqual(vm.getDisplayOutput(), 'A');
    assert.strictEqual(vm.bus.lastTransaction.deviceName, 'DDR');
  });
});
