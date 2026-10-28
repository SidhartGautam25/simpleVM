import { toUint16 } from '../utils/bit-utils.js';
import { OPCODE } from '../constants.js';

/**
 * Instruction Handlers for Version 2.1
 *
 * Coordinates execution across hardware modules:
 * - RegisterFile read ports (Port A, Port B)
 * - RegisterFile write port with RegWrite enable
 * - Hardware Latches (MAR, MDR, PC, PSR)
 */

/**
 * Executes ADD in register mode: DR = SR1 + SR2
 */
function executeAddRegister(vm, dr, sr1, sr2) {
  // ID Stage: Read operands from Register File ports
  const sr1Val = vm.regFile.readPortA(sr1);
  const sr2Val = vm.regFile.readPortB(sr2);

  // EX Stage: ALU performs 16-bit addition
  const result = toUint16(sr1Val + sr2Val);

  // WB Stage: Register File write port latches result with RegWrite = true
  const writeRecord = vm.regFile.write(dr, result, true);

  // WB Stage: Condition codes evaluated and latched into PSR
  vm.setCC(dr);

  const hardwareEvents = [
    `[ID Stage]  Register File: Read Port A <= R${sr1} (${sr1Val})`,
    `[ID Stage]  Register File: Read Port B <= R${sr2} (${sr2Val})`,
    `[EX Stage]  ALU Unit: ${sr1Val} + ${sr2Val} = ${result} (16-bit word)`,
    `[MEM Stage] Memory Bus: IDLE (No memory access required for ADD)`,
    `[WB Stage]  Register File: Write Port R${dr} <= ${result} (RegWrite: ENABLED)`,
    `[WB Stage]  PSR Latch <= 0b${vm.latches.PSR.toString(2).padStart(3, '0')} (Condition Code updated)`,
  ];

  return {
    mode: 'REGISTER',
    dr,
    sr1,
    sr1Val,
    sr2,
    sr2Val,
    result,
    writeRecord,
    hardwareEvents,
  };
}

/**
 * Executes ADD in immediate mode: DR = SR1 + imm5
 */
function executeAddImmediate(vm, dr, sr1, imm5) {
  // ID Stage: Read operand SR1 from Register File Port A
  const sr1Val = vm.regFile.readPortA(sr1);

  // EX Stage: ALU Input B selected from SEXT5 immediate; computes addition
  const result = toUint16(sr1Val + imm5);

  // WB Stage: Write port latches result with RegWrite = true
  const writeRecord = vm.regFile.write(dr, result, true);

  // WB Stage: Condition codes evaluated and latched into PSR
  vm.setCC(dr);

  const immSign = imm5 >= 0 ? `+${imm5}` : `${imm5}`;
  const hardwareEvents = [
    `[ID Stage]  Register File: Read Port A <= R${sr1} (${sr1Val})`,
    `[ID Stage]  Sign-Extension Unit (SEXT5): Imm5 <= ${immSign}`,
    `[EX Stage]  ALU Unit (ALUSrc: IMM): ${sr1Val} + (${immSign}) = ${result}`,
    `[MEM Stage] Memory Bus: IDLE (No memory access required for ADD)`,
    `[WB Stage]  Register File: Write Port R${dr} <= ${result} (RegWrite: ENABLED)`,
    `[WB Stage]  PSR Latch <= 0b${vm.latches.PSR.toString(2).padStart(3, '0')} (Condition Code updated)`,
  ];

  return {
    mode: 'IMMEDIATE',
    dr,
    sr1,
    sr1Val,
    imm5,
    result,
    writeRecord,
    hardwareEvents,
  };
}

/**
 * Handles ADD instruction (Opcode 0b0001).
 * Routes to immediate or register execution based on immFlag.
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
 * Computes effective address, loads word via MAR/MDR, and writes to DR.
 */
export function handleLd(vm, decoded) {
  // EX Stage: Address adder computes Effective Address = PC + SEXT(PCoffset9)
  const currentPc = vm.latches.PC;
  const effectiveAddress = toUint16(currentPc + decoded.pcOffset9);

  // MEM Stage: Latch effective address into MAR and read memory word into MDR
  vm.latches.latchMAR(effectiveAddress);
  const loadedValue = vm.latches.latchMDR(vm.mem[vm.latches.MAR]);

  // WB Stage: Register File write port latches MDR value with RegWrite = true
  const writeRecord = vm.regFile.write(decoded.dr, loadedValue, true);

  // WB Stage: Condition codes evaluated and latched into PSR
  vm.setCC(decoded.dr);

  const offsetSign = decoded.pcOffset9 >= 0 ? `+${decoded.pcOffset9}` : `${decoded.pcOffset9}`;
  const hardwareEvents = [
    `[ID Stage]  Sign-Extension Unit (SEXT9): PCoffset9 <= ${offsetSign}`,
    `[EX Stage]  Address Adder: PC (${currentPc}) + Offset (${offsetSign}) -> Target Address: ${effectiveAddress}`,
    `[MEM Stage] Memory Address Register (MAR) <= ${effectiveAddress} (Address Bus)`,
    `[MEM Stage] Memory Data Register (MDR) <= ${loadedValue} (Read from RAM[${effectiveAddress}])`,
    `[WB Stage]  Register File: Write Port R${decoded.dr} <= MDR (${loadedValue}) (RegWrite: ENABLED)`,
    `[WB Stage]  PSR Latch <= 0b${vm.latches.PSR.toString(2).padStart(3, '0')} (Condition Code updated)`,
  ];

  return {
    dr: decoded.dr,
    pcOffset9: decoded.pcOffset9,
    effectiveAddress,
    loadedValue,
    writeRecord,
    hardwareEvents,
  };
}

/**
 * Dispatch table mapping opcodes to their specific handler functions.
 */
export const INSTRUCTION_DISPATCH_TABLE = {
  [OPCODE.ADD]: handleAdd,
  [OPCODE.LD]:  handleLd,
};
