/**
 * Stage 15: Instruction Set Architecture (ISA) Specification
 *
 * Defines the binary instruction format, opcodes, and processor status flags.
 * Compatible with LC-3 standard educational architecture.
 *
 * All instructions are 16 bits wide:
 *   Bits [15:12]: 4-bit Opcode
 *   Bits [11:9] : Destination Register (DR) or Condition Codes (n, z, p)
 *   Bits [8:6]  : Source Register 1 (SR1) or Base Register (BaseR)
 *   Bit  [5]    : Immediate Mode Flag (0 = Register, 1 = Immediate)
 *   Bits [4:0]  : 5-bit Immediate (imm5, sign-extended)
 *   Bits [8:0]  : 9-bit PC-relative Offset (PCoffset9, sign-extended)
 */

export const OPCODE = {
  BR:   0b0000, // 0x0: Conditional Branch
  ADD:  0b0001, // 0x1: Addition
  LD:   0b0010, // 0x2: Load PC-relative
  ST:   0b0011, // 0x3: Store PC-relative
  JSR:  0b0100, // 0x4: Jump to Subroutine
  AND:  0b0101, // 0x5: Bitwise AND
  LDR:  0b0110, // 0x6: Load Base+Offset
  STR:  0b0111, // 0x7: Store Base+Offset
  RTI:  0b1000, // 0x8: Return from Interrupt
  NOT:  0b1001, // 0x9: Bitwise NOT
  LDI:  0b1010, // 0xA: Load Indirect
  STI:  0b1011, // 0xB: Store Indirect
  JMP:  0b1100, // 0xC: Jump / Return (RET)
  RES:  0b1101, // 0xD: Reserved
  LEA:  0b1110, // 0xE: Load Effective Address
  TRAP: 0b1111, // 0xF: System Call / Trap (HALT = TRAP 0x25)
};

export const OPCODE_NAMES = {
  [OPCODE.BR]:   'BR',
  [OPCODE.ADD]:  'ADD',
  [OPCODE.LD]:   'LD',
  [OPCODE.ST]:   'ST',
  [OPCODE.JSR]:  'JSR',
  [OPCODE.AND]:  'AND',
  [OPCODE.LDR]:  'LDR',
  [OPCODE.STR]:  'STR',
  [OPCODE.RTI]:  'RTI',
  [OPCODE.NOT]:  'NOT',
  [OPCODE.LDI]:  'LDI',
  [OPCODE.STI]:  'STI',
  [OPCODE.JMP]:  'JMP',
  [OPCODE.RES]:  'RES',
  [OPCODE.LEA]:  'LEA',
  [OPCODE.TRAP]: 'TRAP',
};

// Processor Status Register (PSR) Condition Flags
export const PSR_FLAGS = {
  NEGATIVE: 0b100, // 4: Bit 2
  ZERO:     0b010, // 2: Bit 1
  POSITIVE: 0b001, // 1: Bit 0
};

