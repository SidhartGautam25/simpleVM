import {
  RAM_START,
  RAM_END,
  MMIO_START,
  MMIO_END,
  DEV_ADDR,
  DEV_NAMES,
  READY_BIT,
  ADDR_MAX,
} from '../constants.js';
import { toUint16 } from '../utils/bit-utils.js';

/**
 * Address Decoder & Memory-Mapped I/O (MMIO) Controller - Version 3.3
 *
 * In real computer hardware, CPUs do not possess high-level "console.log" instructions.
 * Instead, communication with external hardware peripherals (keyboard, display, serial ports)
 * is achieved using Memory-Mapped I/O (MMIO).
 *
 * The physical Memory Address Bus driven by the MAR (Memory Address Register) is monitored
 * by the Address Decoder circuit. Based on the binary address placed on the bus:
 *   - Range 0x0000 - 0xFDFF (0 to 65023):
 *       Asserts RAM_CS (RAM Chip Select).
 *       Routes memory read/write cycles directly to physical dynamic RAM chips.
 *   - Range 0xFE00 - 0xFFFF (65024 to 65535):
 *       Asserts IO_CS (Device Chip Select).
 *       Routes memory read/write cycles to Hardware Device Registers:
 *         • 0xFE00 (KBSR): Keyboard Status Register (Bit 15 = Ready bit)
 *         • 0xFE02 (KBDR): Keyboard Data Register (Bits 7..0 = ASCII character)
 *         • 0xFE04 (DSR) : Display Status Register (Bit 15 = Ready bit)
 *         • 0xFE06 (DDR) : Display Data Register (Bits 7..0 = Character to output)
 *
 * Hardware Side Effects:
 *   - Reading KBDR: Automatically clears the ready bit (bit 15) in KBSR to 0.
 *   - Writing DDR : Automatically transmits the character to the physical display screen buffer.
 */
export class AddressDecoder {
  /**
   * @param {Uint16Array} [ramArray=null] - Physical RAM storage buffer
   */
  constructor(ramArray = null) {
    this.ram = ramArray || new Uint16Array(ADDR_MAX + 1);

    // Hardware Device Registers (16-bit)
    this.kbsr = 0x0000; // Keyboard Status Register (Initial: not ready)
    this.kbdr = 0x0000; // Keyboard Data Register
    this.dsr = READY_BIT; // Display Status Register (Initial: ready = 0x8000)
    this.ddr = 0x0000; // Display Data Register

    // Simulated Peripheral Buffers
    this.keyboardQueue = [];
    this.displayBuffer = [];
    this.hardwareEvents = [];
    this.lastDecode = null;
  }

  /**
   * Decodes a 16-bit address on the address bus and generates chip select control signals.
   *
   * @param {number} address - 16-bit address from MAR
   * @returns {object} Decoding metadata including chip select lines
   */
  decode(address) {
    if (address < 0 || address > ADDR_MAX) {
      throw new RangeError(
        `Address Bus Error: Address 0x${address.toString(16)} (${address}) is out of 16-bit range [0x0000..0xFFFF].`
      );
    }

    if (address >= RAM_START && address <= RAM_END) {
      const result = {
        target: 'RAM',
        ramChipSelect: true,
        deviceChipSelect: false,
        deviceName: null,
        address,
        addressHex: `0x${address.toString(16).padStart(4, '0').toUpperCase()}`,
        description: `Physical RAM [0x${address.toString(16).padStart(4, '0').toUpperCase()}] (Range: 0x0000-0xFDFF)`,
      };
      this.lastDecode = result;
      return result;
    }

    if (address >= MMIO_START && address <= MMIO_END) {
      const deviceName = DEV_NAMES[address] || 'RESERVED_DEVICE';
      const result = {
        target: 'DEVICE',
        ramChipSelect: false,
        deviceChipSelect: true,
        deviceName,
        address,
        addressHex: `0x${address.toString(16).padStart(4, '0').toUpperCase()}`,
        description: `Hardware Device Register: ${deviceName} [0x${address.toString(16).padStart(4, '0').toUpperCase()}] (Range: 0xFE00-0xFFFF)`,
      };
      this.lastDecode = result;
      return result;
    }

    throw new RangeError(`Address Decoder Error: Unmapped address ${address}`);
  }

  /**
   * Performs a bus read operation mediated by the address decoder.
   *
   * @param {number} address - 16-bit address from MAR
   * @param {Latches} [latches=null] - CPU latches to update MDR
   * @returns {number} 16-bit word fetched from RAM or Device Register
   */
  read(address, latches = null) {
    const decoded = this.decode(address);
    let data = 0;
    const events = [];

    if (decoded.target === 'RAM') {
      data = this.ram[address];
      events.push(
        `[Address Decoder] Address 0x${address.toString(16).padStart(4, '0').toUpperCase()} in RAM range [0x0000-0xFDFF] -> Assert RAM_CS -> Fetch RAM[${address}] = ${data}`
      );
    } else {
      // Memory-Mapped I/O Device Register read
      events.push(
        `[Address Decoder] Address 0x${address.toString(16).padStart(4, '0').toUpperCase()} in MMIO range [0xFE00-0xFFFF] -> Assert IO_CS -> Route to ${decoded.deviceName}`
      );

      switch (address) {
        case DEV_ADDR.KBSR: {
          data = this.kbsr;
          const isReady = (this.kbsr & READY_BIT) !== 0;
          events.push(
            `[MMIO Keyboard Status (KBSR)] Polled 0xFE00 -> Value: 0x${data.toString(16).padStart(4, '0').toUpperCase()} (Ready Bit 15: ${isReady ? '1 [KEY_PENDING]' : '0 [IDLE]'})`
          );
          break;
        }

        case DEV_ADDR.KBDR: {
          data = this.kbdr;
          const char = (data >= 32 && data <= 126) ? String.fromCharCode(data) : 'NUL';
          events.push(
            `[MMIO Keyboard Data (KBDR)] Read 0xFE02 -> Received ASCII ${data} ('${char}')`
          );

          // HARDWARE SIDE EFFECT: Reading KBDR clears KBSR ready bit
          const prevKbsr = this.kbsr;
          this.kbsr &= ~READY_BIT;
          events.push(
            `[MMIO Hardware Side Effect] KBSR Ready Bit 15 cleared (0x${prevKbsr.toString(16)} -> 0x${this.kbsr.toString(16)})`
          );

          // If there are more queued keys, advance to the next key
          if (this.keyboardQueue.length > 0) {
            const nextKey = this.keyboardQueue.shift();
            this.kbdr = nextKey.charCodeAt(0) & 0xFF;
            this.kbsr |= READY_BIT;
            events.push(
              `[MMIO Keyboard Queue] Advanced next key '${nextKey}' into KBDR (Ready bit re-asserted)`
            );
          }
          break;
        }

        case DEV_ADDR.DSR: {
          data = this.dsr;
          const isReady = (this.dsr & READY_BIT) !== 0;
          events.push(
            `[MMIO Display Status (DSR)] Polled 0xFE04 -> Value: 0x${data.toString(16).padStart(4, '0').toUpperCase()} (Ready Bit 15: ${isReady ? '1 [DISPLAY_READY]' : '0 [BUSY]'})`
          );
          break;
        }

        case DEV_ADDR.DDR: {
          data = this.ddr;
          events.push(
            `[MMIO Display Data (DDR)] Read 0xFE06 -> Value: 0x${data.toString(16).padStart(4, '0').toUpperCase()}`
          );
          break;
        }

        default: {
          data = 0x0000;
          events.push(
            `[MMIO Unmapped Register] Read 0x${address.toString(16).padStart(4, '0').toUpperCase()} -> 0x0000`
          );
          break;
        }
      }
    }

    if (latches && typeof latches.latchMDR === 'function') {
      latches.latchMDR(data);
    }

    this.hardwareEvents.push(...events);
    return data;
  }

  /**
   * Performs a bus write operation mediated by the address decoder.
   *
   * @param {number} address - 16-bit address from MAR
   * @param {number} data - 16-bit word from MDR
   * @param {Latches} [latches=null] - CPU latches
   * @returns {boolean} True if write succeeded
   */
  write(address, data, latches = null) {
    const decoded = this.decode(address);
    const dataUint16 = toUint16(data);
    const events = [];

    if (decoded.target === 'RAM') {
      this.ram[address] = dataUint16;
      events.push(
        `[Address Decoder] Address 0x${address.toString(16).padStart(4, '0').toUpperCase()} in RAM range [0x0000-0xFDFF] -> Assert RAM_CS -> Store RAM[${address}] <= ${dataUint16}`
      );
    } else {
      // Memory-Mapped I/O Device Register write
      events.push(
        `[Address Decoder] Address 0x${address.toString(16).padStart(4, '0').toUpperCase()} in MMIO range [0xFE00-0xFFFF] -> Assert IO_CS -> Route Write to ${decoded.deviceName}`
      );

      switch (address) {
        case DEV_ADDR.KBSR: {
          this.kbsr = dataUint16;
          events.push(
            `[MMIO Keyboard Status (KBSR)] Stored 0x${dataUint16.toString(16).padStart(4, '0').toUpperCase()}`
          );
          break;
        }

        case DEV_ADDR.KBDR: {
          this.kbdr = dataUint16 & 0xFF;
          events.push(
            `[MMIO Keyboard Data (KBDR)] Stored 0x${this.kbdr.toString(16).padStart(4, '0').toUpperCase()}`
          );
          break;
        }

        case DEV_ADDR.DSR: {
          this.dsr = dataUint16;
          events.push(
            `[MMIO Display Status (DSR)] Stored 0x${dataUint16.toString(16).padStart(4, '0').toUpperCase()}`
          );
          break;
        }

        case DEV_ADDR.DDR: {
          this.ddr = dataUint16 & 0xFF;
          const char = String.fromCharCode(this.ddr);
          this.displayBuffer.push(char);

          // HARDWARE SIDE EFFECT: Writing to DDR transmits the character to display screen
          events.push(
            `[MMIO Display Output] Transmitted char '${char}' (ASCII: ${this.ddr}) to physical display screen! [Buffer: "${this.displayBuffer.join('')}"]`
          );
          break;
        }

        default: {
          events.push(
            `[MMIO Unmapped Register] Ignored write to 0x${address.toString(16).padStart(4, '0').toUpperCase()}`
          );
          break;
        }
      }
    }

    this.hardwareEvents.push(...events);
    return true;
  }

  /**
   * Simulates a user typing a key on the physical keyboard.
   * Sets KBDR to the character's ASCII code and asserts the KBSR Ready Bit (Bit 15).
   *
   * @param {string} char - Single character
   */
  typeChar(char) {
    if (typeof char !== 'string' || char.length === 0) {
      return;
    }

    const firstChar = char[0];
    const ascii = firstChar.charCodeAt(0) & 0xFF;

    if ((this.kbsr & READY_BIT) === 0) {
      // Keyboard is idle: directly load into KBDR and assert ready bit
      this.kbdr = ascii;
      this.kbsr |= READY_BIT;
      this.hardwareEvents.push(
        `[Keyboard Hardware Peripheral] User pressed key '${firstChar}' (ASCII ${ascii}) -> KBDR <= 0x${ascii.toString(16)}, KBSR Ready Bit 15 asserted (0x8000)`
      );
    } else {
      // Keyboard already holds an unread key: queue subsequent keys in hardware buffer
      this.keyboardQueue.push(firstChar);
      this.hardwareEvents.push(
        `[Keyboard Hardware Peripheral] Key '${firstChar}' queued in keyboard hardware buffer (Waiting for CPU to read KBDR)`
      );
    }
  }

  /**
   * Queues an entire string of user keyboard inputs into the keyboard buffer.
   *
   * @param {string} text - String of characters
   */
  queueInput(text) {
    if (typeof text !== 'string') return;
    for (const char of text) {
      this.typeChar(char);
    }
  }

  /**
   * Returns the accumulated text output transmitted to the physical display via DDR.
   *
   * @returns {string}
   */
  getDisplayOutput() {
    return this.displayBuffer.join('');
  }

  /**
   * Clears the display output buffer.
   */
  clearDisplayOutput() {
    this.displayBuffer = [];
  }

  /**
   * Resets all MMIO registers and buffers to power-on defaults.
   */
  reset() {
    this.kbsr = 0x0000;
    this.kbdr = 0x0000;
    this.dsr = READY_BIT;
    this.ddr = 0x0000;
    this.keyboardQueue = [];
    this.displayBuffer = [];
    this.hardwareEvents = [];
    this.lastDecode = null;
  }

  /**
   * Returns a snapshot of the Address Decoder and MMIO device registers.
   *
   * @returns {object}
   */
  snapshot() {
    return {
      kbsr: this.kbsr,
      kbsrReady: (this.kbsr & READY_BIT) !== 0,
      kbdr: this.kbdr,
      kbdrChar: this.kbdr > 0 ? String.fromCharCode(this.kbdr) : null,
      dsr: this.dsr,
      dsrReady: (this.dsr & READY_BIT) !== 0,
      ddr: this.ddr,
      ddrChar: this.ddr > 0 ? String.fromCharCode(this.ddr) : null,
      displayOutput: this.getDisplayOutput(),
      pendingKeyCount: this.keyboardQueue.length,
      lastDecode: this.lastDecode,
    };
  }
}

