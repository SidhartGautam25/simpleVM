/**
 * Stage 7 & 8: Clock Generator & Synchronous Coordinator
 *
 * Models an explicit digital square-wave clock signal.
 * Distinguishes:
 *   - Clock State: LOW (0) or HIGH (1)
 *   - Transitions: RISING_EDGE (0 -> 1) or FALLING_EDGE (1 -> 0)
 *   - Cycle count
 *
 * Rule 5: A clock cycle is not "execute the entire instruction".
 * In our multicycle CPU, each clock cycle advances one micro-architectural phase
 * (Fetch, Decode, Execute, Memory, Writeback).
 */

import { validateSignal } from '../logic/signals.js';

export const CLOCK_EDGE = {
  NONE: 'NONE',
  RISING: 'RISING',
  FALLING: 'FALLING',
};

export class Clock {
  constructor() {
    this.state = 0; // Starts LOW
    this.cycleCount = 0;
    this.lastTransition = CLOCK_EDGE.NONE;
  }

  /**
   * Resets the clock to initial LOW state.
   */
  reset() {
    this.state = 0;
    this.cycleCount = 0;
    this.lastTransition = CLOCK_EDGE.NONE;
  }

  /**
   * Toggles the clock state:
   * 0 -> 1 (Rising Edge)
   * 1 -> 0 (Falling Edge, completes 1 full cycle)
   *
   * @returns {string} The edge that just occurred (RISING or FALLING).
   */
  tick() {
    if (this.state === 0) {
      this.state = 1;
      this.lastTransition = CLOCK_EDGE.RISING;
    } else {
      this.state = 0;
      this.lastTransition = CLOCK_EDGE.FALLING;
      this.cycleCount++;
    }
    return this.lastTransition;
  }

  /**
   * Performs one full clock cycle (Rising edge followed by Falling edge).
   */
  stepCycle() {
    this.tick(); // 0 -> 1 (Rising)
    this.tick(); // 1 -> 0 (Falling)
    return this.cycleCount;
  }
}

