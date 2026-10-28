/**
 * Version 2.1 LC-3 Virtual Machine
 *
 * Hardware-accurate modular architecture:
 *   - constants.js: Register definitions, opcodes, and PSR flags
 *   - storage/: RegisterFile (R0-R7) and Hardware Latches (PC, IR, MAR, MDR, PSR)
 *   - utils/: Bit-manipulation and condition-code calculation
 *   - cpu/: Instruction decoding, 5-phase hardware execution handlers, and describer
 *   - assembler/: Two-pass assembly parser with literal pool management
 *   - vm.js: Virtual Machine state and 5-phase execution cycle
 */

import VM from './vm.js';

// Re-export core VM as default and named export
export default VM;
export { VM };

// Re-export architectural constants
export {
  ADDR_MAX,
  DEFAULT_CODE_START,
  NUM_REGISTERS,
  FLAG_NEGATIVE,
  FLAG_ZERO,
  FLAG_POSITIVE,
  SIGN_BIT,
  OPCODE,
  OPCODE_NAMES,
} from './constants.js';

// Re-export hardware storage units
export { RegisterFile } from './storage/register-file.js';
export { Latches } from './storage/latches.js';

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
