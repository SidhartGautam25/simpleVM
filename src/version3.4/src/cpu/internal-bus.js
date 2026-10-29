import { toUint16 } from '../utils/bit-utils.js';
import { BUS_GATE, BUS_GATE_NAMES } from '../constants.js';

/**
 * Central Internal Datapath Bus with 3-to-8 Gate Decoder - Version 3.4
 *
 * Models the central 16-bit bidirectional CPU internal bus (BUS).
 *
 * Hardware Characteristics:
 * - Shared 16-bit Parallel Copper Trunk:
 *   Carries data words between internal CPU latches (PC, MAR, MDR, IR, PSR),
 *   the Register File (R0-R7), and the Arithmetic Logic Unit (ALU).
 * - 3-to-8 Line Binary Decoder:
 *   Because only ONE component may drive the bus at any given instant, the Control
 *   Unit outputs a 3-bit binary gate code (BUS_GATE: 000..100).
 *   A hardware 3-to-8 decoder decodes this code into exactly one active-high enable wire:
 *     • 000 (0): None (Bus floats in High-Impedance / Hi-Z)
 *     • 001 (1): GatePC (PC drives internal bus)
 *     • 010 (2): GateMDR (MDR drives internal bus)
 *     • 011 (3): GateALU (ALU output drives internal bus)
 *     • 100 (4): GateMARMUX (Address Adder drives internal bus)
 */
export class InternalBus {
  constructor() {
    this.value = 0;
    this.driver = 'NONE';
    this.gateCode = BUS_GATE.NONE;
    this.lastTransaction = {
      driver: 'NONE',
      gateCode: BUS_GATE.NONE,
      gateCodeBinary: '0b000',
      value: 0,
    };
  }

  /**
   * Resets the bus to high-impedance (floating) state.
   */
  reset() {
    this.value = 0;
    this.driver = 'NONE';
    this.gateCode = BUS_GATE.NONE;
    this.lastTransaction = {
      driver: 'NONE',
      gateCode: BUS_GATE.NONE,
      gateCodeBinary: '0b000',
      value: 0,
    };
  }

  /**
   * Hardware 3-to-8 Line Decoder Circuit:
   * Takes a 3-bit binary gate code and decodes it into 8 individual physical enable wires.
   *
   * @param {number} gateCode - 3-bit integer (0..7)
   * @returns {number[]} 8-element array where exactly one line is 1 (HIGH) and all others are 0 (LOW)
   */
  static decode3to8(gateCode) {
    const lines = new Array(8).fill(0);
    const code = gateCode & 0b111;
    lines[code] = 1;
    return lines;
  }

  /**
   * Drives a 16-bit value onto the central internal bus using the 3-bit Gate Selector Code.
   *
   * @param {number} gateCode - 3-bit BUS_GATE code (BUS_GATE.PC, BUS_GATE.ALU, etc.)
   * @param {number} val - 16-bit word to place on the bus
   * @returns {number} Value currently present on the bus
   */
  driveWithGate(gateCode, val) {
    if (gateCode < 0 || gateCode > 7) {
      throw new RangeError(`Internal Bus Error: Invalid 3-bit gate selector code ${gateCode}.`);
    }

    const decodedLines = InternalBus.decode3to8(gateCode);
    const driverName = BUS_GATE_NAMES[gateCode] || 'UNKNOWN';

    this.gateCode = gateCode;
    this.driver = driverName;
    this.value = toUint16(val);

    this.lastTransaction = {
      driver: driverName,
      gateCode,
      gateCodeBinary: `0b${gateCode.toString(2).padStart(3, '0')}`,
      decodedLines,
      value: this.value,
    };

    return this.value;
  }


  /**
   * Reads the current 16-bit value on the central bus.
   *
   * @returns {number}
   */
  read() {
    return this.value;
  }

  /**
   * Returns a descriptive string of the current bus state and gate selector code.
   *
   * @returns {string}
   */
  describeState() {
    if (this.driver === 'NONE' || !this.driver) {
      return 'Hi-Z (Floating / Disconnected) [Gate Code: 0b000]';
    }
    const gateBin = `0b${this.gateCode.toString(2).padStart(3, '0')}`;
    return `BUS <= ${this.driver} (${this.value}) [Gate Code: ${gateBin}]`;
  }
}
