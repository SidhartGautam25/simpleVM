import { OPCODE, DEFAULT_CODE_START } from '../constants.js';
import { toUint16 } from '../utils/bit-utils.js';

/**
 * Strips comments (starting with ';') and trims surrounding whitespace.
 * Returns null if the line becomes empty.
 */
function cleanLine(line) {
  const commentIndex = line.indexOf(';');
  const stripped = commentIndex !== -1 ? line.slice(0, commentIndex) : line;
  const trimmed = stripped.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Case-specific parser: LD Rn, #literal
 */
function parseLd(line) {
  const match = line.match(/^LD\s+R(\d+),\s*#(-?\d+)$/i);
  if (!match) return null;

  const dr = parseInt(match[1], 10);
  const value = parseInt(match[2], 10);

  if (dr < 0 || dr > 7) {
    throw new Error(`Invalid register R${dr} in LD instruction. Must be R0-R7.`);
  }
  if (value < -32768 || value > 65535) {
    throw new Error(`Literal value ${value} out of range for LD instruction (-32768 to 65535).`);
  }

  return { type: 'LD', dr, value };
}

/**
 * Case-specific parser: ADD DR, SR1, SR2
 */
function parseAddRegister(line) {
  const match = line.match(/^ADD\s+R(\d+),\s*R(\d+),\s*R(\d+)$/i);
  if (!match) return null;

  const dr = parseInt(match[1], 10);
  const sr1 = parseInt(match[2], 10);
  const sr2 = parseInt(match[3], 10);

  [dr, sr1, sr2].forEach((r, idx) => {
    if (r < 0 || r > 7) {
      throw new Error(`Invalid register R${r} in ADD instruction operand ${idx + 1}.`);
    }
  });

  return { type: 'ADD_REG', dr, sr1, sr2 };
}

/**
 * Case-specific parser: ADD DR, SR1, #imm5
 */
function parseAddImmediate(line) {
  const match = line.match(/^ADD\s+R(\d+),\s*R(\d+),\s*#(-?\d+)$/i);
  if (!match) return null;

  const dr = parseInt(match[1], 10);
  const sr1 = parseInt(match[2], 10);
  const imm5 = parseInt(match[3], 10);

  [dr, sr1].forEach((r, idx) => {
    if (r < 0 || r > 7) {
      throw new Error(`Invalid register R${r} in ADD instruction operand ${idx + 1}.`);
    }
  });

  if (imm5 < -16 || imm5 > 15) {
    throw new Error(`Immediate value ${imm5} out of range for ADD instruction (-16 to 15).`);
  }

  return { type: 'ADD_IMM', dr, sr1, imm5 };
}

/**
 * Binary encoders for each instruction type.
 */
function encodeAddRegister(dr, sr1, sr2) {
  return (OPCODE.ADD << 12) | (dr << 9) | (sr1 << 6) | (0b000 << 3) | sr2;
}

function encodeAddImmediate(dr, sr1, imm5) {
  return (OPCODE.ADD << 12) | (dr << 9) | (sr1 << 6) | (0b1 << 5) | (imm5 & 0b11111);
}

function encodeLd(dr, pcOffset9) {
  return (OPCODE.LD << 12) | (dr << 9) | (pcOffset9 & 0x1FF);
}

/**
 * Two-pass Assembler for Version 2 assembly programs.
 * Decoupled from VM execution, responsible for parsing, encoding, and resolving literal pools.
 */
export class Assembler {
  constructor(codeStart = DEFAULT_CODE_START) {
    this.codeStart = codeStart;
  }

  /**
   * Assembles an array of assembly statements into machine code and literal entries.
   *
   * @param {string[]} lines - Assembly lines
   * @returns {object} Assembled program object containing code, literals, and memory layout
   */
  assemble(lines) {
    const code = [];
    const pendingFixups = [];

    // PASS 1: Parse instructions and record fixups for literals
    for (const rawLine of lines) {
      const line = cleanLine(rawLine)
      if (!line) continue;

      const ldStatement = parseLd(line);
      if (ldStatement) {
        const pos = code.length;
        code.push(0); // Placeholder to be patched in Pass 2
        pendingFixups.push({ pos, dr: ldStatement.dr, value: ldStatement.value });
        continue;
      }

      const addRegStatement = parseAddRegister(line);
      if (addRegStatement) {
        code.push(encodeAddRegister(addRegStatement.dr, addRegStatement.sr1, addRegStatement.sr2));
        continue;
      }

      const addImmStatement = parseAddImmediate(line);
      if (addImmStatement) {
        code.push(encodeAddImmediate(addImmStatement.dr, addImmStatement.sr1, addImmStatement.imm5));
        continue;
      }

      throw new Error(`Syntax error: unrecognized instruction "${rawLine}"`);
    }

    // PASS 2: Allocate literals pool and patch LD offsets
    const literalStart = this.codeStart + code.length;
    const literals = [];
    const literalIndex = new Map();

    for (const fixup of pendingFixups) {
      let addr;
      if (literalIndex.has(fixup.value)) {
        addr = literalIndex.get(fixup.value);
      } else {
        addr = literalStart + literals.length;
        literals.push(fixup.value);
        literalIndex.set(fixup.value, addr);
      }

      // PC will point to codeStart + fixup.pos + 1 after the instruction fetch
      const pcAtExec = this.codeStart + fixup.pos + 1;
      const offset = addr - pcAtExec;

      if (offset < -256 || offset > 255) {
        throw new Error(`PC-relative offset ${offset} exceeds 9-bit limit for LD instruction.`);
      }

      code[fixup.pos] = encodeLd(fixup.dr, offset);
    }

    // Generate complete memory map entries for both code and literals
    const memoryEntries = [];
    for (let i = 0; i < code.length; i++) {
      memoryEntries.push({ address: this.codeStart + i, value: code[i] });
    }
    for (let i = 0; i < literals.length; i++) {
      memoryEntries.push({ address: literalStart + i, value: toUint16(literals[i]) });
    }

    return {
      codeStart: this.codeStart,
      code,
      literals,
      literalStart,
      memoryEntries,
    };
  }
}

