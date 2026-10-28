/**
 * Stage 13: Memory Interface Registers (MAR & MDR)
 *
 * In physical computer systems, the CPU core connects to external memory chips
 * via dedicated interface registers:
 *
 * 1. Memory Address Register (MAR):
 *    Holds the 16-bit address for the current memory read or write cycle.
 *    Drives the external Address Bus.
 *
 * 2. Memory Data Register (MDR):
 *    Holds data being transferred between the internal CPU datapath and memory.
 *    - On a memory read: captures data arriving from RAM via external data bus.
 *    - On a memory write: drives data from the CPU datapath toward RAM.
 */

import { Register } from '../storage/register.js';

export class MemoryInterface {
  constructor(ram) {
    this.ram = ram;
    this.mar = new Register(16, 'MAR', 0);
    this.mdr = new Register(16, 'MDR', 0);
  }

  /**
   * Resets interface registers.
   */
  reset() {
    this.mar.forceValue(0);
    this.mdr.forceValue(0);
  }

  /**
   * Performs a Memory Read cycle through MAR and MDR.
   * 1. Reads word from RAM at address currently in MAR.
   * 2. Prepares MDR with the retrieved data.
   */
  stepRead() {
    const address = this.mar.readUint();
    const data = this.ram.read(address, 1);
    this.mdr.prepare(data, 1, 0);
  }

  /**
   * Performs a Memory Write cycle through MAR and MDR.
   * 1. Writes data currently in MDR into RAM at address currently in MAR.
   */
  stepWrite() {
    const address = this.mar.readUint();
    const data = this.mdr.readUint();
    this.ram.write(address, data, 1);
  }

  /**
   * Commits clocked state updates to MAR and MDR.
   */
  commit() {
    this.mar.commit();
    this.mdr.commit();
  }
}

