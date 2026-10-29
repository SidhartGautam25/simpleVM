/**
 * Version 3.5 LC-3 Virtual Machine
 *
 * True In-Flight Pipelined Datapath with Hazard & Forwarding Units:
 *   - constants.js: Register definitions, opcodes, STAGE, FORWARD_MUX, HAZARD_TYPE, and PSR flags
 *   - clock/clock-generator.js: Quartz crystal clock oscillator
 *   - cpu/hazard-unit.js: ForwardingUnit, HazardDetectionUnit, and unified HazardUnit
 *   - cpu/cpu-pipeline.js: True 5-stage pipeline engine (IF, ID, EX, MEM, WB)
 *   - cpu/control-unit.js: Micro-architectural control signal & bus gate generator
 *   - cpu/alu.js: 16-bit Arithmetic Logic Unit with condition code evaluation
 *   - cpu/instruction-decoder.js: Instruction field unpacking
 *   - cpu/instruction-describer.js: Reservation table visualizer, graduation reporter, and hazard summary
 *   - memory/system-bus.js: 3-Part System Bus (AddressBus, DataBus, ControlBus)
 *   - memory/address-decoder.js: Hardware Address Decoder for RAM & MMIO
 *   - memory/bus-interface.js: MemoryBusInterface connecting CPU to SystemBus
 *   - storage/: RegisterFile (R0-R7) and Hardware Latches (PC, IR, MAR, MDR, PSR)
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
  RAM_START,
  RAM_END,
  MMIO_START,
  MMIO_END,
  DEV_ADDR,
  DEV_NAMES,
  READY_BIT,
  STAGE,
  FORWARD_MUX,
  FORWARD_MUX_NAMES,
  HAZARD_TYPE,
  BUS_GATE,
  BUS_GATE_NAMES,
  CONTROL_LINE,
  SIGNAL_LOW,
  SIGNAL_HIGH,
  NUM_REGISTERS,
  FLAG_NEGATIVE,
  FLAG_ZERO,
  FLAG_POSITIVE,
  SIGN_BIT,
  OPCODE,
  OPCODE_NAMES,
} from './constants.js';

// Re-export Pipeline and Hazard components
export { CpuPipeline, createEmptyPipelineRegister } from './cpu/cpu-pipeline.js';
export { HazardUnit, ForwardingUnit, HazardDetectionUnit } from './cpu/hazard-unit.js';
export { InstructionDecoder } from './cpu/instruction-decoder.js';
export { ControlUnit } from './cpu/control-unit.js';
export { ALU } from './cpu/alu.js';
export { InstructionDescriber } from './cpu/instruction-describer.js';
export { Assembler } from './assembler/assembler.js';

// Re-export storage & bus components
export { RegisterFile } from './storage/register-file.js';
export { Latches } from './storage/latches.js';
export { ClockGenerator } from './clock/clock-generator.js';
export { MemoryBusInterface } from './memory/bus-interface.js';
export { AddressDecoder } from './memory/address-decoder.js';
export { SystemBus, AddressBus, DataBus, ControlBus } from './memory/system-bus.js';
