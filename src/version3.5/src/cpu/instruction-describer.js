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
  if (val === null || val === undefined) return 'N/A';
  const signed = (val << 16) >> 16;
  if (signed < 0) {
    return `${val} (signed: ${signed})`;
  }
  return `${val}`;
}

/**
 * Instruction Describer & Pipeline Reservation Visualizer - Version 3.5
 */
export class InstructionDescriber {
  /**
   * Generates a detailed description of an instruction graduating from the 5-stage pipeline.
   *
   * @param {object} params
   * @returns {string} Formatted graduation report
   */
  static describe({ pc, instruction, decoded, execution, vm }) {
    const raw = instruction || decoded.raw;
    const isAdd = decoded.opcode === OPCODE.ADD;
    const isLd = decoded.opcode === OPCODE.LD;

    const groupSizes = isLd
      ? [4, 3, 9]
      : (decoded.immFlag ? [4, 3, 3, 1, 5] : [4, 3, 3, 3, 3]);

    const binaryFormatted = formatBinaryWithGroups(raw, groupSizes);
    const opcodeTitle = isLd
      ? '0010 (LD: Load PC-relative)'
      : (decoded.immFlag ? '0001 (ADD Immediate)' : '0001 (ADD Register)');

    const psrDetail = formatConditionCode(vm.latches.PSR);
    const regFileSummary = vm.regFile
      .snapshot()
      .map((v, i) => `R${i}:${v}`)
      .join('  ');

    const totalCycles = vm.clock ? vm.clock.currentCycle : 0;
    const ipc = vm.pipeline ? vm.pipeline.ipc : 0;
    const cpi = vm.pipeline ? vm.pipeline.cpi : 0;

    const explanationLines = [];
    if (isLd) {
      explanationLines.push(
        `Destination Register : R${decoded.dr} (in General-Purpose Register File R0-R7)`,
        `PC-relative Offset   : ${decoded.pcOffset9 >= 0 ? '+' : ''}${decoded.pcOffset9} (9-bit signed integer)`,
        `Address Calculation  : PC+1 (${pc + 1}) + Offset (${decoded.pcOffset9}) = Memory Location 0x${execution.effectiveAddress.toString(16).padStart(4, '0').toUpperCase()}`,
        `Memory Access (MEM)  : Read value ${formatNumber16(execution.memData)} via System Bus & Address Decoder`,
        `Write-Back (WB)      : Committed ${formatNumber16(execution.finalValue)} into R${decoded.dr}`,
        `Condition Code (PSR) : Updated to ${psrDetail}`
      );
    } else if (isAdd) {
      if (decoded.immFlag) {
        explanationLines.push(
          `Destination Register : R${decoded.dr}`,
          `Source Register 1    : R${decoded.sr1}`,
          `Immediate Mode       : 5-bit signed constant (${decoded.imm5})`,
          `ALU Execution (EX)   : Computed ${execution.aluResult}`,
          `Write-Back (WB)      : Committed ${formatNumber16(execution.finalValue)} into R${decoded.dr}`,
          `Condition Code (PSR) : Updated to ${psrDetail}`
        );
      } else {
        explanationLines.push(
          `Destination Register : R${decoded.dr}`,
          `Source Register 1    : R${decoded.sr1}`,
          `Source Register 2    : R${decoded.sr2}`,
          `ALU Execution (EX)   : Computed ${execution.aluResult}`,
          `Write-Back (WB)      : Committed ${formatNumber16(execution.finalValue)} into R${decoded.dr}`,
          `Condition Code (PSR) : Updated to ${psrDetail}`
        );
      }
    }

    const reportLines = [
      '================================================================================',
      `  PIPELINE GRADUATION REPORT (COMMIT): ${decoded.opcodeName} at PC 0x${pc.toString(16).padStart(4, '0').toUpperCase()}`,
      '================================================================================',
      `Instruction Word     : 0x${raw.toString(16).padStart(4, '0').toUpperCase()}  [${binaryFormatted}]`,
      `Opcode               : ${opcodeTitle}`,
      `Pipeline Stages      : IF -> ID -> EX -> MEM -> WB (Retires in Cycle ${execution.cycle || totalCycles})`,
      '--------------------------------------------------------------------------------',
      'Execution Details:',
      ...explanationLines.map((line) => `  ${line}`),
      '--------------------------------------------------------------------------------',
      'Datapath & Pipeline Telemetry:',
      `  Graduated Instructions : ${vm.pipeline?.graduatedInstructions || vm.instructionCount}`,
      `  Total Clock Cycles     : ${totalCycles}`,
      `  Throughput Metrics     : IPC = ${ipc.toFixed(3)}  |  CPI = ${cpi.toFixed(3)} (Approaching 1.0)`,
      `  Hazard Units Active    : ForwardingUnit (Operand Bypassing) & HazardDetectionUnit (Interlocks)`,
      '--------------------------------------------------------------------------------',
      'Register File Snapshot (R0-R7):',
      `  ${regFileSummary}`,
      `  PSR Condition Code     : ${psrDetail}`,
      '================================================================================',
    ];

    return reportLines.join('\n');
  }

  /**
   * Formats an ASCII Pipeline Reservation Table showing concurrent stage occupancies.
   *
   * @param {Array<object>} cycleRecords - Cycle records from CpuPipeline
   * @param {number} [maxCycles=15] - Maximum cycles to render
   * @returns {string} Formatted reservation table
   */
  static describePipelineReservationTable(cycleRecords, maxCycles = 20) {
    if (!cycleRecords || cycleRecords.length === 0) {
      return 'No pipeline cycle history recorded.';
    }

    const records = cycleRecords.slice(0, maxCycles);
    const header = [
      '========================================================================================================================',
      '                                      5-STAGE PIPELINE RESERVATION TABLE & TIMELINE',
      '========================================================================================================================',
      'Cycle | [IF Stage]          | [ID Stage]          | [EX Stage]          | [MEM Stage]         | [WB Stage]          | Hazard / Fwd',
      '------+---------------------+---------------------+---------------------+---------------------+---------------------+-----------------------',
    ];

    const fmt = (s) => (s || '[IDLE]').padEnd(19).slice(0, 19);

    const rows = records.map((r) => {
      const cyc = r.cycle.toString().padStart(5);
      const ifStage = fmt(r.stages?.IF);
      const idStage = fmt(r.stages?.ID);
      const exStage = fmt(r.stages?.EX);
      const memStage = fmt(r.stages?.MEM);
      const wbStage = fmt(r.stages?.WB);

      let note = 'Normal';
      if (r.hazard?.stall) {
        note = `STALL: ${r.hazard.hazardType}`;
      } else if (r.forward?.isForwardedA || r.forward?.isForwardedB) {
        const parts = [];
        if (r.forward.isForwardedA) parts.push(`A:${r.forward.forwardAName.split('_')[1] || 'FWD'}`);
        if (r.forward.isForwardedB) parts.push(`B:${r.forward.forwardBName.split('_')[1] || 'FWD'}`);
        note = `FWD (${parts.join(',')})`;
      } else if (r.graduated) {
        note = `COMMIT R${r.graduated.dr}=${r.graduated.finalValue}`;
      }

      return `${cyc} | ${ifStage} | ${idStage} | ${exStage} | ${memStage} | ${wbStage} | ${note}`;
    });

    const footer = [
      '========================================================================================================================',
    ];

    return [...header, ...rows, ...footer].join('\n');
  }

  /**
   * Formats a summary of all hazard and forwarding events across the program execution.
   *
   * @param {object} vm - Virtual machine instance
   * @returns {string}
   */
  static describeHazardSummary(vm) {
    const hazardUnit = vm.pipeline?.hazardUnit;
    const totalCycles = vm.clock ? vm.clock.currentCycle : 0;
    const graduated = vm.pipeline ? vm.pipeline.graduatedInstructions : 0;
    const ipc = vm.pipeline ? vm.pipeline.ipc : 0;
    const cpi = vm.pipeline ? vm.pipeline.cpi : 0;

    const totalStalls = hazardUnit ? hazardUnit.totalStalls : 0;
    const totalBubbles = hazardUnit ? hazardUnit.totalBubbles : 0;
    const totalForwardings = hazardUnit ? hazardUnit.totalForwardings : 0;

    return [
      '================================================================================',
      '                        PIPELINE PERFORMANCE & HAZARD SUMMARY',
      '================================================================================',
      `Graduated Instructions : ${graduated}`,
      `Total Physical Cycles  : ${totalCycles}`,
      `Pipeline Throughput    : IPC = ${ipc.toFixed(3)}  |  CPI = ${cpi.toFixed(3)}`,
      '--------------------------------------------------------------------------------',
      'Hazard Handling Breakdown:',
      `  • RAW Operand Forwardings (0 stalls) : ${totalForwardings} bypass events`,
      `  • Load-Use Interlock Stalls (1 stall): ${totalStalls} stall cycles`,
      `  • Pipeline Bubbles Inserted (NOPs)   : ${totalBubbles} bubbles`,
      '================================================================================',
    ].join('\n');
  }
}
