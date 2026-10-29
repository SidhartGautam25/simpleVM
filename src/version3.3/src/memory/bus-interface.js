import { ADDR_MAX } from '../constants.js';
import { toUint16 } from '../utils/bit-utils.js';
import { AddressDecoder } from './address-decoder.js';

/**
 * Memory Bus Interface with Address Decoder & MMIO - Version 3.3
 *
 * Mediates all communication between the CPU core, physical RAM, and hardware device registers.
 *
 * Hardware Characteristics:
 * - Address Bus (16-bit): Driven exclusively by the Memory Address Register (MAR).
 *   Monitored in real-time by the internal Address Decoder.
 * - Data Bus (16-bit): Bidirectional. Transmits data from RAM/MMIO -> MDR during reads,
 *   or from MDR -> RAM/MMIO during writes.
 * - Control Lines:
 *     • MemRead  (1-bit): Strobed HIGH by Control Unit to read word at MAR into MDR.
 *     • MemWrite (1-bit): Strobed HIGH by Control Unit to write word in MDR into target at MAR.
 * - Address Decoder:
 *     • 0x0000 - 0xFDFF: Routes transactions to physical RAM (asserts RAM_CS).
 *     • 0xFE00 - 0xFFFF: Routes transactions to Hardware Device Registers (asserts IO_CS):
 *         0xFE00 (KBSR), 0xFE02 (KBDR), 0xFE04 (DSR), 0xFE06 (DDR).
 *
 * No CPU component is permitted to access RAM or peripherals directly.
 * All interactions are strictly mediated through MAR, MDR, and the bus control lines.
 */
export class MemoryBusInterface {
  /**
   * @param {number} [size=ADDR_MAX + 1] - Size of address space (65536 for 16-bit)
   */
  constructor(size = ADDR_MAX + 1) {
    this.size = size;
    this.ram = new Uint16Array(size);
    this.addressDecoder = new AddressDecoder(this.ram);
    this.lastTransaction = null;
  }

  /**
   * Performs a Memory Read Bus Cycle.
   *
   * Hardware Steps:
   * 1. Checks that the MemRead control wire is asserted HIGH.
   * 2. Reads the 16-bit address from the MAR latch (driving the Address Bus).
   * 3. The Address Decoder evaluates the address and asserts RAM_CS or IO_CS.
   * 4. Fetches the data word from physical RAM or the active MMIO Device Register.
   * 5. Latches the word into the MDR latch via the Data Bus.
   *
   * @param {Latches} latches - CPU latches containing MAR and MDR
   * @param {boolean} [memRead=true] - Control wire signal from Control Unit
   * @returns {number|null} The data word latched into MDR, or null if MemRead is inactive
   */
  readCycle(latches, memRead = true) {
    if (!memRead) {
      this.lastTransaction = { type: 'IDLE', memRead: false, memWrite: false };
      return null;
    }

    const address = latches.MAR;
    if (address < 0 || address >= this.size) {
      throw new RangeError(
        `Address Bus Error: MAR address ${address} is out of bounds [0..${this.size - 1}].`
      );
    }

    const decodeInfo = this.addressDecoder.decode(address);
    const data = this.addressDecoder.read(address, latches);

    this.lastTransaction = {
      type: 'READ',
      address,
      data,
      memRead: true,
      memWrite: false,
      target: decodeInfo.target,
      deviceName: decodeInfo.deviceName,
      ramChipSelect: decodeInfo.ramChipSelect,
      deviceChipSelect: decodeInfo.deviceChipSelect,
      description: decodeInfo.description,
    };

    return data;
  }

  /**
   * Performs a Memory Write Bus Cycle.
   *
   * Hardware Steps:
   * 1. Checks that the MemWrite control wire is asserted HIGH.
   * 2. Reads the 16-bit address from MAR (driving the Address Bus).
   * 3. Reads the 16-bit data from MDR (driving the Data Bus).
   * 4. The Address Decoder asserts RAM_CS or IO_CS and routes the write.
   * 5. Stores into RAM or triggers hardware peripheral side effects (e.g., DDR display output).
   *
   * @param {Latches} latches - CPU latches containing MAR and MDR
   * @param {boolean} [memWrite=true] - Control wire signal from Control Unit
   * @returns {boolean} True if the write succeeded, false if MemWrite is inactive
   */
  writeCycle(latches, memWrite = true) {
    if (!memWrite) {
      this.lastTransaction = { type: 'IDLE', memRead: false, memWrite: false };
      return false;
    }

    const address = latches.MAR;
    if (address < 0 || address >= this.size) {
      throw new RangeError(
        `Address Bus Error: MAR address ${address} is out of bounds [0..${this.size - 1}].`
      );
    }

    const data = toUint16(latches.MDR);
    const decodeInfo = this.addressDecoder.decode(address);
    this.addressDecoder.write(address, data, latches);

    this.lastTransaction = {
      type: 'WRITE',
      address,
      data,
      memRead: false,
      memWrite: true,
      target: decodeInfo.target,
      deviceName: decodeInfo.deviceName,
      ramChipSelect: decodeInfo.ramChipSelect,
      deviceChipSelect: decodeInfo.deviceChipSelect,
      description: decodeInfo.description,
    };

    return true;
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
   * Models flashing ROM / loading binary image into RAM before CPU starts running.
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
   * Resets all RAM memory locations and MMIO device registers.
   */
  reset() {
    this.ram.fill(0);
    this.addressDecoder.reset();
    this.lastTransaction = null;
  }

  /**
   * Non-intrusive memory inspection for unit testing and debugging.
   * Does not trigger bus cycles or modify latches.
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
