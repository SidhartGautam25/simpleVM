/**
 * Version 2 LC-3 Virtual Machine
 *
 * Modular architecture:
 *   - constants.js: Register definitions, opcodes, and PSR flags
 *   - utils/: Bit-manipulation and condition-code calculation
 *   - cpu/: Instruction decoding and dispatch-table based execution handlers
 *   - assembler/: Two-pass assembly parser with literal pool management
 *   - vm.js: Virtual Machine state and execution cycle
 */

import VM from './vm.js';

// Re-export core VM as default and named export
export default VM;
export { VM };

// Re-export architectural constants
export {
  ADDR_MAX,
  DEFAULT_CODE_START,
  REG_PC,
  REG_PSR,
  REG_COUNT,
  FLAG_NEGATIVE,
  FLAG_ZERO,
  FLAG_POSITIVE,
  SIGN_BIT,
  OPCODE,
  OPCODE_NAMES,
} from './constants.js';

// Re-export utility functions
export { signExtend, toUint16, extractBits } from './utils/bit-utils.js';
export { calculateConditionFlag, signFlag } from './utils/condition-codes.js';

// Re-export CPU decoder, describer, and handlers
export { InstructionDecoder } from './cpu/instruction-decoder.js';
export {
  InstructionDescriber,
  formatBinaryWithGroups,
  formatConditionCode,
} from './cpu/instruction-describer.js';
export {
  handleAdd,
  handleLd,
  INSTRUCTION_DISPATCH_TABLE,
} from './cpu/instruction-handlers.js';

// Re-export Assembler
export { Assembler } from './assembler/assembler.js';
