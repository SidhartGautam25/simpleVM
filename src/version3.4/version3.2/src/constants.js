/**
 * Architecture Constants for Version 2.2 VM
 * LC-3 based 16-bit virtual machine architecture.
 */

// Memory limits
export const ADDR_MAX = 0xFFFF; // 65,535 (16-bit address space)
export const DEFAULT_CODE_START = 0x3000;

// Register File configuration
export const NUM_REGISTERS = 8; // R0-R7 general purpose registers in Register File

// Processor Status Register (PSR) Condition Flags
export const FLAG_NEGATIVE = 0b100; // 4 (Bit 2)
export const FLAG_ZERO = 0b010;     // 2 (Bit 1)
export const FLAG_POSITIVE = 0b001; // 1 (Bit 0)

// Sign bit for 16-bit integers (Bit 15)
export const SIGN_BIT = 1 << 15;

// Opcodes supported in Version 2.2
export const OPCODE = {
  ADD: 0b0001, // 0x1: Addition (Register and Immediate)
  LD:  0b0010, // 0x2: Load PC-relative
};

export const OPCODE_NAMES = {
  [OPCODE.ADD]: 'ADD',
  [OPCODE.LD]:  'LD',
};
