/**
 * Architecture Constants for Version 3.5 VM
 * LC-3 based 16-bit virtual machine architecture with:
 *   - True 5-Stage In-Flight Pipelined Datapath (IF, ID, EX, MEM, WB)
 *   - Hazard Detection Unit & Pipeline Interlocks (Load-Use stall bubble insertion)
 *   - Forwarding / Bypassing Unit (EX->EX and MEM->EX bypass MUXes)
 *   - Unified 3-Part System Bus (AddressBus, DataBus, ControlBus)
 *   - 3-bit Binary Gate Selector Codes & 3-to-8 Decoder
 *   - Strict 1-bit binary signals (0 and 1)
 */

// Memory limits
export const ADDR_MAX = 0xFFFF; // 65,535 (16-bit address space)
export const DEFAULT_CODE_START = 0x3000;

// Binary Signal Levels
export const SIGNAL_LOW = 0;   // 0 Volts / Deasserted
export const SIGNAL_HIGH = 1;  // 3.3 Volts / Asserted

// Pipeline Stages
export const STAGE = {
  IF:  'IF',
  ID:  'ID',
  EX:  'EX',
  MEM: 'MEM',
  WB:  'WB',
};

// Forwarding MUX Select Codes (2-bit binary codes)
// Selects the operand source for ALU Input A and ALU Input B in EX stage
export const FORWARD_MUX = {
  ORIGINAL: 0b00, // 0: Operand from Register File (passed through ID/EX register)
  EX_MEM:   0b01, // 1: Bypass from EX/MEM register (previous instruction's ALU result)
  MEM_WB:   0b10, // 2: Bypass from MEM/WB register (2 instructions ago result/memory data)
};

export const FORWARD_MUX_NAMES = {
  [FORWARD_MUX.ORIGINAL]: 'ORIGINAL (ID/EX)',
  [FORWARD_MUX.EX_MEM]:   'FORWARD_EX_MEM',
  [FORWARD_MUX.MEM_WB]:   'FORWARD_MEM_WB',
};

// Pipeline Hazard Types
export const HAZARD_TYPE = {
  NONE:          'NONE',
  LOAD_USE:      'LOAD_USE',      // Read-After-Write after Load: Requires 1-cycle stall bubble
  RAW_FORWARDED: 'RAW_FORWARDED', // Read-After-Write resolved via Forwarding Unit (0 stalls)
};

// Central Internal Bus: 3-bit Binary Gate Selector Codes
export const BUS_GATE = {
  NONE:    0b000, // 0: Bus is floating / High-Impedance (Hi-Z)
  PC:      0b001, // 1: GatePC (PC drives internal bus)
  MDR:     0b010, // 2: GateMDR (MDR drives internal bus)
  ALU:     0b011, // 3: GateALU (ALU output drives internal bus)
  MARMUX:  0b100, // 4: GateMARMUX (Address adder drives internal bus)
};

export const BUS_GATE_NAMES = {
  [BUS_GATE.NONE]:   'NONE',
  [BUS_GATE.PC]:     'GatePC',
  [BUS_GATE.MDR]:    'GateMDR',
  [BUS_GATE.ALU]:    'GateALU',
  [BUS_GATE.MARMUX]: 'GateMARMUX',
};

// System Control Bus Lines (Individual 1-bit control wires on motherboard)
export const CONTROL_LINE = {
  MEM_READ:  'MEM_READ',  // 1-bit: CPU asserts HIGH to initiate memory read
  MEM_WRITE: 'MEM_WRITE', // 1-bit: CPU asserts HIGH to initiate memory write
  MEM_READY: 'MEM_READY', // 1-bit: Memory asserts HIGH when data cycle completes
};

// Memory-Mapped I/O (MMIO) Address Space Boundaries
export const RAM_START = 0x0000;
export const RAM_END = 0xFDFF; // 0..65023: Physical RAM Space
export const MMIO_START = 0xFE00; // 65024: Device Register Space Start
export const MMIO_END = 0xFFFF;   // 65535: Device Register Space End

// Hardware Device Registers (MMIO Addresses)
export const DEV_ADDR = {
  KBSR: 0xFE00, // Keyboard Status Register
  KBDR: 0xFE02, // Keyboard Data Register
  DSR:  0xFE04, // Display Status Register
  DDR:  0xFE06, // Display Data Register
};

export const DEV_NAMES = {
  [DEV_ADDR.KBSR]: 'KBSR',
  [DEV_ADDR.KBDR]: 'KBDR',
  [DEV_ADDR.DSR]:  'DSR',
  [DEV_ADDR.DDR]:  'DDR',
};

// Ready bit mask for Status Registers (Bit 15)
export const READY_BIT = 1 << 15; // 0x8000

// Register File configuration
export const NUM_REGISTERS = 8; // R0-R7 general purpose registers in Register File

// Processor Status Register (PSR) Condition Flags
export const FLAG_NEGATIVE = 0b100; // 4 (Bit 2)
export const FLAG_ZERO = 0b010;     // 2 (Bit 1)
export const FLAG_POSITIVE = 0b001; // 1 (Bit 0)

// Sign bit for 16-bit integers (Bit 15)
export const SIGN_BIT = 1 << 15;

// Opcodes supported in Version 3.5
export const OPCODE = {
  ADD: 0b0001, // 0x1: Addition (Register and Immediate)
  LD:  0b0010, // 0x2: Load PC-relative
};

export const OPCODE_NAMES = {
  [OPCODE.ADD]: 'ADD',
  [OPCODE.LD]:  'LD',
};
