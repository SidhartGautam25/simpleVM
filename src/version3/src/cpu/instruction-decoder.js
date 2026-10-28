/**
 * Stage 16: Instruction Decoder
 *
 * Examines the 16-bit word currently held in the Instruction Register (IR)
 * and decodes it into structured architectural fields:
 *   - Opcode (bits [15:12])
 *   - Destination Register DR (bits [11:9])
 *   - Source Register 1 SR1 (bits [8:6])
 *   - Immediate Mode Flag (bit [5])
 *   - Source Register 2 SR2 (bits [2:0])
 *   - Imm5 (bits [4:0]) with 16-bit sign-extension
 *   - Condition branch flags (n = bit 11, z = bit 10, p = bit 9)
 *   - PCoffset9 (bits [8:0]) with 16-bit sign-extension
 *   - TrapVector8 (bits [7:0])
 *
 * Rule 16: Decoding determines what an instruction means.
 * It does NOT execute the instruction.
 */

import { intToBits, bitsToSigned, signExtendBits, bitsToUnsigned } from '../logic/bit-utils.js';
import { OPCODE, OPCODE_NAMES } from './instruction-set.js';

export class InstructionDecoder {
  /**
   * Decodes a 16-bit instruction word.
   *
   * @param {number[]|number} irValue - 16-bit instruction word or bit array
   * @returns {object} Decoded fields
   */
  decode(irValue) {
    const irBits = Array.isArray(irValue) ? irValue : intToBits(irValue, 16);
    const irUint = bitsToUnsigned(irBits);

    // Opcode: bits [15:12]
    const opcode = (irUint >> 12) & 0b1111;
    const opcodeName = OPCODE_NAMES[opcode] || 'UNKNOWN';

    // DR or Condition flags: bits [11:9]
    const dr = (irUint >> 9) & 0b111;
    const n = (irUint >> 11) & 1;
    const z = (irUint >> 10) & 1;
    const p = (irUint >> 9) & 1;

    // SR1 or BaseR: bits [8:6]
    const sr1 = (irUint >> 6) & 0b111;
    const baseR = sr1;

    // ImmFlag: bit [5]
    const immFlag = (irUint >> 5) & 1;

    // SR2: bits [2:0]
    const sr2 = irUint & 0b111;

    // Imm5 sign-extended: bits [4:0]
    const rawImm5Bits = irBits.slice(11, 16); // index 11 is bit 4, index 15 is bit 0
    const imm5Bits = signExtendBits(rawImm5Bits, 16);
    const imm5Signed = bitsToSigned(imm5Bits);

    // PCoffset9 sign-extended: bits [8:0]
    const rawOffset9Bits = irBits.slice(7, 16); // index 7 is bit 8, index 15 is bit 0
    const pcOffset9Bits = signExtendBits(rawOffset9Bits, 16);
    const pcOffset9Signed = bitsToSigned(pcOffset9Bits);

    // Trap Vector: bits [7:0]
    const trapVector = irUint & 0xff;

    return {
      rawWord: irUint,
      rawBits: irBits,
      opcode,
      opcodeName,
      dr,
      sr1,
      baseR,
      sr2,
      immFlag,
      n,
      z,
      p,
      imm5Bits,
      imm5Signed,
      pcOffset9Bits,
      pcOffset9Signed,
      trapVector,
    };
  }
}

