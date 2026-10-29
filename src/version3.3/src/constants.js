/**
 * Architecture Constants for Version 3.3 VM
 * LC-3 based 16-bit virtual machine architecture with Memory-Mapped I/O.
 */

// Memory limits
export const ADDR_MAX = 0xFFFF; // 65,535 (16-bit address space)
export const DEFAULT_CODE_START = 0x3000;

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

// Opcodes supported in Version 3.3
export const OPCODE = {
  ADD: 0b0001, // 0x1: Addition (Register and Immediate)
  LD:  0b0010, // 0x2: Load PC-relative
};

export const OPCODE_NAMES = {
  [OPCODE.ADD]: 'ADD',
  [OPCODE.LD]:  'LD',
};
