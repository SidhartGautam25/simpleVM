import { OPCODE } from '../constants.js';

/**
 * Hardware-Accurate Instruction Execution Handlers - Version 2.4
 *
 * In Version 2.4, instruction handlers delegate to the central CpuPipeline
 * which orchestrates the 5 sequential micro-architectural phases:
 *   1. phaseFetch()     (IF)
 *   2. phaseDecode()    (ID)
 *   3. phaseExecute()   (EX)
 *   4. phaseMemory()    (MEM)
 *   5. phaseWriteBack() (WB)
 */

/**
 * Handles ADD instruction (Opcode 0b0001) by running ID -> EX -> MEM -> WB.
 *
 * @param {object} vm - Virtual machine instance
 * @param {object} decoded - Decoded instruction fields
 * @returns {object} Execution details
 */
export function handleAdd(vm, decoded) {
  const pipeline = vm.pipeline;
  const ifStage = pipeline.stageRegisters.IF || {
    pc: (vm.latches.PC - 1) & 0xFFFF,
    nextPc: vm.latches.PC,
    rawInstruction: vm.latches.IR,
  };

  const idStage = pipeline.phaseDecode(ifStage);
  const exStage = pipeline.phaseExecute(idStage);
  const memStage = pipeline.phaseMemory(exStage);
  const wbStage = pipeline.phaseWriteBack(memStage);

  const mode = decoded.immFlag ? 'IMMEDIATE' : 'REGISTER';
  return {
    mode,
    dr: decoded.dr,
    sr1: decoded.sr1,
    sr1Val: idStage.sr1Val,
    sr2: decoded.sr2,
    sr2Val: idStage.sr2Val,
    imm5: decoded.imm5,
    result: exStage.aluOutput.result,
    controlSignals: idStage.control,
    aluOutput: exStage.aluOutput,
    writeRecord: wbStage.writeRecord,
    hardwareEvents: [
      ...idStage.hardwareEvents,
      ...exStage.hardwareEvents,
      ...memStage.hardwareEvents,
      ...wbStage.hardwareEvents,
    ],
  };
}

/**
 * Handles LD instruction (Opcode 0b0010) by running ID -> EX -> MEM -> WB.
 *
 * @param {object} vm - Virtual machine instance
 * @param {object} decoded - Decoded instruction fields
 * @returns {object} Execution details
 */
export function handleLd(vm, decoded) {
  const pipeline = vm.pipeline;
  const ifStage = pipeline.stageRegisters.IF || {
    pc: (vm.latches.PC - 1) & 0xFFFF,
    nextPc: vm.latches.PC,
    rawInstruction: vm.latches.IR,
  };

  const idStage = pipeline.phaseDecode(ifStage);
  const exStage = pipeline.phaseExecute(idStage);
  const memStage = pipeline.phaseMemory(exStage);
  const wbStage = pipeline.phaseWriteBack(memStage);

  return {
    dr: decoded.dr,
    pcOffset9: decoded.pcOffset9,
    effectiveAddress: exStage.effectiveAddress,
    loadedValue: memStage.loadedValue,
    controlSignals: idStage.control,
    writeRecord: wbStage.writeRecord,
    hardwareEvents: [
      ...idStage.hardwareEvents,
      ...exStage.hardwareEvents,
      ...memStage.hardwareEvents,
      ...wbStage.hardwareEvents,
    ],
  };
}

/**
 * Dispatch table mapping opcodes to their specific handler functions.
 */
export const INSTRUCTION_DISPATCH_TABLE = {
  [OPCODE.ADD]: handleAdd,
  [OPCODE.LD]:  handleLd,
};
