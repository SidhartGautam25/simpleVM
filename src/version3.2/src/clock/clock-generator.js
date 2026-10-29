/**
 * Clock Generator - Version 3.1
 *
 * Models a physical quartz crystal clock oscillator driving the CPU.
 *
 * Hardware Characteristics:
 * - Oscillates between LOW (0) and HIGH (1) voltage levels.
 * - State transitions and latch updates are synchronized to clock pulses (rising edges).
 * - Tracks total elapsed clock cycles (`cycleCount`) since CPU power-on/reset.
 * - Multi-Cycle Micro-Stepping:
 *   Instructions execute over multiple clock ticks rather than in a single atomic moment.
 */
export class ClockGenerator {
  constructor() {
    this.cycleCount = 0;
    this.signal = 0;
    this.phase = 'LOW';
  }

  /**
   * Resets the clock oscillator to cycle 0.
   */
  reset() {
    this.cycleCount = 0;
    this.signal = 0;
    this.phase = 'LOW';
  }

  /**
   * Pulses the clock by one full clock cycle (Rising edge -> High -> Falling edge -> Low).
   *
   * @returns {{ cycle: number, signal: number, phase: string }}
   */
  tick() {
    this.cycleCount++;
    this.signal = 1;
    this.phase = 'RISING';
    return {
      cycle: this.cycleCount,
      signal: this.signal,
      phase: this.phase,
    };
  }

  /**
   * Returns current cycle count.
   */
  get currentCycle() {
    return this.cycleCount;
  }
}

