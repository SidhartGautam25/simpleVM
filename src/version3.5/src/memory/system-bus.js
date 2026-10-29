import { ADDR_MAX, SIGNAL_LOW, SIGNAL_HIGH } from '../constants.js';
import { toUint16 } from '../utils/bit-utils.js';

/**
 * 16-bit Parallel Physical Address Bus
 *
 * Consists of 16 copper traces (A15..A0) driven exclusively by the
 * Memory Address Register (MAR) and monitored by the Address Decoder.
 */
export class AddressBus {
  constructor() {
    this.lines = 0; // 16-bit numerical voltage word
  }

  /**
   * Drives a 16-bit address onto the address bus wires.
   *
   * @param {number} address - 16-bit address
   * @returns {number} The driven address
   */
  drive(address) {
    if (address < 0 || address > ADDR_MAX) {
      throw new RangeError(`Address Bus Voltage Error: 0x${address.toString(16)} exceeds 16-bit limits.`);
    }
    this.lines = toUint16(address);
    return this.lines;
  }

  /**
   * Reads the active 16-bit address from the bus wires.
   *
   * @returns {number}
   */
  read() {
    return this.lines;
  }

  /**
   * Formats the active binary lines for debugging.
   */
  describe() {
    return `0x${this.lines.toString(16).padStart(4, '0').toUpperCase()} (0b${this.lines.toString(2).padStart(16, '0')})`;
  }
}

/**
 * 16-bit Parallel Bidirectional Data Bus
 *
 * Consists of 16 copper traces (D15..D0). Driven by RAM or MMIO devices during
 * read cycles, or driven by the Memory Data Register (MDR) during write cycles.
 */
export class DataBus {
  constructor() {
    this.lines = 0;
    this.driver = 'FLOAT'; // 'FLOAT' (Hi-Z), 'MDR', 'RAM', 'DEVICE'
  }

  /**
   * Drives a 16-bit word onto the data bus wires.
   *
   * @param {string} source - Source component driving the bus
   * @param {number} data - 16-bit data value
   * @returns {number}
   */
  drive(source, data) {
    this.lines = toUint16(data);
    this.driver = source;
    return this.lines;
  }

  /**
   * Reads the active 16-bit word on the data bus wires.
   *
   * @returns {number}
   */
  read() {
    return this.lines;
  }

  /**
   * Disconnects drivers, returning bus to High-Impedance (Hi-Z).
   */
  float() {
    this.lines = 0;
    this.driver = 'FLOAT';
  }

  /**
   * Formats the active data bus state.
   */
  describe() {
    if (this.driver === 'FLOAT') {
      return 'Hi-Z (Floating / Disconnected)';
    }
    return `Data <= ${this.driver} (0x${this.lines.toString(16).padStart(4, '0').toUpperCase()} / ${this.lines})`;
  }
}

/**
 * Physical System Control Bus
 *
 * Unlike Address and Data buses which carry 16-bit numerical values,
 * the Control Bus is a collection of INDIVIDUAL 1-BIT WIRES.
 * Each wire carries 0 Volts (SIGNAL_LOW = 0) or 3.3 Volts (SIGNAL_HIGH = 1).
 */
export class ControlBus {
  constructor() {
    this.lines = {
      MEM_READ: SIGNAL_LOW,  // 1-bit wire: CPU strobes HIGH to request read
      MEM_WRITE: SIGNAL_LOW, // 1-bit wire: CPU strobes HIGH to request write
      MEM_READY: SIGNAL_LOW, // 1-bit wire: Memory strobes HIGH when cycle is complete
    };
  }

  assertRead() {
    this.lines.MEM_READ = SIGNAL_HIGH;
  }

  deassertRead() {
    this.lines.MEM_READ = SIGNAL_LOW;
  }

  assertWrite() {
    this.lines.MEM_WRITE = SIGNAL_HIGH;
  }

  deassertWrite() {
    this.lines.MEM_WRITE = SIGNAL_LOW;
  }

  setReady(val = SIGNAL_HIGH) {
    this.lines.MEM_READY = val ? SIGNAL_HIGH : SIGNAL_LOW;
  }

  clear() {
    this.lines.MEM_READ = SIGNAL_LOW;
    this.lines.MEM_WRITE = SIGNAL_LOW;
    this.lines.MEM_READY = SIGNAL_LOW;
  }

  describe() {
    return `MEM_READ=${this.lines.MEM_READ}  MEM_WRITE=${this.lines.MEM_WRITE}  MEM_READY=${this.lines.MEM_READY}`;
  }
}

/**
 * Unified 3-Part System Bus (AddressBus, DataBus, ControlBus)
 *
 * Physically links the CPU Core (MAR, MDR) with the Bus Address Decoder,
 * Physical RAM chips, and MMIO Device Registers.
 */
export class SystemBus {
  /**
   * @param {AddressDecoder} addressDecoder
   */
  constructor(addressDecoder) {
    this.addressDecoder = addressDecoder;
    this.addressBus = new AddressBus();
    this.dataBus = new DataBus();
    this.controlBus = new ControlBus();
    this.lastTransaction = null;
  }

  /**
   * Executes a physical Memory Read Cycle across all three buses:
   * 1. Assert MEM_READ = 1 on Control Bus.
   * 2. MAR drives address onto Address Bus (16-bit).
   * 3. Address Decoder inspects Address Bus, asserts RAM_CS or IO_CS.
   * 4. Target chip drives data word onto Data Bus (16-bit).
   * 5. Target chip asserts MEM_READY = 1 on Control Bus.
   * 6. MDR captures data from Data Bus.
   * 7. Control Bus deasserts and Data Bus floats.
   *
   * @param {Latches} latches - CPU latches (MAR, MDR)
   * @returns {number} Word read into MDR
   */
  readCycle(latches) {
    // 1. Control Bus: Strobe MEM_READ = 1
    this.controlBus.assertRead();

    // 2. Address Bus: Drive MAR onto 16-bit address bus
    const address = this.addressBus.drive(latches.MAR);

    // 3. Address Decoder: Decode address lines into chip select signals
    const decodeInfo = this.addressDecoder.decode(address);

    // 4. Target Device: Fetch data and drive onto 16-bit Data Bus
    const data = this.addressDecoder.read(address, latches);
    this.dataBus.drive(decodeInfo.target === 'RAM' ? 'RAM' : decodeInfo.deviceName, data);

    // 5. Control Bus: Signal memory ready
    this.controlBus.setReady(SIGNAL_HIGH);

    const transaction = {
      type: 'READ',
      address,
      data,
      addressBusDesc: this.addressBus.describe(),
      dataBusDesc: this.dataBus.describe(),
      controlBusDesc: this.controlBus.describe(),
      target: decodeInfo.target,
      deviceName: decodeInfo.deviceName,
      ramChipSelect: decodeInfo.ramChipSelect ? 1 : 0,
      deviceChipSelect: decodeInfo.deviceChipSelect ? 1 : 0,
      description: decodeInfo.description,
    };
    this.lastTransaction = transaction;

    // 6. Reset Control lines and float Data bus
    this.controlBus.clear();
    this.dataBus.float();

    return data;
  }

  /**
   * Executes a physical Memory Write Cycle across all three buses:
   * 1. Assert MEM_WRITE = 1 on Control Bus.
   * 2. MAR drives target address onto Address Bus (16-bit).
   * 3. MDR drives data word onto Data Bus (16-bit).
   * 4. Address Decoder asserts RAM_CS or IO_CS.
   * 5. Target chip stores data from Data Bus or triggers MMIO peripheral action.
   * 6. Target asserts MEM_READY = 1.
   * 7. Buses return to idle.
   *
   * @param {Latches} latches - CPU latches (MAR, MDR)
   * @returns {boolean} True if write completed
   */
  writeCycle(latches) {
    // 1. Control Bus: Strobe MEM_WRITE = 1
    this.controlBus.assertWrite();

    // 2. Address Bus: Drive address from MAR
    const address = this.addressBus.drive(latches.MAR);

    // 3. Data Bus: Drive data from MDR
    const data = this.dataBus.drive('MDR', latches.MDR);

    // 4. Address Decoder: Route write to RAM or MMIO device
    const decodeInfo = this.addressDecoder.decode(address);
    this.addressDecoder.write(address, data, latches);

    // 5. Control Bus: Set ready
    this.controlBus.setReady(SIGNAL_HIGH);

    const transaction = {
      type: 'WRITE',
      address,
      data,
      addressBusDesc: this.addressBus.describe(),
      dataBusDesc: this.dataBus.describe(),
      controlBusDesc: this.controlBus.describe(),
      target: decodeInfo.target,
      deviceName: decodeInfo.deviceName,
      ramChipSelect: decodeInfo.ramChipSelect ? 1 : 0,
      deviceChipSelect: decodeInfo.deviceChipSelect ? 1 : 0,
      description: decodeInfo.description,
    };
    this.lastTransaction = transaction;

    // 6. Reset Control lines and float Data bus
    this.controlBus.clear();
    this.dataBus.float();

    return true;
  }

  /**
   * Resets all three physical buses.
   */
  reset() {
    this.addressBus.drive(0);
    this.dataBus.float();
    this.controlBus.clear();
    this.lastTransaction = null;
  }
}

