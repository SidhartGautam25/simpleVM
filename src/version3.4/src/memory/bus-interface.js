import { ADDR_MAX } from '../constants.js';
import { toUint16 } from '../utils/bit-utils.js';
import { AddressDecoder } from './address-decoder.js';
import { SystemBus } from './system-bus.js';

/**
 * Memory Bus Interface - Version 3.4
 *
 * Coordinates the Unified 3-Part System Bus (AddressBus, DataBus, ControlBus)
 * and the Bus Address Decoder.
 *
 * Hardware Architecture:
 * - Address Bus (16-bit): Carries binary address from MAR.
 * - Data Bus (16-bit): Bidirectional wires carrying data words between RAM/MMIO and MDR.
 * - Control Bus: Physical 1-bit control wires (MEM_READ, MEM_WRITE, MEM_READY).
 * - Address Decoder: Decodes address lines into RAM_CS and IO_CS.
 */
export class MemoryBusInterface {
  /**
   * @param {number} [size=ADDR_MAX + 1] - Size of address space (65536 for 16-bit)
   */
  constructor(size = ADDR_MAX + 1) {
    this.size = size;
    this.ram = new Uint16Array(size);
    this.addressDecoder = new AddressDecoder(this.ram);
    this.systemBus = new SystemBus(this.addressDecoder);
    this.lastTransaction = null;
  }

  get addressBus() {
    return this.systemBus.addressBus;
  }

  get dataBus() {
    return this.systemBus.dataBus;
  }

  get controlBus() {
    return this.systemBus.controlBus;
  }

  /**
   * Performs an authentic Memory Read Cycle across Address, Data, and Control Buses.
   *
   * @param {Latches} latches - CPU latches containing MAR and MDR
   * @param {number|boolean} [memRead=1] - 1-bit control strobe from Control Unit
   * @returns {number|null} Data word latched into MDR
   */
  readCycle(latches, memRead = 1) {
    if (!memRead) {
      this.lastTransaction = { type: 'IDLE', memRead: 0, memWrite: 0 };
      return null;
    }

    const data = this.systemBus.readCycle(latches);
    this.lastTransaction = this.systemBus.lastTransaction;
    return data;
  }

  /**
   * Performs an authentic Memory Write Cycle across Address, Data, and Control Buses.
   *
   * @param {Latches} latches - CPU latches containing MAR and MDR
   * @param {number|boolean} [memWrite=1] - 1-bit control strobe from Control Unit
   * @returns {boolean} True if write completed
   */
  writeCycle(latches, memWrite = 1) {
    if (!memWrite) {
      this.lastTransaction = { type: 'IDLE', memRead: 0, memWrite: 0 };
      return false;
    }

    const result = this.systemBus.writeCycle(latches);
    this.lastTransaction = this.systemBus.lastTransaction;
    return result;
  }

  /**
   * Peripheral Simulation Helpers
   */
  typeChar(char) {
    return this.addressDecoder.typeChar(char);
  }

  queueInput(text) {
    return this.addressDecoder.queueInput(text);
  }

  getDisplayOutput() {
    return this.addressDecoder.getDisplayOutput();
  }

  clearDisplayOutput() {
    return this.addressDecoder.clearDisplayOutput();
  }

  /**
   * Direct programming / DMA loader used to populate RAM initially from an assembled program.
   *
   * @param {Array<{ address: number, value: number }>} entries
   */
  loadEntries(entries) {
    for (const { address, value } of entries) {
      if (address < 0 || address >= this.size) {
        throw new RangeError(`ROM/DMA Load Address ${address} exceeds bounds [0..${this.size - 1}].`);
      }
      this.ram[address] = toUint16(value);
    }
  }

  /**
   * Resets all RAM memory locations, MMIO device registers, and system buses.
   */
  reset() {
    this.ram.fill(0);
    this.addressDecoder.reset();
    this.systemBus.reset();
    this.lastTransaction = null;
  }

  /**
   * Non-intrusive memory inspection for testing.
   *
   * @param {number} address
   * @returns {number}
   */
  inspect(address) {
    if (address >= 0 && address < this.ram.length) {
      return this.ram[address];
    }
    return 0;
  }
}
