/**
 * Version 3.0 LC-3 Virtual Machine
 *
 * Micro-architectural Pipelined Datapath with Central Internal Tri-State Bus:
 *   - constants.js: Register definitions, opcodes, and PSR flags
 *   - cpu/internal-bus.js: Central 16-bit internal CPU datapath bus with tri-state gating
 *   - memory/bus-interface.js: Mediates RAM access strictly via MAR, MDR, and MemRead/MemWrite control lines
 *   - storage/: RegisterFile (R0-R7) and Hardware Latches (PC, IR, MAR, MDR, PSR)
 *   - cpu/cpu-pipeline.js: Orchestrates phaseFetch(), phaseDecode(), phaseExecute(), phaseMemory(), phaseWriteBack()
 *   - cpu/control-unit.js: Micro-architectural control signal & bus gate generator
 *   - cpu/alu.js: 16-bit Arithmetic Logic Unit with condition code evaluation
 *   - cpu/instruction-decoder.js: Instruction field unpacking
 *   - cpu/instruction-describer.js: 5-phase hardware trace & snapshot output
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

// Re-export central internal bus
export { InternalBus } from './cpu/internal-bus.js';

// Re-export hardware memory bus
export { MemoryBusInterface } from './memory/bus-interface.js';

// Re-export hardware storage units
export { RegisterFile } from './storage/register-file.js';
export { Latches } from './storage/latches.js';

// Re-export CPU core hardware modules & pipeline
export { CpuPipeline } from './cpu/cpu-pipeline.js';
export { ControlUnit } from './cpu/control-unit.js';
export { ALU } from './cpu/alu.js';

// Re-export utility functions
export { signExtend, toUint16, extractBits } from './utils/bit-utils.js';
export { calculateConditionFlag } from './utils/condition-codes.js';

// Re-export CPU decoder and describer
export { InstructionDecoder } from './cpu/instruction-decoder.js';
export {
  InstructionDescriber,
  formatBinaryWithGroups,
  formatConditionCode,
} from './cpu/instruction-describer.js';

// Re-export Assembler
export { Assembler } from './assembler/assembler.js';
