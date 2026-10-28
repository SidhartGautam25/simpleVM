import { ADDR_MAX, OPCODE } from '../constants.js';
import { InstructionDecoder } from './instruction-decoder.js';
import { ControlUnit } from './control-unit.js';
import { ALU } from './alu.js';
import { InternalBus } from './internal-bus.js';

/**
 * CPU Pipeline & Multi-Cycle Micro-Engine - Version 3.1
 *
 * Models a multi-cycle CPU datapath driven by physical clock cycles:
 *   - Each instruction takes multiple clock cycles (e.g. 5 cycles for ADD, 6 cycles for LD).
 *   - Micro-Steps synchronized to clock ticks:
 *       Cycle 1: Fetch 1 (GatePC -> BUS -> MAR, MemRead asserted)
 *       Cycle 2: Fetch 2 (Memory bus read cycle -> MDR)
 *       Cycle 3: Fetch 3 (GateMDR -> BUS -> IR, PC increment)
 *       Cycle 4: Decode  (Opcode decode, Control Unit signals & bus gates, RegFile read, SEXT)
 *       Cycle 5: Execute (ALU arithmetic & Write-Back for ADD; Address calculation for LD)
 *       Cycle 6: Memory & Write-Back (MDR -> Central Bus -> RegFile[DR] for LD)
 *   - Two Operational Granularities:
 *       • tick(): Advances the CPU by 1 clock cycle (Micro-step).
 *       • step(): Runs clock ticks until instruction completion (Macro-step).
 */
export class CpuPipeline {
  /**
   * @param {object} vm - Virtual Machine instance containing latches, regFile, bus, and clock
   */
  constructor(vm) {
    this.vm = vm;
    this.latches = vm.latches;
    this.regFile = vm.regFile;
    this.bus = vm.bus;
    this.clock = vm.clock;
    this.internalBus = new InternalBus();

    // Micro-Cycle Sequencer State
    this.microStep = 0; // 0 = Ready for fetch, 1 = Fetch1, 2 = Fetch2, etc.

    // In-flight instruction micro-state
    this.currentInstruction = this._createEmptyInstructionState();

    // Stage registers for backward compatibility
    this.stageRegisters = {
      IF: null,
      ID: null,
      EX: null,
      MEM: null,
      WB: null,
    };
  }

  _createEmptyInstructionState() {
    return {
      fetchPc: 0,
      rawInstruction: 0,
      nextPc: 0,
      decoded: null,
      control: null,
      sr1Val: 0,
      sr2Val: 0,
      aluOutput: null,
      effectiveAddress: null,
      loadedValue: null,
      hardwareEvents: [],
      cycleRecords: [],
    };
  }

  /**
   * Resets the pipeline and micro-sequencer.
   */
  reset() {
    this.internalBus.reset();
    this.microStep = 0;
    this.currentInstruction = this._createEmptyInstructionState();
    this.stageRegisters = {
      IF: null,
      ID: null,
      EX: null,
      MEM: null,
      WB: null,
    };
  }

  /**
   * Advances the CPU by a single physical clock cycle (Micro-step).
   *
   * @returns {object|null} Micro-cycle record with event trace and completion status
   */
  tick() {
    if (this.vm.halted) {
      return null;
    }

    if (this.microStep === 0) {
      if (this.vm.codeEnd !== undefined && this.latches.PC >= this.vm.codeEnd) {
        this.vm.halted = true;
        return null;
      }
      this.currentInstruction = this._createEmptyInstructionState();
      this.microStep = 1;
    }

    const clockResult = this.clock.tick();
    const cycleNum = clockResult.cycle;
    let microOpName = '';
    const cycleEvents = [];
    let instructionComplete = false;
    let finishedInstructionData = null;

    switch (this.microStep) {
      // -------------------------------------------------------------
      // CLOCK CYCLE 1: FETCH 1 (Drive PC to MAR via Central Bus)
      // -------------------------------------------------------------
      case 1: {
        microOpName = 'FETCH-1: Drive PC to MAR';
        const fetchPc = this.latches.PC;
        this.currentInstruction.fetchPc = fetchPc;

        // GatePC: Drive PC onto Central Internal Bus
        this.internalBus.drive('PC', fetchPc);

        // LD_MAR: MAR latches from Central Bus
        this.latches.latchMAR(this.internalBus.read());

        cycleEvents.push(
          `[Clock ${cycleNum} | ${microOpName}] Central Internal Bus: GatePC=1 -> BUS <= PC (${fetchPc})`,
          `[Clock ${cycleNum} | ${microOpName}] Memory Address Register (MAR) <= BUS (${fetchPc}) (LD_MAR: ENABLED, driving external Address Bus)`,
          `[Clock ${cycleNum} | ${microOpName}] External Memory Bus: MemRead=1 asserted (Memory read cycle initiated)`
        );

        this.microStep = 2;
        break;
      }

      // -------------------------------------------------------------
      // CLOCK CYCLE 2: FETCH 2 (Memory Bus Read & MDR Latch)
      // -------------------------------------------------------------
      case 2: {
        microOpName = 'FETCH-2: Memory Read into MDR';

        // Memory Bus Interface performs read cycle: RAM[MAR] -> Data Bus -> MDR
        const rawInstruction = this.bus.readCycle(this.latches, true);
        this.currentInstruction.rawInstruction = rawInstruction;

        cycleEvents.push(
          `[Clock ${cycleNum} | ${microOpName}] External Memory Bus: Data Bus <= RAM[${this.latches.MAR}] (0b${rawInstruction.toString(2).padStart(16, '0')}) -> MDR <= 0x${rawInstruction.toString(16).padStart(4, '0').toUpperCase()}`
        );

        this.microStep = 3;
        break;
      }

      // -------------------------------------------------------------
      // CLOCK CYCLE 3: FETCH 3 (Drive MDR to IR & Increment PC)
      // -------------------------------------------------------------
      case 3: {
        microOpName = 'FETCH-3: Latch IR & Increment PC';

        // GateMDR: Drive MDR onto Central Internal Bus
        this.internalBus.drive('MDR', this.currentInstruction.rawInstruction);

        // LD_IR: IR latches from Central Internal Bus
        this.latches.latchIR(this.internalBus.read());

        // Increment PC
        const nextPc = (this.currentInstruction.fetchPc + 1) & ADDR_MAX;
        this.currentInstruction.nextPc = nextPc;
        this.latches.latchPC(nextPc);

        cycleEvents.push(
          `[Clock ${cycleNum} | ${microOpName}] Central Internal Bus: GateMDR=1 -> BUS <= MDR (0x${this.currentInstruction.rawInstruction.toString(16).padStart(4, '0').toUpperCase()})`,
          `[Clock ${cycleNum} | ${microOpName}] Instruction Register (IR) <= BUS (LD_IR: ENABLED, instruction word latched)`,
          `[Clock ${cycleNum} | ${microOpName}] Program Counter (PC) <= ${nextPc} (Incremented PC)`
        );

        // Record IF Stage packet
        this.stageRegisters.IF = {
          stage: 'IF',
          pc: this.currentInstruction.fetchPc,
          nextPc,
          rawInstruction: this.currentInstruction.rawInstruction,
          hardwareEvents: [...this.currentInstruction.hardwareEvents, ...cycleEvents],
        };

        this.microStep = 4;
        break;
      }

      // -------------------------------------------------------------
      // CLOCK CYCLE 4: DECODE & REGISTER READ
      // -------------------------------------------------------------
      case 4: {
        microOpName = 'DECODE: Unpack Fields & Read Registers';

        const decoded = InstructionDecoder.decode(this.currentInstruction.rawInstruction);
        const control = ControlUnit.generateSignals(decoded);
        this.currentInstruction.decoded = decoded;
        this.currentInstruction.control = control;

        let sr1Val = 0;
        let sr2Val = 0;

        if (decoded.sr1 !== undefined) {
          sr1Val = this.regFile.readPortA(decoded.sr1);
        }
        if (decoded.sr2 !== undefined && !decoded.immFlag) {
          sr2Val = this.regFile.readPortB(decoded.sr2);
        }
        this.currentInstruction.sr1Val = sr1Val;
        this.currentInstruction.sr2Val = sr2Val;

        const busGatesSummary = `GateALU=${control.GateALU ? 1 : 0}, GateMDR=${control.GateMDR ? 1 : 0}, LD_REG=${control.LD_REG ? 1 : 0}, LD_CC=${control.LD_CC ? 1 : 0}`;
        cycleEvents.push(
          `[Clock ${cycleNum} | ${microOpName}] Control Unit: RegWrite=${control.RegWrite ? 1 : 0}, ALUSrc=${control.ALUSrc}, MemRead=${control.MemRead ? 1 : 0}, ALUOp=${control.ALUOp}`,
          `[Clock ${cycleNum} | ${microOpName}] Control Unit Bus Gates: ${busGatesSummary}`
        );

        if (decoded.opcode === OPCODE.ADD) {
          cycleEvents.push(
            `[Clock ${cycleNum} | ${microOpName}] Register File (GPR): Read Port A <= R${decoded.sr1} (${sr1Val})`
          );
          if (decoded.immFlag) {
            const immStr = decoded.imm5 >= 0 ? `+${decoded.imm5}` : `${decoded.imm5}`;
            cycleEvents.push(
              `[Clock ${cycleNum} | ${microOpName}] Sign-Extension Unit (SEXT5): Imm5 <= ${immStr}`
            );
          } else {
            cycleEvents.push(
              `[Clock ${cycleNum} | ${microOpName}] Register File (GPR): Read Port B <= R${decoded.sr2} (${sr2Val})`
            );
          }
        } else if (decoded.opcode === OPCODE.LD) {
          const offsetStr = decoded.pcOffset9 >= 0 ? `+${decoded.pcOffset9}` : `${decoded.pcOffset9}`;
          cycleEvents.push(
            `[Clock ${cycleNum} | ${microOpName}] Sign-Extension Unit (SEXT9): PCoffset9 <= ${offsetStr}`
          );
        }

        this.stageRegisters.ID = {
          stage: 'ID',
          pc: this.currentInstruction.fetchPc,
          nextPc: this.currentInstruction.nextPc,
          rawInstruction: this.currentInstruction.rawInstruction,
          decoded,
          control,
          sr1Val,
          sr2Val,
          hardwareEvents: cycleEvents,
        };

        this.microStep = 5;
        break;
      }

      // -------------------------------------------------------------
      // CLOCK CYCLE 5: EXECUTE (ALU for ADD; Address Calc for LD)
      // -------------------------------------------------------------
      case 5: {
        const { decoded, control, sr1Val, sr2Val, nextPc } = this.currentInstruction;

        if (decoded.opcode === OPCODE.ADD) {
          microOpName = 'EXECUTE & WB: ALU Add & Register Write';
          const aluInputA = sr1Val;
          const aluInputB = control.ALUSrc === 'IMM' ? decoded.imm5 : sr2Val;
          const aluOutput = ALU.compute(aluInputA, aluInputB, control.ALUOp);
          this.currentInstruction.aluOutput = aluOutput;

          const immStr = decoded.imm5 >= 0 ? `+${decoded.imm5}` : `${decoded.imm5}`;
          const aluSrcDesc = decoded.immFlag
            ? `ALUSrc MUX <= SEXT5 Imm5 (${immStr})`
            : `ALUSrc MUX <= RegFile Port B (R${decoded.sr2} = ${sr2Val})`;

          cycleEvents.push(
            `[Clock ${cycleNum} | ${microOpName}] ${aluSrcDesc}`,
            `[Clock ${cycleNum} | ${microOpName}] ALU Execution: ${sr1Val} ${control.ALUOp} ${aluInputB} = ${aluOutput.result} (Flags: N=${aluOutput.flags.negative ? 1 : 0}, Z=${aluOutput.flags.zero ? 1 : 0}, P=${aluOutput.flags.positive ? 1 : 0})`
          );

          // External memory bus remains idle
          this.bus.readCycle(this.latches, false);
          cycleEvents.push(
            `[Clock ${cycleNum} | ${microOpName}] External Memory Bus: IDLE (MemRead=0, MemWrite=0)`
          );

          // Central Bus: GateALU drives ALU_Out
          const writeData = this.internalBus.drive('ALU', aluOutput.result);
          cycleEvents.push(
            `[Clock ${cycleNum} | ${microOpName}] Central Internal Bus: GateALU=1 -> BUS <= ALU_Out (${writeData})`
          );

          // Register File: LD_REG latches BUS
          const writeRecord = this.regFile.write(decoded.dr, writeData, control.LD_REG || control.RegWrite);
          cycleEvents.push(
            `[Clock ${cycleNum} | ${microOpName}] Register File (GPR): Write Port R${decoded.dr} <= BUS (${writeData}) (LD_REG: ENABLED)`
          );

          // PSR: LD_CC latches condition flags
          if (control.LD_CC || control.SetCC) {
            this.latches.latchPSR(aluOutput.flags.psrFlag);
            cycleEvents.push(
              `[Clock ${cycleNum} | ${microOpName}] PSR Latch <= 0b${this.latches.PSR.toString(2).padStart(3, '0')} (LD_CC: ENABLED, updated from ALU flags)`
            );
          }

          this.stageRegisters.EX = {
            ...this.stageRegisters.ID,
            stage: 'EX',
            aluInputA,
            aluInputB,
            aluOutput,
            effectiveAddress: null,
            hardwareEvents: cycleEvents,
          };

          this.stageRegisters.MEM = {
            ...this.stageRegisters.EX,
            stage: 'MEM',
            loadedValue: null,
            hardwareEvents: [],
          };

          this.stageRegisters.WB = {
            ...this.stageRegisters.MEM,
            stage: 'WB',
            writeData,
            writeRecord,
            hardwareEvents: cycleEvents,
          };

          instructionComplete = true;
          this.microStep = 0; // Instruction completed in 5 clock cycles
        } else if (decoded.opcode === OPCODE.LD) {
          microOpName = 'EXECUTE: Address Calculation & MAR Latch';
          const aluInputA = nextPc;
          const aluInputB = decoded.pcOffset9;
          const aluOutput = ALU.compute(aluInputA, aluInputB, control.ALUOp);
          const effectiveAddress = aluOutput.result;
          this.currentInstruction.effectiveAddress = effectiveAddress;

          const offsetStr = decoded.pcOffset9 >= 0 ? `+${decoded.pcOffset9}` : `${decoded.pcOffset9}`;
          cycleEvents.push(
            `[Clock ${cycleNum} | ${microOpName}] Address Adder: PC (${nextPc}) + Offset (${offsetStr}) -> Effective Address: ${effectiveAddress}`
          );

          // GateMARMUX: Drive Effective Address onto Central Internal Bus
          this.internalBus.drive('MARMUX', effectiveAddress);

          // LD_MAR: MAR latches from Central Internal Bus
          this.latches.latchMAR(this.internalBus.read());
          cycleEvents.push(
            `[Clock ${cycleNum} | ${microOpName}] Central Internal Bus: GateMARMUX=1 -> BUS <= ${effectiveAddress} -> LD_MAR=1 -> MAR <= BUS (${effectiveAddress})`,
            `[Clock ${cycleNum} | ${microOpName}] External Memory Bus: MemRead=1 asserted for address ${effectiveAddress}`
          );

          this.stageRegisters.EX = {
            ...this.stageRegisters.ID,
            stage: 'EX',
            aluInputA,
            aluInputB,
            aluOutput,
            effectiveAddress,
            hardwareEvents: cycleEvents,
          };

          this.microStep = 6; // Needs 1 more cycle for memory read & register write
        }
        break;
      }

      // -------------------------------------------------------------
      // CLOCK CYCLE 6: MEMORY READ & WRITE-BACK (for LD)
      // -------------------------------------------------------------
      case 6: {
        microOpName = 'MEMORY & WB: Read RAM & Latch Register';
        const { decoded, control, effectiveAddress } = this.currentInstruction;

        // External Memory Bus Interface read cycle: RAM[MAR] -> Data Bus -> MDR
        const loadedValue = this.bus.readCycle(this.latches, true);
        this.currentInstruction.loadedValue = loadedValue;

        cycleEvents.push(
          `[Clock ${cycleNum} | ${microOpName}] External Memory Bus: Read Cycle active (MemRead: ENABLED) -> Data Bus <= ${loadedValue} -> MDR <= ${loadedValue}`
        );

        // GateMDR: MDR drives Central Internal Bus
        const writeData = this.internalBus.drive('MDR', loadedValue);
        cycleEvents.push(
          `[Clock ${cycleNum} | ${microOpName}] Central Internal Bus: GateMDR=1 -> BUS <= MDR (${writeData})`
        );

        // Register File: LD_REG latches from Central Bus
        const writeRecord = this.regFile.write(decoded.dr, writeData, control.LD_REG || control.RegWrite);
        cycleEvents.push(
          `[Clock ${cycleNum} | ${microOpName}] Register File (GPR): Write Port R${decoded.dr} <= BUS (${writeData}) (LD_REG: ENABLED)`
        );

        // PSR: LD_CC latches condition flags evaluated from loaded data
        if (control.LD_CC || control.SetCC) {
          const flags = ALU.evaluateFlags(writeData);
          this.latches.latchPSR(flags.psrFlag);
          cycleEvents.push(
            `[Clock ${cycleNum} | ${microOpName}] PSR Latch <= 0b${this.latches.PSR.toString(2).padStart(3, '0')} (LD_CC: ENABLED, updated from BUS value ${writeData})`
          );
        }

        this.stageRegisters.MEM = {
          ...this.stageRegisters.EX,
          stage: 'MEM',
          loadedValue,
          hardwareEvents: cycleEvents,
        };

        this.stageRegisters.WB = {
          ...this.stageRegisters.MEM,
          stage: 'WB',
          writeData,
          writeRecord,
          hardwareEvents: cycleEvents,
        };

        instructionComplete = true;
        this.microStep = 0; // LD completes in 6 clock cycles
        break;
      }
    }

    // Accumulate hardware events and cycle record
    this.currentInstruction.hardwareEvents.push(...cycleEvents);
    const cycleRecord = {
      cycle: cycleNum,
      microOp: microOpName,
      microStep: this.microStep,
      instructionComplete,
      events: cycleEvents,
      busState: this.internalBus.describeState(),
      latches: this.latches.snapshot(),
      regFile: this.regFile.snapshot(),
    };
    this.currentInstruction.cycleRecords.push(cycleRecord);

    if (instructionComplete) {
      finishedInstructionData = this._buildFinishedInstructionData();
    }

    return {
      cycle: cycleNum,
      microOp: microOpName,
      instructionComplete,
      events: cycleEvents,
      cycleRecord,
      finishedInstructionData,
    };
  }

  _buildFinishedInstructionData() {
    const inst = this.currentInstruction;
    const mode = inst.decoded.immFlag ? 'IMMEDIATE' : 'REGISTER';
    const writeData = inst.control.GateMDR ? inst.loadedValue : (inst.aluOutput ? inst.aluOutput.result : 0);

    const execution = {
      mode,
      dr: inst.decoded.dr,
      sr1: inst.decoded.sr1,
      sr1Val: inst.sr1Val,
      sr2: inst.decoded.sr2,
      sr2Val: inst.sr2Val,
      imm5: inst.decoded.imm5,
      pcOffset9: inst.decoded.pcOffset9,
      effectiveAddress: inst.effectiveAddress,
      loadedValue: inst.loadedValue,
      result: inst.aluOutput ? inst.aluOutput.result : writeData,
      controlSignals: inst.control,
      aluOutput: inst.aluOutput,
      writeRecord: this.stageRegisters.WB ? this.stageRegisters.WB.writeRecord : null,
      hardwareEvents: inst.hardwareEvents,
      allHardwareEvents: inst.hardwareEvents,
      cycleRecords: inst.cycleRecords,
      cyclesTaken: inst.cycleRecords.length,
    };

    return {
      pc: inst.fetchPc,
      instruction: inst.rawInstruction,
      decoded: inst.decoded,
      controlSignals: inst.control,
      execution,
      stages: this.stageRegisters,
      internalBus: this.internalBus.lastTransaction,
      cyclesTaken: inst.cycleRecords.length,
      microCycles: inst.cycleRecords,
    };
  }

  /**
   * Orchestrates multi-cycle execution of a complete instruction (Macro-step).
   * Runs clock ticks until the current instruction completes.
   *
   * @returns {object|null} Completed instruction execution details
   */
  step() {
    if (this.vm.halted) {
      return null;
    }

    let tickResult = null;
    do {
      tickResult = this.tick();
      if (!tickResult) break;
    } while (!tickResult.instructionComplete && !this.vm.halted);

    if (!tickResult || !tickResult.finishedInstructionData) {
      return null;
    }

    return tickResult.finishedInstructionData;
  }

  executeInstruction() {
    return this.step();
  }

  // --- High-level phase methods for backward compatibility and testing ---

  phaseFetch() {
    const fetchPc = this.latches.PC;
    this.internalBus.drive('PC', fetchPc);
    this.latches.latchMAR(this.internalBus.read());
    const rawInstruction = this.bus.readCycle(this.latches, true);
    this.internalBus.drive('MDR', rawInstruction);
    this.latches.latchIR(this.internalBus.read());
    const nextPc = (fetchPc + 1) & ADDR_MAX;
    this.latches.latchPC(nextPc);

    const hardwareEvents = [
      `[IF Stage]  Central Internal Bus: GatePC=1 -> BUS <= PC (${fetchPc})`,
      `[IF Stage]  Memory Address Register (MAR) <= BUS (${fetchPc}) (LD_MAR: ENABLED, driving Address Bus)`,
      `[IF Stage]  Memory Bus Interface: Read Cycle active (MemRead: ENABLED) -> Data Bus <= 0b${rawInstruction.toString(2).padStart(16, '0')} -> MDR <= 0x${rawInstruction.toString(16).padStart(4, '0').toUpperCase()}`,
      `[IF Stage]  Central Internal Bus: GateMDR=1 -> BUS <= MDR (0x${rawInstruction.toString(16).padStart(4, '0').toUpperCase()})`,
      `[IF Stage]  Instruction Register (IR) <= BUS (LD_IR: ENABLED, instruction latched)`,
      `[IF Stage]  Program Counter (PC) <= ${nextPc} (Incremented PC)`,
    ];

    const ifPacket = {
      stage: 'IF',
      pc: fetchPc,
      nextPc,
      rawInstruction,
      hardwareEvents,
    };
    this.stageRegisters.IF = ifPacket;
    return ifPacket;
  }

  phaseDecode(ifStage = this.stageRegisters.IF) {
    const rawInstruction = ifStage ? ifStage.rawInstruction : this.latches.IR;
    const currentPc = ifStage ? ifStage.pc : this.latches.PC;
    const nextPc = ifStage ? ifStage.nextPc : (this.latches.PC + 1) & ADDR_MAX;

    const decoded = InstructionDecoder.decode(rawInstruction);
    const control = ControlUnit.generateSignals(decoded);

    let sr1Val = 0;
    let sr2Val = 0;
    if (decoded.sr1 !== undefined) {
      sr1Val = this.regFile.readPortA(decoded.sr1);
    }
    if (decoded.sr2 !== undefined && !decoded.immFlag) {
      sr2Val = this.regFile.readPortB(decoded.sr2);
    }

    const busGatesSummary = `GateALU=${control.GateALU ? 1 : 0}, GateMDR=${control.GateMDR ? 1 : 0}, LD_REG=${control.LD_REG ? 1 : 0}, LD_CC=${control.LD_CC ? 1 : 0}`;
    const hardwareEvents = [
      `[ID Stage]  Control Unit: RegWrite=${control.RegWrite ? 1 : 0}, ALUSrc=${control.ALUSrc}, MemRead=${control.MemRead ? 1 : 0}, MemWrite=${control.MemWrite ? 1 : 0}, ALUOp=${control.ALUOp}`,
      `[ID Stage]  Control Unit Bus Gates: ${busGatesSummary}`,
    ];

    if (decoded.opcode === OPCODE.ADD) {
      hardwareEvents.push(`[ID Stage]  Register File (GPR): Read Port A <= R${decoded.sr1} (${sr1Val})`);
      if (decoded.immFlag) {
        const immStr = decoded.imm5 >= 0 ? `+${decoded.imm5}` : `${decoded.imm5}`;
        hardwareEvents.push(`[ID Stage]  Sign-Extension Unit (SEXT5): Imm5 <= ${immStr}`);
      } else {
        hardwareEvents.push(`[ID Stage]  Register File (GPR): Read Port B <= R${decoded.sr2} (${sr2Val})`);
      }
    } else if (decoded.opcode === OPCODE.LD) {
      const offsetStr = decoded.pcOffset9 >= 0 ? `+${decoded.pcOffset9}` : `${decoded.pcOffset9}`;
      hardwareEvents.push(`[ID Stage]  Sign-Extension Unit (SEXT9): PCoffset9 <= ${offsetStr}`);
    }

    const idPacket = {
      stage: 'ID',
      pc: currentPc,
      nextPc,
      rawInstruction,
      decoded,
      control,
      sr1Val,
      sr2Val,
      hardwareEvents,
    };
    this.stageRegisters.ID = idPacket;
    return idPacket;
  }

  phaseExecute(idStage = this.stageRegisters.ID) {
    const { decoded, control, sr1Val, sr2Val, nextPc } = idStage;
    const hardwareEvents = [];

    let aluInputA = 0;
    let aluInputB = 0;
    let aluOutput = null;
    let effectiveAddress = null;

    if (decoded.opcode === OPCODE.ADD) {
      aluInputA = sr1Val;
      aluInputB = control.ALUSrc === 'IMM' ? decoded.imm5 : sr2Val;
      aluOutput = ALU.compute(aluInputA, aluInputB, control.ALUOp);

      const immStr = decoded.imm5 >= 0 ? `+${decoded.imm5}` : `${decoded.imm5}`;
      const aluSrcDesc = decoded.immFlag
        ? `ALUSrc MUX <= SEXT5 Imm5 (${immStr})`
        : `ALUSrc MUX <= RegFile Port B (R${decoded.sr2} = ${sr2Val})`;

      hardwareEvents.push(`[EX Stage]  ${aluSrcDesc}`);
      hardwareEvents.push(
        `[EX Stage]  ALU Execution: ${sr1Val} ${control.ALUOp} ${aluInputB} = ${aluOutput.result} (Flags: N=${aluOutput.flags.negative ? 1 : 0}, Z=${aluOutput.flags.zero ? 1 : 0}, P=${aluOutput.flags.positive ? 1 : 0})`
      );
    } else if (decoded.opcode === OPCODE.LD) {
      aluInputA = nextPc;
      aluInputB = decoded.pcOffset9;
      aluOutput = ALU.compute(aluInputA, aluInputB, control.ALUOp);
      effectiveAddress = aluOutput.result;

      const offsetStr = decoded.pcOffset9 >= 0 ? `+${decoded.pcOffset9}` : `${decoded.pcOffset9}`;
      hardwareEvents.push(
        `[EX Stage]  Address Adder: PC (${nextPc}) + Offset (${offsetStr}) -> Effective Address: ${effectiveAddress}`
      );
    }

    const exPacket = {
      ...idStage,
      stage: 'EX',
      aluInputA,
      aluInputB,
      aluOutput,
      effectiveAddress,
      hardwareEvents,
    };
    this.stageRegisters.EX = exPacket;
    return exPacket;
  }

  phaseMemory(exStage = this.stageRegisters.EX) {
    const { control, effectiveAddress } = exStage;
    const hardwareEvents = [];
    let loadedValue = null;

    if (control.MemRead) {
      this.internalBus.drive('MARMUX', effectiveAddress);
      this.latches.latchMAR(this.internalBus.read());
      hardwareEvents.push(
        `[MEM Stage] Central Internal Bus: GateMARMUX=1 -> BUS <= ${effectiveAddress} -> LD_MAR=1 -> MAR <= BUS (${effectiveAddress})`
      );

      loadedValue = this.bus.readCycle(this.latches, true);
      hardwareEvents.push(
        `[MEM Stage] Memory Bus Interface: Read Cycle active (MemRead: ENABLED) -> Data Bus <= ${loadedValue} -> MDR <= ${loadedValue}`
      );
    } else if (control.MemWrite) {
      this.internalBus.drive('MARMUX', effectiveAddress);
      this.latches.latchMAR(this.internalBus.read());
      hardwareEvents.push(
        `[MEM Stage] Central Internal Bus: GateMARMUX=1 -> BUS <= ${effectiveAddress} -> LD_MAR=1 -> MAR <= BUS (${effectiveAddress})`
      );
      this.bus.writeCycle(this.latches, true);
      hardwareEvents.push(
        `[MEM Stage] Memory Bus Interface: Write Cycle active (MemWrite: ENABLED) -> MDR <= ${this.latches.MDR} -> RAM[${effectiveAddress}]`
      );
    } else {
      this.bus.readCycle(this.latches, false);
      hardwareEvents.push(
        `[MEM Stage] Memory Bus Interface: IDLE (MemRead=0, MemWrite=0; Address and Data buses inactive)`
      );
    }

    const memPacket = {
      ...exStage,
      stage: 'MEM',
      loadedValue,
      hardwareEvents,
    };
    this.stageRegisters.MEM = memPacket;
    return memPacket;
  }

  phaseWriteBack(memStage = this.stageRegisters.MEM) {
    const { control, decoded, aluOutput } = memStage;
    const hardwareEvents = [];

    let writeData = 0;
    if (control.GateMDR) {
      writeData = this.internalBus.drive('MDR', this.latches.MDR);
      hardwareEvents.push(
        `[WB Stage]  Central Internal Bus: GateMDR=1 -> BUS <= MDR (${writeData})`
      );
    } else if (control.GateALU) {
      writeData = this.internalBus.drive('ALU', aluOutput.result);
      hardwareEvents.push(
        `[WB Stage]  Central Internal Bus: GateALU=1 -> BUS <= ALU_Out (${writeData})`
      );
    } else {
      writeData = control.MemToReg ? this.latches.MDR : (aluOutput ? aluOutput.result : 0);
      this.internalBus.drive('ALU', writeData);
    }

    const writeRecord = this.regFile.write(decoded.dr, writeData, control.LD_REG || control.RegWrite);
    hardwareEvents.push(
      `[WB Stage]  Register File (GPR): Write Port R${decoded.dr} <= BUS (${writeData}) (LD_REG: ENABLED)`
    );

    if (control.LD_CC || control.SetCC) {
      const flags = control.GateMDR ? ALU.evaluateFlags(writeData) : aluOutput.flags;
      this.latches.latchPSR(flags.psrFlag);
      hardwareEvents.push(
        `[WB Stage]  PSR Latch <= 0b${this.latches.PSR.toString(2).padStart(3, '0')} (LD_CC: ENABLED, updated from BUS value ${writeData})`
      );
    }

    const wbPacket = {
      ...memStage,
      stage: 'WB',
      writeData,
      writeRecord,
      hardwareEvents,
    };
    this.stageRegisters.WB = wbPacket;
    return wbPacket;
  }
}
