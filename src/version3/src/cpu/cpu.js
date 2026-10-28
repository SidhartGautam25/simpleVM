/**
 * Stage 22 & 23: Complete Clocked Educational CPU
 *
 * Integrates:
 *   - Clock (Clock transitions and cycle counting)
 *   - Program Counter (PC, 16-bit register)
 *   - Instruction Register (IR, 16-bit register)
 *   - Processor Status Register (PSR, condition flags: N, Z, P)
 *   - Register File (R0..R7 with dual read ports and decoded write port)
 *   - Arithmetic Logic Unit (ALU built on gate-level full-adder and logic networks)
 *   - Main Memory Interface (MAR, MDR, and 64K RAM)
 *   - Instruction Decoder
 *   - Multicycle Control Unit FSM
 *
 * All operations execute through actual digital hardware components.
 */

import { Clock, CLOCK_EDGE } from '../storage/clock.js';
import { Register } from '../storage/register.js';
import { RegisterFile } from '../datapath/register-file.js';
import { ALU, ALU_OP } from '../datapath/alu.js';
import { RAM } from '../memory/ram.js';
import { MemoryInterface } from '../memory/memory-interface.js';
import { InstructionDecoder } from './instruction-decoder.js';
import { CPU_STATE, ControlUnit } from './control-unit.js';
import { OPCODE, PSR_FLAGS } from './instruction-set.js';
import { adderSubtractor } from '../logic/subtractor.js';
import { increment } from '../logic/subtractor.js';
import { intToBits, bitsToUnsigned, formatBitString } from '../logic/bit-utils.js';

export class CPU {
  constructor(startAddress = 0x3000) {
    this.startAddress = startAddress;

    // Hardware Components
    this.clock = new Clock();
    this.pc = new Register(16, 'PC', startAddress);
    this.ir = new Register(16, 'IR', 0);
    this.psr = new Register(16, 'PSR', PSR_FLAGS.ZERO);

    this.regFile = new RegisterFile(16, 8);
    this.alu = new ALU(16);
    this.ram = new RAM(65536);
    this.memInterface = new MemoryInterface(this.ram);
    this.decoder = new InstructionDecoder();
    this.controlUnit = new ControlUnit();

    // Internal execution logging & state
    this.instructionsExecuted = 0;
    this.traceLog = [];
    this.lastTrace = null;

    this.reset();
  }

  /**
   * Resets all CPU registers and datapath state to initial power-on values.
   */
  reset() {
    this.clock.reset();
    this.pc.forceValue(this.startAddress);
    this.ir.forceValue(0);
    this.psr.forceValue(PSR_FLAGS.ZERO);
    this.memInterface.reset();
    this.controlUnit.reset();
    this.controlUnit.currentState = CPU_STATE.FETCH_1;
    this.instructionsExecuted = 0;
    this.traceLog = [];
  }

  /**
   * Advances the CPU by exactly one clock cycle.
   * Progression follows the synchronous multicycle FSM.
   */
  stepClock() {
    if (this.controlUnit.currentState === CPU_STATE.HALTED) {
      return false; // CPU is halted
    }

    const state = this.controlUnit.currentState;
    const signals = this.controlUnit.signals;
    let nextState = state;
    const traceEntry = {
      cycle: this.clock.cycleCount + 1,
      state,
      pcBefore: this.pc.readUint(),
      irBefore: this.ir.readUint(),
      notes: '',
    };

    switch (state) {
      // ------------------------------------------------------------------
      // Phase 1: Transfer PC into MAR to initiate instruction fetch
      // ------------------------------------------------------------------
      case CPU_STATE.FETCH_1: {
        const pcBits = this.pc.readBits();
        this.memInterface.mar.prepare(pcBits, 1, 0);
        traceEntry.notes = `MAR <= PC (0x${this.pc.readUint().toString(16).toUpperCase()})`;
        nextState = CPU_STATE.FETCH_2;
        break;
      }

      // ------------------------------------------------------------------
      // Phase 2: Memory Read at MAR into MDR, Advance PC via gate-level adder
      // ------------------------------------------------------------------
      case CPU_STATE.FETCH_2: {
        this.memInterface.stepRead();

        // Increment PC using gate-level binary adder
        const nextPcBits = increment(this.pc.readBits());
        this.pc.prepare(nextPcBits, 1, 0);

        traceEntry.notes = `MDR <= RAM[MAR], PC <= PC + 1 (0x${bitsToUnsigned(nextPcBits).toString(16).toUpperCase()})`;
        nextState = CPU_STATE.FETCH_3;
        break;
      }

      // ------------------------------------------------------------------
      // Phase 3: Transfer MDR into Instruction Register (IR)
      // ------------------------------------------------------------------
      case CPU_STATE.FETCH_3: {
        const mdrBits = this.memInterface.mdr.readBits();
        this.ir.prepare(mdrBits, 1, 0);
        traceEntry.notes = `IR <= MDR (0x${this.memInterface.mdr.readUint().toString(16).toUpperCase()})`;
        nextState = CPU_STATE.DECODE;
        break;
      }

      // ------------------------------------------------------------------
      // Phase 4: Decode Instruction Register
      // ------------------------------------------------------------------
      case CPU_STATE.DECODE: {
        const decoded = this.decoder.decode(this.ir.readBits());
        traceEntry.notes = `Decoded: ${decoded.opcodeName} (Opcode 0x${decoded.opcode.toString(16)})`;

        // Direct next state based on opcode
        switch (decoded.opcode) {
          case OPCODE.ADD:
          case OPCODE.AND:
          case OPCODE.NOT:
          case OPCODE.BR:
          case OPCODE.JMP:
          case OPCODE.TRAP:
            nextState = CPU_STATE.EXECUTE;
            break;

          case OPCODE.LD:
          case OPCODE.ST:
            nextState = CPU_STATE.EXECUTE; // Computes effective address first
            break;

          default:
            throw new Error(`Unsupported Opcode: 0x${decoded.opcode.toString(16)}`);
        }
        break;
      }

      // ------------------------------------------------------------------
      // Phase 5: Execute via Datapath, ALU, and Condition Logic
      // ------------------------------------------------------------------
      case CPU_STATE.EXECUTE: {
        const decoded = this.decoder.decode(this.ir.readBits());

        switch (decoded.opcode) {
          case OPCODE.ADD: {
            // Read Source Register 1
            const opA = this.regFile.readPortA(decoded.sr1);
            // Select Source Register 2 or Sign-Extended Immediate 5
            const opB = decoded.immFlag === 1 ? decoded.imm5Bits : this.regFile.readPortB(decoded.sr2);

            // Compute result using Gate-Level Ripple-Carry Adder!
            const aluOut = this.alu.execute(opA, opB, ALU_OP.ADD);

            // Prepare writeback to Destination Register
            this.regFile.prepareWrite(decoded.dr, aluOut.resultBits, 1);

            // Prepare PSR condition flags update
            let psrVal = PSR_FLAGS.ZERO;
            if (aluOut.negative === 1) psrVal = PSR_FLAGS.NEGATIVE;
            else if (aluOut.positive === 1) psrVal = PSR_FLAGS.POSITIVE;
            this.psr.prepare(psrVal, 1, 0);

            traceEntry.notes = `ALU ADD: R${decoded.dr} <= R${decoded.sr1} + ${decoded.immFlag ? `imm5(${decoded.imm5Signed})` : `R${decoded.sr2}`} = 0x${aluOut.resultUint.toString(16).toUpperCase()}`;
            this.instructionsExecuted++;
            nextState = CPU_STATE.FETCH_1;
            break;
          }

          case OPCODE.AND: {
            const opA = this.regFile.readPortA(decoded.sr1);
            const opB = decoded.immFlag === 1 ? decoded.imm5Bits : this.regFile.readPortB(decoded.sr2);

            const aluOut = this.alu.execute(opA, opB, ALU_OP.AND);
            this.regFile.prepareWrite(decoded.dr, aluOut.resultBits, 1);

            let psrVal = PSR_FLAGS.ZERO;
            if (aluOut.negative === 1) psrVal = PSR_FLAGS.NEGATIVE;
            else if (aluOut.positive === 1) psrVal = PSR_FLAGS.POSITIVE;
            this.psr.prepare(psrVal, 1, 0);

            traceEntry.notes = `ALU AND: R${decoded.dr} <= R${decoded.sr1} & ... = 0x${aluOut.resultUint.toString(16).toUpperCase()}`;
            this.instructionsExecuted++;
            nextState = CPU_STATE.FETCH_1;
            break;
          }

          case OPCODE.NOT: {
            const opA = this.regFile.readPortA(decoded.sr1);
            const dummyB = intToBits(0, 16);
            const aluOut = this.alu.execute(opA, dummyB, ALU_OP.NOT);

            this.regFile.prepareWrite(decoded.dr, aluOut.resultBits, 1);

            let psrVal = PSR_FLAGS.ZERO;
            if (aluOut.negative === 1) psrVal = PSR_FLAGS.NEGATIVE;
            else if (aluOut.positive === 1) psrVal = PSR_FLAGS.POSITIVE;
            this.psr.prepare(psrVal, 1, 0);

            traceEntry.notes = `ALU NOT: R${decoded.dr} <= ~R${decoded.sr1} = 0x${aluOut.resultUint.toString(16).toUpperCase()}`;
            this.instructionsExecuted++;
            nextState = CPU_STATE.FETCH_1;
            break;
          }

          case OPCODE.BR: {
            // Evaluate condition codes stored in PSR
            const psrVal = this.psr.readUint();
            const nMatch = decoded.n === 1 && (psrVal & PSR_FLAGS.NEGATIVE);
            const zMatch = decoded.z === 1 && (psrVal & PSR_FLAGS.ZERO);
            const pMatch = decoded.p === 1 && (psrVal & PSR_FLAGS.POSITIVE);
            const branchTaken = nMatch || zMatch || pMatch;

            if (branchTaken) {
              // Target address: PC + PCoffset9 using gate-level adder!
              const targetBits = adderSubtractor(this.pc.readBits(), decoded.pcOffset9Bits, 0).sumBits;
              this.pc.prepare(targetBits, 1, 0);
              traceEntry.notes = `BR TAKEN: PC <= PC + (${decoded.pcOffset9Signed}) = 0x${bitsToUnsigned(targetBits).toString(16).toUpperCase()}`;
            } else {
              traceEntry.notes = `BR NOT TAKEN: Condition flags did not match PSR(0b${psrVal.toString(2).padStart(3, '0')})`;
            }

            this.instructionsExecuted++;
            nextState = CPU_STATE.FETCH_1;
            break;
          }

          case OPCODE.LD: {
            // Effective address: PC + PCoffset9
            const effAddrBits = adderSubtractor(this.pc.readBits(), decoded.pcOffset9Bits, 0).sumBits;
            this.memInterface.mar.prepare(effAddrBits, 1, 0);
            traceEntry.notes = `LD Effective Address: MAR <= PC + (${decoded.pcOffset9Signed}) = 0x${bitsToUnsigned(effAddrBits).toString(16).toUpperCase()}`;
            nextState = CPU_STATE.MEM_READ;
            break;
          }

          case OPCODE.ST: {
            // Effective address: PC + PCoffset9
            const effAddrBits = adderSubtractor(this.pc.readBits(), decoded.pcOffset9Bits, 0).sumBits;
            this.memInterface.mar.prepare(effAddrBits, 1, 0);
            // Read source register into MDR
            const srData = this.regFile.readPortA(decoded.dr);
            this.memInterface.mdr.prepare(srData, 1, 0);
            traceEntry.notes = `ST Address: MAR <= 0x${bitsToUnsigned(effAddrBits).toString(16).toUpperCase()}, MDR <= R${decoded.dr}`;
            nextState = CPU_STATE.MEM_WRITE;
            break;
          }

          case OPCODE.JMP: {
            // JMP / RET: PC <= BaseR
            const targetBits = this.regFile.readPortA(decoded.baseR);
            this.pc.prepare(targetBits, 1, 0);
            traceEntry.notes = `JMP: PC <= R${decoded.baseR} (0x${bitsToUnsigned(targetBits).toString(16).toUpperCase()})`;
            this.instructionsExecuted++;
            nextState = CPU_STATE.FETCH_1;
            break;
          }

          case OPCODE.TRAP: {
            if (decoded.trapVector === 0x25) {
              // HALT trap
              traceEntry.notes = 'TRAP 0x25: HALT requested.';
              nextState = CPU_STATE.HALTED;
            } else {
              traceEntry.notes = `TRAP 0x${decoded.trapVector.toString(16)}`;
              nextState = CPU_STATE.HALTED;
            }
            this.instructionsExecuted++;
            break;
          }
        }
        break;
      }

      // ------------------------------------------------------------------
      // Phase 6: Memory Read (for LD)
      // ------------------------------------------------------------------
      case CPU_STATE.MEM_READ: {
        this.memInterface.stepRead();
        traceEntry.notes = `MDR <= RAM[MAR] (0x${this.memInterface.ram.read(this.memInterface.mar.readUint()).toString(16).toUpperCase()})`;
        nextState = CPU_STATE.WRITEBACK;
        break;
      }

      // ------------------------------------------------------------------
      // Phase 7: Memory Write (for ST)
      // ------------------------------------------------------------------
      case CPU_STATE.MEM_WRITE: {
        this.memInterface.stepWrite();
        traceEntry.notes = `RAM[MAR] <= MDR`;
        this.instructionsExecuted++;
        nextState = CPU_STATE.FETCH_1;
        break;
      }

      // ------------------------------------------------------------------
      // Phase 8: Writeback (for LD)
      // ------------------------------------------------------------------
      case CPU_STATE.WRITEBACK: {
        const decoded = this.decoder.decode(this.ir.readBits());
        const dataBits = this.memInterface.mdr.readBits();
        this.regFile.prepareWrite(decoded.dr, dataBits, 1);

        // Update condition codes based on loaded data
        const val = this.memInterface.mdr.readUint();
        let psrVal = PSR_FLAGS.ZERO;
        if (dataBits[0] === 1) psrVal = PSR_FLAGS.NEGATIVE;
        else if (val > 0) psrVal = PSR_FLAGS.POSITIVE;
        this.psr.prepare(psrVal, 1, 0);

        traceEntry.notes = `Writeback: R${decoded.dr} <= MDR (0x${val.toString(16).toUpperCase()})`;
        this.instructionsExecuted++;
        nextState = CPU_STATE.FETCH_1;
        break;
      }
    }

    // Synchronous clock transition: commit all state changes
    this.clock.stepCycle();
    this.pc.commit();
    this.ir.commit();
    this.psr.commit();
    this.memInterface.commit();
    this.regFile.commit();

    this.controlUnit.currentState = nextState;
    this.lastTrace = traceEntry;
    this.traceLog.push(traceEntry);

    return true;
  }

  /**
   * Executes clock cycles until one full instruction completes (cycles back to FETCH_1 or HALTS).
   */
  stepInstruction() {
    if (this.controlUnit.currentState === CPU_STATE.HALTED) return false;

    let cycles = 0;
    do {
      const running = this.stepClock();
      cycles++;
      if (!running || cycles > 20) break;
    } while (this.controlUnit.currentState !== CPU_STATE.FETCH_1);

    return true;
  }

  /**
   * Runs the CPU until HALT or maxCycles is reached.
   */
  run(maxCycles = 1000) {
    let cycles = 0;
    while (this.controlUnit.currentState !== CPU_STATE.HALTED && cycles < maxCycles) {
      this.stepClock();
      cycles++;
    }
    return cycles;
  }

  /**
   * Formats comprehensive architectural snapshot for inspection.
   */
  inspect() {
    const pcHex = '0x' + this.pc.readUint().toString(16).toUpperCase();
    const irHex = '0x' + this.ir.readUint().toString(16).toUpperCase();
    const psrVal = this.psr.readUint();
    const psrStr = `N=${(psrVal >> 2) & 1} Z=${(psrVal >> 1) & 1} P=${psrVal & 1}`;

    const lines = [
      `[Clock Cycle: ${this.clock.cycleCount}] [State: ${this.controlUnit.currentState}]`,
      `PC:  ${pcHex} | IR: ${irHex} | PSR: ${psrStr}`,
      `MAR: 0x${this.memInterface.mar.readUint().toString(16).toUpperCase()} | MDR: 0x${this.memInterface.mdr.readUint().toString(16).toUpperCase()}`,
      `Registers:`,
      this.regFile.inspect(),
    ];
    return lines.join('\n');
  }
}

