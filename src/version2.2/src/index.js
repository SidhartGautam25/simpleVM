/**
 * Version 2.2 LC-3 Virtual Machine
 *
 * Fully integrated hardware execution architecture:
 *   - constants.js: Register definitions, opcodes, and PSR flags
 *   - storage/: RegisterFile (R0-R7) and Hardware Latches (PC, IR, MAR, MDR, PSR)
 *   - cpu/control-unit.js: Micro-architectural control signal generator
 *   - cpu/alu.js: 16-bit Arithmetic Logic Unit with condition code evaluation
 *   - cpu/instruction-decoder.js: Instruction field unpacking
 *   - cpu/instruction-describer.js: 5-phase hardware trace & snapshot output
 *   - cpu/instruction-handlers.js: Datapath execution orchestration
 *   - assembler/assembler.js: Two-pass assembly parser with literal pool management
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

// Re-export CPU core hardware modules
export { ControlUnit } from './cpu/control-unit.js';
export { ALU } from './cpu/alu.js';

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
