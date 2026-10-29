import { ADDR_MAX } from '../constants.js';
import { toUint16 } from '../utils/bit-utils.js';

/**
 * Memory Bus Interface - Version 2.3
 *
 * Mediates all communication between the CPU core and RAM.
 *
 * Hardware Characteristics:
 * - Address Bus (16-bit): Driven exclusively by the Memory Address Register (MAR).
 * - Data Bus (16-bit): Bidirectional. Transmits data from RAM -> MDR during reads,
 *   or from MDR -> RAM during writes.
 * - Control Lines:
 *     • MemRead  (1-bit): Strobed HIGH by Control Unit to read word at MAR into MDR.
 *     • MemWrite (1-bit): Strobed HIGH by Control Unit to write word in MDR into RAM at MAR.
 *
 * No CPU component is permitted to access RAM directly. All interactions are
 * strictly conducted through MAR, MDR, and the control lines.
 */
export class MemoryBusInterface {
  /**
   * @param {number} [size=ADDR_MAX + 1] - Size of address space (65536 for 16-bit)
   */
  constructor(size = ADDR_MAX + 1) {
    this.size = size;
    this.ram = new Uint16Array(size);
    this.lastTransaction = null;
  }

  /**
   * Performs a Memory Read Bus Cycle.
   *
   * Hardware Steps:
   * 1. Checks that the MemRead control wire is asserted HIGH.
   * 2. Reads the 16-bit address from the MAR latch (driving the Address Bus).
   * 3. Fetches the data word from RAM at that address.
   * 4. Latches the word into the MDR latch via the Data Bus.
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

    const data = this.ram[address];
    latches.latchMDR(data);

    this.lastTransaction = {
      type: 'READ',
      address,
      data,
      memRead: true,
      memWrite: false,
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
   * 4. Stores the data into RAM at the specified address.
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

    const data = latches.MDR;
    this.ram[address] = toUint16(data);

    this.lastTransaction = {
      type: 'WRITE',
      address,
      data: toUint16(data),
      memRead: false,
      memWrite: true,
    };

    return true;
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
   * Resets all RAM memory locations to 0x0000.
   */
  reset() {
    this.ram.fill(0);
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
    return this.ram[address];
  }
}

