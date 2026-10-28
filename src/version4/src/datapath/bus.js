/**
 * Stage 9: Shared Data Bus
 *
 * In physical computer systems, multiple components (registers, ALU, memory data)
 * connect to a shared communication path.
 *
 * Physical Rules:
 * 1. Tri-State Buffers: A component disconnects from the bus by entering a
 *    High-Impedance state (Hi-Z), allowing another component to drive it.
 * 2. Bus Contention: If two or more components drive contradictory voltage levels
 *    onto the bus simultaneously, short-circuit current flows, potentially destroying hardware.
 *
 * This module enforces single-driver discipline:
 * - If 0 drivers are active: Bus is floating (returns default 0 or undefined).
 * - If exactly 1 driver is active: Bus carries that driver's value.
 * - If >1 drivers are active: Throws a BusContentionError.
 */

import { intToBits } from '../logic/bit-utils.js';

export class BusContentionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BusContentionError';
  }
}

export class SharedBus {
  /**
   * @param {number} width - Bit width of the bus (e.g. 16)
   * @param {string} [name='BUS'] - Bus identifier
   */
  constructor(width = 16, name = 'BUS') {
    this.width = width;
    this.name = name;
    this.activeDrivers = [];
    this.currentBits = new Array(width).fill(0);
    this.currentValue = 0;
    this.isFloating = true;
  }

  /**
   * Resets bus for the start of an evaluation cycle.
   */
  clear() {
    this.activeDrivers = [];
    this.isFloating = true;
    this.currentValue = 0;
    this.currentBits.fill(0);
  }

  /**
   * Connects a driver to the bus.
   *
   * @param {string} driverName - Identifier of the driving component (e.g. 'ALU', 'MDR', 'REG_FILE')
   * @param {number[]|number} data - The bits or numeric word driven by this component
   * @param {number} enable - 1 if this driver's output buffer is active, 0 if Hi-Z
   */
  drive(driverName, data, enable = 1) {
    if (enable !== 1) return;

    this.activeDrivers.push({
      name: driverName,
      data: Array.isArray(data) ? data : intToBits(data, this.width),
    });

    if (this.activeDrivers.length > 1) {
      const names = this.activeDrivers.map((d) => d.name).join(', ');
      throw new BusContentionError(
        `Electrical Bus Contention detected on ${this.name}! Multiple components driving simultaneously: [${names}].`
      );
    }

    this.isFloating = false;
    this.currentBits = this.activeDrivers[0].data;
  }

  /**
   * Reads the current word on the bus.
   * @returns {number[]}
   */
  readBits() {
    return [...this.currentBits];
  }

  /**
   * Inspects the active bus state.
   */
  inspect() {
    if (this.isFloating) {
      return `${this.name}: [FLOATING / Hi-Z]`;
    }
    const driver = this.activeDrivers[0].name;
    const hex = '0x' + this.currentValue.toString(16).padStart(4, '0').toUpperCase();
    return `${this.name} driven by [${driver}]: ${hex}`;
  }
}

