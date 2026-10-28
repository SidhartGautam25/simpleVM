import { OPCODE, FLAG_NEGATIVE, FLAG_ZERO, FLAG_POSITIVE } from '../constants.js';

/**
 * Converts a 16-bit integer to a binary string grouped by field sizes.
 *
 * @param {number} num - 16-bit integer
 * @param {number[]} groupSizes - Array of bit lengths for each group, e.g. [4, 3, 9]
 * @returns {string} Formatted binary string with spaces between groups
 */
export function formatBinaryWithGroups(num, groupSizes) {
  const binary16 = (num & 0xFFFF).toString(2).padStart(16, '0');
  const groups = [];
  let index = 0;

  for (const size of groupSizes) {
    groups.push(binary16.slice(index, index + size));
    index += size;
  }

  if (index < 16) {
    groups.push(binary16.slice(index));
  }

  return groups.join(' ');
}

/**
 * Returns a readable string for the current condition flag in PSR.
 *
 * @param {number} psr - Processor Status Register value
 * @returns {string} Condition code description
 */
export function formatConditionCode(psr) {
  if (psr & FLAG_NEGATIVE) return 'NEGATIVE [N]';
  if (psr & FLAG_ZERO) return 'ZERO [Z]';
  if (psr & FLAG_POSITIVE) return 'POSITIVE [P]';
  return 'UNKNOWN';
}

/**
 * Helper to display 16-bit numbers with optional signed notation.
 */
function formatNumber16(val) {
  const signed = (val << 16) >> 16;
  if (signed < 0) {
    return `${val} (signed: ${signed})`;
  }
  return `${val}`;
}

/**
 * Detailed step explainer for LD instruction.
 */
function describeLd({ pc, instruction, decoded, execution, ifHardwareEvents, vm }) {
  const binaryFormatted = formatBinaryWithGroups(instruction, [4, 3, 9]);
  const opcodeDetail = '0010 (LD: Load PC-relative)';
  const psrDetail = formatConditionCode(vm.latches.PSR);

  const explanationLines = [
    `Destination Register : R${decoded.dr}`,
    `PC-relative Offset   : ${decoded.pcOffset9 >= 0 ? '+' : ''}${decoded.pcOffset9} (9-bit signed integer)`,
    `Address Calculation  : PC after fetch (${pc + 1}) + Offset (${decoded.pcOffset9}) = Memory Location ${execution.effectiveAddress}`,
    `Memory Operation     : Read value ${formatNumber16(execution.loadedValue)} from memory address ${execution.effectiveAddress}`,
    `Register Update      : Stored ${formatNumber16(execution.loadedValue)} into R${decoded.dr}`,
    `Condition Code (PSR) : Set to ${psrDetail}`,
  ];

  const allHardwareWorkflow = [
    ...(ifHardwareEvents || []),
    ...(execution.hardwareEvents || []),
  ];

  const regFileSummary = vm.regFile
    .snapshot()
    .map((v, i) => `R${i}:${v}`)
    .join('  ');

  const latchesSummary = `PC:${vm.latches.PC} (0x${vm.latches.PC.toString(16).toUpperCase()})  ` +
                         `IR:0x${vm.latches.IR.toString(16).padStart(4, '0').toUpperCase()}  ` +
                         `MAR:${vm.latches.MAR}  MDR:${vm.latches.MDR}  ` +
                         `PSR:0b${vm.latches.PSR.toString(2).padStart(3, '0')}`;

  const formatted = [
    `Loading from memory location : ${pc}`,
    `Instruction                  : ${binaryFormatted} (16-bit binary)`,
    `Opcode                       : ${opcodeDetail}`,
    `Other Part with Explanation  :`,
    ...explanationLines.map((line) => `  • ${line}`),
    `Hardware Storage & Latches Workflow :`,
    ...allHardwareWorkflow.map((line) => `  • ${line}`),
    `Storage State (End of Step)  :`,
    `  • Latches       : ${latchesSummary}`,
    `  • Register File : ${regFileSummary}`,
  ].join('\n');

  return {
    memoryLocation: pc,
    instruction: binaryFormatted,
    opcodeDetail,
    explanationLines,
    hardwareEvents: allHardwareWorkflow,
    formatted,
  };
}

/**
 * Detailed step explainer for ADD instruction (Register and Immediate modes).
 */
function describeAdd({ pc, instruction, decoded, execution, ifHardwareEvents, vm }) {
  const isImmediate = decoded.immFlag === 1;
  const binaryFormatted = isImmediate
    ? formatBinaryWithGroups(instruction, [4, 3, 3, 1, 5])
    : formatBinaryWithGroups(instruction, [4, 3, 3, 3, 3]);

  const opcodeDetail = '0001 (ADD: Addition)';
  const psrDetail = formatConditionCode(vm.latches.PSR);
  const explanationLines = [];

  if (isImmediate) {
    explanationLines.push(
      `Mode                 : Immediate Mode (immFlag = 1)`,
      `Destination Register : R${decoded.dr}`,
      `Source Register 1    : R${decoded.sr1} (current value = ${formatNumber16(execution.sr1Val)})`,
      `Immediate 5-bit      : ${decoded.imm5 >= 0 ? '+' : ''}${decoded.imm5} (5-bit signed integer)`,
      `Computation          : ${execution.sr1Val} + (${decoded.imm5}) = ${formatNumber16(execution.result)} (modulo 65536)`,
      `Register Update      : Stored ${formatNumber16(execution.result)} into R${decoded.dr}`,
      `Condition Code (PSR) : Set to ${psrDetail}`,
    );
  } else {
    explanationLines.push(
      `Mode                 : Register Mode (immFlag = 0)`,
      `Destination Register : R${decoded.dr}`,
      `Source Register 1    : R${decoded.sr1} (current value = ${formatNumber16(execution.sr1Val)})`,
      `Source Register 2    : R${decoded.sr2} (current value = ${formatNumber16(execution.sr2Val)})`,
      `Computation          : ${execution.sr1Val} + ${execution.sr2Val} = ${formatNumber16(execution.result)} (modulo 65536)`,
      `Register Update      : Stored ${formatNumber16(execution.result)} into R${decoded.dr}`,
      `Condition Code (PSR) : Set to ${psrDetail}`,
    );
  }

  const allHardwareWorkflow = [
    ...(ifHardwareEvents || []),
    ...(execution.hardwareEvents || []),
  ];

  const regFileSummary = vm.regFile
    .snapshot()
    .map((v, i) => `R${i}:${v}`)
    .join('  ');

  const latchesSummary = `PC:${vm.latches.PC} (0x${vm.latches.PC.toString(16).toUpperCase()})  ` +
                         `IR:0x${vm.latches.IR.toString(16).padStart(4, '0').toUpperCase()}  ` +
                         `MAR:${vm.latches.MAR}  MDR:${vm.latches.MDR}  ` +
                         `PSR:0b${vm.latches.PSR.toString(2).padStart(3, '0')}`;

  const formatted = [
    `Loading from memory location : ${pc}`,
    `Instruction                  : ${binaryFormatted} (16-bit binary)`,
    `Opcode                       : ${opcodeDetail}`,
    `Other Part with Explanation  :`,
    ...explanationLines.map((line) => `  • ${line}`),
    `Hardware Storage & Latches Workflow :`,
    ...allHardwareWorkflow.map((line) => `  • ${line}`),
    `Storage State (End of Step)  :`,
    `  • Latches       : ${latchesSummary}`,
    `  • Register File : ${regFileSummary}`,
  ].join('\n');

  return {
    memoryLocation: pc,
    instruction: binaryFormatted,
    opcodeDetail,
    explanationLines,
    hardwareEvents: allHardwareWorkflow,
    formatted,
  };
}

/**
 * Explainer dispatch table mapping opcodes to their explanation builders.
 */
const EXPLAINER_TABLE = {
  [OPCODE.ADD]: describeAdd,
  [OPCODE.LD]:  describeLd,
};

/**
 * Instruction Describer
 *
 * Produces structured, human-readable explanations of each instruction execution step,
 * including both logical meaning and hardware storage/latch transitions.
 */
export class InstructionDescriber {
  /**
   * Generates a comprehensive step description.
   *
   * @param {object} context
   * @param {number} context.pc - Memory address where instruction was fetched (in decimal)
   * @param {number} context.instruction - 16-bit raw machine instruction
   * @param {object} context.decoded - Decoded instruction fields
   * @param {object} context.execution - Results returned from the execution handler
   * @param {string[]} [context.ifHardwareEvents] - Hardware latch events during IF stage
   * @param {object} context.vm - VM reference
   * @returns {object} Formatted and structured description
   */
  static describe(context) {
    const explainer = EXPLAINER_TABLE[context.decoded.opcode];

    if (!explainer) {
      const binaryFormatted = formatBinaryWithGroups(context.instruction, [4, 12]);
      const opcodeDetail = `0b${context.decoded.opcode.toString(2).padStart(4, '0')} (Unknown Opcode)`;
      const formatted = [
        `Loading from memory location : ${context.pc}`,
        `Instruction                  : ${binaryFormatted} (16-bit binary)`,
        `Opcode                       : ${opcodeDetail}`,
        `Other Part with Explanation  : No explainer registered for this opcode.`,
      ].join('\n');

      return {
        memoryLocation: context.pc,
        instruction: binaryFormatted,
        opcodeDetail,
        explanationLines: ['Unknown opcode'],
        hardwareEvents: [],
        formatted,
      };
    }

    return explainer(context);
  }
}
