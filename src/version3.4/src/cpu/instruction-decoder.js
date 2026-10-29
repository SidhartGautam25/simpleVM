import { extractBits, signExtend } from '../utils/bit-utils.js';
import { OPCODE_NAMES } from '../constants.js';

/**
 * Instruction Decoder
 *
 * Separates instruction decoding from instruction execution.
 * Extracts 16-bit binary machine instruction fields into a structured object.
 */
export class InstructionDecoder {
  /**
   * Decodes a 16-bit instruction word.
   *
   * Field mappings:
   *   [15:12] - Opcode (4 bits)
   *   [11:9]  - Destination Register DR (3 bits)
   *   [8:6]   - Source Register 1 SR1 (3 bits)
   *   [5]     - Immediate Mode Flag (1 bit)
   *   [4:0]   - 5-bit Immediate imm5 (sign-extended to 16 bits)
   *   [2:0]   - Source Register 2 SR2 (3 bits)
   *   [8:0]   - 9-bit PC-relative offset (sign-extended to 16 bits)
   *
   * @param {number} instruction - 16-bit machine code word
   * @returns {object} Decoded fields
   */
  static decode(instruction) {
    const opcode = extractBits(instruction, 12, 4);
    const opcodeName = OPCODE_NAMES[opcode] || 'UNKNOWN';

    const dr = extractBits(instruction, 9, 3);
    const sr1 = extractBits(instruction, 6, 3);
    const immFlag = extractBits(instruction, 5, 1);
    const sr2 = extractBits(instruction, 0, 3);

    const imm5Raw = extractBits(instruction, 0, 5);
    const imm5 = signExtend(imm5Raw, 5);

    const pcOffset9Raw = extractBits(instruction, 0, 9);
    const pcOffset9 = signExtend(pcOffset9Raw, 9);

    return {
      raw: instruction,
      opcode,
      opcodeName,
      dr,
      sr1,
      sr2,
      immFlag,
      imm5,
      pcOffset9,
    };
  }
}

