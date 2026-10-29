import { toUint16 } from '../utils/bit-utils.js';

/**
 * Central Internal Datapath Bus - Version 3.0
 *
 * Models the central 16-bit bidirectional CPU internal bus (BUS).
 *
 * Hardware Characteristics:
 * - Physical Shared 16-bit Trunk:
 *   Connects all CPU storage elements (PC, MAR, MDR, IR, RegisterFile, PSR)
 *   and execution units (ALU, Address Adder).
 * - Tri-State Gating (One-Hot Driver Rule):
 *   Multiple components can read from the bus simultaneously, but only ONE
 *   component may drive the bus at any given instant.
 * - Tri-State Drivers:
 *   • GatePC     : PC drives BUS
 *   • GateMDR    : MDR drives BUS
 *   • GateALU    : ALU output drives BUS
 *   • GateMARMUX : Calculated effective address drives BUS
 * - Destination Load Enables:
 *   • LD_MAR : MAR latches BUS value
 *   • LD_MDR : MDR latches BUS value (during stores)
 *   • LD_IR  : IR latches BUS value
 *   • LD_REG : RegisterFile[DR] latches BUS value
 *   • LD_CC  : PSR latches condition codes evaluated from BUS value
 */
export class InternalBus {
  constructor() {
    this.value = 0;
    this.driver = null;
    this.lastTransaction = { driver: 'NONE', value: 0 };
  }

  /**
   * Resets the bus to high-impedance (floating) state.
   */
  reset() {
    this.value = 0;
    this.driver = null;
    this.lastTransaction = { driver: 'NONE', value: 0 };
  }

  /**
   * Drives a 16-bit value onto the central internal bus via a tri-state buffer.
   *
   * @param {string} sourceName - Driver name ('PC', 'MDR', 'ALU', 'MARMUX')
   * @param {number} val - 16-bit word to drive onto the bus
   * @returns {number} Value currently present on the bus
   */
  drive(sourceName, val) {
    this.driver = sourceName;
    this.value = toUint16(val);
    this.lastTransaction = {
      driver: sourceName,
      value: this.value,
    };
    return this.value;
  }

  /**
   * Reads the current word floating on the central internal bus.
   *
   * @returns {number} 16-bit bus value
   */
  read() {
    return this.value;
  }

  /**
   * Releases the bus (enters high-impedance / floating state).
   */
  float() {
    this.driver = null;
  }

  /**
   * Returns a human-readable snapshot of the bus state.
   */
  describeState() {
    if (!this.driver) {
      return 'BUS: High-Z (Floating)';
    }
    return `BUS <= ${this.driver} (${this.value})`;
  }
}

