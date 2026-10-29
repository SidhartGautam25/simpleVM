/**
 * Version 3.2 LC-3 Virtual Machine
 *
 * Microcoded FSM Control Sequencer & Central Datapath Architecture:
 *   - constants.js: Register definitions, opcodes, and PSR flags
 *   - clock/clock-generator.js: Quartz crystal clock oscillator
 *   - cpu/micro-sequencer.js: Microcoded FSM Control Sequencer & Control Store ROM
 *   - cpu/internal-bus.js: Central 16-bit internal CPU datapath bus with tri-state gating
 *   - memory/bus-interface.js: Mediates RAM access strictly via MAR, MDR, and MemRead/MemWrite control lines
 *   - storage/: RegisterFile (R0-R7) and Hardware Latches (PC, IR, MAR, MDR, PSR)
 *   - cpu/cpu-pipeline.js: Multi-cycle micro-stepping engine driven by MicroSequencer
 *   - cpu/control-unit.js: Micro-architectural control signal & bus gate generator
 *   - cpu/alu.js: 16-bit Arithmetic Logic Unit with condition code evaluation
 *   - cpu/instruction-decoder.js: Instruction field unpacking
 *   - cpu/instruction-describer.js: Microcode state trace & snapshot output
 *   - assembler/assembler.js: Two-pass assembly parser with literal pool management
 *   - vm.js: Virtual Machine state, vm.tick() micro-stepping, and vm.step() macro-stepping
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

// Re-export clock generator
export { ClockGenerator } from './clock/clock-generator.js';

// Re-export Microcoded FSM Control Sequencer
export { MicroSequencer, CONTROL_STORE_ROM, COND } from './cpu/micro-sequencer.js';

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
