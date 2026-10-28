/**
 * Stage 7: Edge-Triggered D Flip-Flop
 *
 * A positive-edge-triggered D flip-flop stores 1 bit of information.
 * Its output Q only changes on the rising edge (0 -> 1) of the clock signal.
 * Between clock edges, changes on the D input are ignored (data is held stable).
 *
 * Implements a deterministic two-phase model:
 * 1. prepare(d, enable, reset): samples inputs prior to clock edge.
 * 2. commit(): updates stored state on the active rising clock edge.
 */

import { validateSignal } from '../logic/signals.js';
import { not } from '../logic/gates.js';

export class DFlipFlop {
  constructor(initialQ = 0) {
    validateSignal(initialQ, 'initialQ');
    this.q = initialQ;
    this.nextQ = initialQ;
  }

  /**
   * Current stored output Q.
   */
  get output() {
    return this.q;
  }

  /**
   * Inverted output ¬Q.
   */
  get notOutput() {
    return not(this.q);
  }

  /**
   * Pre-edge evaluation phase:
   * Computes what the next state will be when the rising clock edge arrives.
   *
   * @param {number} d - Data input bit
   * @param {number} [enable=1] - Clock enable / Load signal
   * @param {number} [reset=0] - Synchronous reset
   */
  prepare(d, enable = 1, reset = 0) {
    validateSignal(d, 'D');
    validateSignal(enable, 'Enable');
    validateSignal(reset, 'Reset');

    if (reset === 1) {
      this.nextQ = 0;
    } else if (enable === 1) {
      this.nextQ = d;
    } else {
      this.nextQ = this.q; // Hold current state
    }
  }

  /**
   * Clock edge commit phase:
   * Transfers nextQ to stored q synchronously.
   */
  commit() {
    this.q = this.nextQ;
    return this.q;
  }
}

