import { toUint16 } from '../utils/bit-utils.js';
import { OPCODE, REG_PC } from '../constants.js';

/**
 * Case-specific instruction execution handlers using the Dispatch Table / Strategy Pattern.
 * Each function is responsible for one specific instruction case, returning execution metadata.
 */

/**
 * Executes ADD in register mode: DR = SR1 + SR2
 */
function executeAddRegister(vm, dr, sr1, sr2) {
  const sr1Val = vm.reg[sr1];
  const sr2Val = vm.reg[sr2];
  const result = toUint16(sr1Val + sr2Val);
  vm.reg[dr] = result;
  vm.setCC(dr);

  return {
    mode: 'REGISTER',
    dr,
    sr1,
    sr1Val,
    sr2,
    sr2Val,
    result,
  };
}

/**
 * Executes ADD in immediate mode: DR = SR1 + imm5
 */
function executeAddImmediate(vm, dr, sr1, imm5) {
  const sr1Val = vm.reg[sr1];
  const result = toUint16(sr1Val + imm5);
  vm.reg[dr] = result;
  vm.setCC(dr);

  return {
    mode: 'IMMEDIATE',
    dr,
    sr1,
    sr1Val,
    imm5,
    result,
  };
}

/**
 * Handles ADD instruction (Opcode 0b0001).
 * Delegates to register or immediate execution based on immFlag.
 */
export function handleAdd(vm, decoded) {
  if (decoded.immFlag) {
    return executeAddImmediate(vm, decoded.dr, decoded.sr1, decoded.imm5);
  } else {
    return executeAddRegister(vm, decoded.dr, decoded.sr1, decoded.sr2);
  }
}

/**
 * Handles LD instruction (Opcode 0b0010).
 * Loads memory contents at (PC + pcOffset9) into DR.
 */
export function handleLd(vm, decoded) {
  const effectiveAddress = toUint16(vm.reg[REG_PC] + decoded.pcOffset9);
  const loadedValue = vm.mem[effectiveAddress];
  vm.reg[decoded.dr] = loadedValue;
  vm.setCC(decoded.dr);

  return {
    dr: decoded.dr,
    pcOffset9: decoded.pcOffset9,
    effectiveAddress,
    loadedValue,
  };
}

/**
 * Dispatch table mapping opcodes to their specific handler functions.
 * Replaces monolithic switch / if-else chains and adheres to the Open/Closed Principle.
 */
export const INSTRUCTION_DISPATCH_TABLE = {
  [OPCODE.ADD]: handleAdd,
  [OPCODE.LD]:  handleLd,
};
