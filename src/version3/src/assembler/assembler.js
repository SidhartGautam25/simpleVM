/**
 * Stage 24: Two-Pass Educational Assembler
 *
 * Translates LC-3 assembly source code into 16-bit binary machine code.
 *
 * Features:
 *   - Labels (e.g. `LOOP:`, `DONE:`, `VALUE:`)
 *   - Comments starting with `;`
 *   - Directives: `.ORIG <address>`, `.FILL <value>`, `.END`
 *   - Instructions:
 *       ADD DR, SR1, SR2
 *       ADD DR, SR1, #imm5
 *       AND DR, SR1, SR2
 *       AND DR, SR1, #imm5
 *       NOT DR, SR
 *       BR[n][z][p] LABEL
 *       LD DR, LABEL / OFFSET
 *       ST SR, LABEL / OFFSET
 *       JMP BaseR / RET
 *       HALT (encodes as TRAP 0x25 = 0xF025)
 */

import { OPCODE } from '../cpu/instruction-set.js';

export class Assembler {
  assemble(sourceText) {
    const lines = sourceText.split(/\r?\n/);
    const symbols = new Map();
    const statements = [];

    let origin = 0x3000;
    let currentAddress = origin;

    // -------------------------------------------------------------
    // PASS 1: Clean lines, resolve labels, build symbol table
    // -------------------------------------------------------------
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      let rawLine = lines[lineNum];

      // Strip comments
      const commentIdx = rawLine.indexOf(';');
      if (commentIdx !== -1) {
        rawLine = rawLine.slice(0, commentIdx);
      }
      rawLine = rawLine.trim();
      if (!rawLine) continue;

      // Check for labels (e.g., "LOOP:" or "LOOP ADD ...")
      let tokens = rawLine.split(/[\s,]+/);
      let label = null;

      if (tokens[0].endsWith(':')) {
        label = tokens[0].slice(0, -1);
        tokens = tokens.slice(1);
      } else if (!isInstructionOrDirective(tokens[0])) {
        label = tokens[0];
        tokens = tokens.slice(1);
      }

      if (label) {
        symbols.set(label, currentAddress);
      }

      if (tokens.length === 0) continue; // Label-only line

      const mnemonic = tokens[0].toUpperCase();

      if (mnemonic === '.ORIG') {
        origin = parseNumber(tokens[1]);
        currentAddress = origin;
        continue;
      }

      if (mnemonic === '.END') {
        break;
      }

      statements.push({
        address: currentAddress,
        lineNum: lineNum + 1,
        mnemonic,
        operands: tokens.slice(1),
        raw: rawLine,
      });

      currentAddress++;
    }

    // -------------------------------------------------------------
    // PASS 2: Encode instructions into 16-bit machine code words
    // -------------------------------------------------------------
    const machineCode = [];

    for (const stmt of statements) {
      const { address, mnemonic, operands, lineNum } = stmt;

      try {
        const word = encodeInstruction(mnemonic, operands, address, symbols);
        machineCode.push({
          address,
          word,
          hex: '0x' + word.toString(16).padStart(4, '0').toUpperCase(),
          raw: stmt.raw,
        });
      } catch (err) {
        throw new Error(`Assembly Error at line ${lineNum} (${stmt.raw}): ${err.message}`);
      }
    }

    return {
      origin,
      machineCode,
      symbols: Object.fromEntries(symbols),
      words: machineCode.map((m) => m.word),
    };
  }
}

function isInstructionOrDirective(token) {
  const upper = token.toUpperCase();
  if (upper.startsWith('.')) return true;
  if (upper.startsWith('BR')) return true;
  const known = ['ADD', 'AND', 'NOT', 'LD', 'ST', 'JMP', 'RET', 'HALT'];
  return known.includes(upper);
}

function parseRegister(token) {
  const match = token.toUpperCase().match(/^R([0-7])$/);
  if (!match) throw new Error(`Invalid register specifier: "${token}" (expected R0..R7)`);
  return parseInt(match[1], 10);
}

function parseNumber(token) {
  if (token.startsWith('#')) return parseInt(token.slice(1), 10);
  if (token.startsWith('0x') || token.startsWith('0X')) return parseInt(token, 16);
  if (token.startsWith('x') || token.startsWith('X')) return parseInt(token.slice(1), 16);
  return parseInt(token, 10);
}

function encodeInstruction(mnemonic, ops, currentAddr, symbols) {
  // .FILL directive
  if (mnemonic === '.FILL') {
    const val = symbols.has(ops[0]) ? symbols.get(ops[0]) : parseNumber(ops[0]);
    return val & 0xffff;
  }

  // HALT pseudo-op (TRAP 0x25 = 0xF025)
  if (mnemonic === 'HALT') {
    return (OPCODE.TRAP << 12) | 0x25;
  }

  // RET pseudo-op (JMP R7 = 0xC1C0)
  if (mnemonic === 'RET') {
    return (OPCODE.JMP << 12) | (7 << 6);
  }

  // JMP BaseR
  if (mnemonic === 'JMP') {
    const baseR = parseRegister(ops[0]);
    return (OPCODE.JMP << 12) | (baseR << 6);
  }

  // ADD DR, SR1, SR2 or ADD DR, SR1, #imm5
  if (mnemonic === 'ADD') {
    const dr = parseRegister(ops[0]);
    const sr1 = parseRegister(ops[1]);
    const isImm = ops[2].startsWith('#') || !ops[2].toUpperCase().startsWith('R');

    if (isImm) {
      const imm = parseNumber(ops[2]);
      if (imm < -16 || imm > 15) {
        throw new Error(`Immediate value out of 5-bit signed range [-16..15]: ${imm}`);
      }
      const imm5 = imm & 0b11111;
      return (OPCODE.ADD << 12) | (dr << 9) | (sr1 << 6) | (1 << 5) | imm5;
    } else {
      const sr2 = parseRegister(ops[2]);
      return (OPCODE.ADD << 12) | (dr << 9) | (sr1 << 6) | sr2;
    }
  }

  // AND DR, SR1, SR2 or AND DR, SR1, #imm5
  if (mnemonic === 'AND') {
    const dr = parseRegister(ops[0]);
    const sr1 = parseRegister(ops[1]);
    const isImm = ops[2].startsWith('#') || !ops[2].toUpperCase().startsWith('R');

    if (isImm) {
      const imm = parseNumber(ops[2]);
      const imm5 = imm & 0b11111;
      return (OPCODE.AND << 12) | (dr << 9) | (sr1 << 6) | (1 << 5) | imm5;
    } else {
      const sr2 = parseRegister(ops[2]);
      return (OPCODE.AND << 12) | (dr << 9) | (sr1 << 6) | sr2;
    }
  }

  // NOT DR, SR
  if (mnemonic === 'NOT') {
    const dr = parseRegister(ops[0]);
    const sr = parseRegister(ops[1]);
    return (OPCODE.NOT << 12) | (dr << 9) | (sr << 6) | 0b111111;
  }

  // Branch instructions: BR, BRn, BRz, BRp, BRzp, BRnz, BRnp, BRnzp
  if (mnemonic.startsWith('BR')) {
    let condStr = mnemonic.slice(2).toLowerCase();
    if (condStr === '') condStr = 'nzp'; // Plain BR means unconditional branch

    const n = condStr.includes('n') ? 1 : 0;
    const z = condStr.includes('z') ? 1 : 0;
    const p = condStr.includes('p') ? 1 : 0;

    const target = symbols.has(ops[0]) ? symbols.get(ops[0]) : parseNumber(ops[0]);
    // Offset is relative to (PC + 1), because PC increments during fetch phase!
    const offset = target - (currentAddr + 1);
    if (offset < -256 || offset > 255) {
      throw new Error(`Branch target out of 9-bit signed PC-offset range: ${offset}`);
    }
    const offset9 = offset & 0x1ff;

    return (OPCODE.BR << 12) | (n << 11) | (z << 10) | (p << 9) | offset9;
  }

  // LD DR, Label
  if (mnemonic === 'LD') {
    const dr = parseRegister(ops[0]);
    const target = symbols.has(ops[1]) ? symbols.get(ops[1]) : parseNumber(ops[1]);
    const offset = target - (currentAddr + 1);
    const offset9 = offset & 0x1ff;
    return (OPCODE.LD << 12) | (dr << 9) | offset9;
  }

  // ST SR, Label
  if (mnemonic === 'ST') {
    const sr = parseRegister(ops[0]);
    const target = symbols.has(ops[1]) ? symbols.get(ops[1]) : parseNumber(ops[1]);
    const offset = target - (currentAddr + 1);
    const offset9 = offset & 0x1ff;
    return (OPCODE.ST << 12) | (sr << 9) | offset9;
  }

  throw new Error(`Unknown instruction mnemonic: "${mnemonic}"`);
}

