# Stage 1: Binary Signals and Fundamental Logic Gates

## 1. Overview & Architectural Role

Digital computers operate on binary information. In physical hardware, information is represented not as numbers or abstract symbols, but as electrical potentials (voltages) transmitted across conductive traces and semiconductor channels.

In our educational CPU implementation (**Version 3**), we adhere strictly to the foundational rule:
> **Rule 1**: Logic gates must operate on binary signals represented strictly as `0` (LOW) and `1` (HIGH).
> Combinational components compute outputs directly from their current inputs without hidden internal state.

Silently treating JavaScript values such as `true`, `false`, `2`, `"1"`, `null`, or `undefined` as digital signals introduces insidious bugs. In physical circuits, floating lines or incorrect voltage levels lead to signal degradation, bus contention, or undefined gate states. We mirror this physical reality by strictly validating all digital inputs before evaluation.

---

## 2. Gate Catalog & Theoretical Analysis

### 2.1 NOT Gate (Inverter)

- **Boolean Expression**:
  $$Y = \neg A = \overline{A}$$
- **Truth Table**:
  | Input $A$ | Output $Y$ |
  | :---: | :---: |
  | 0 | 1 |
  | 1 | 0 |
- **Implementation**:
  ```javascript
  export function not(a) {
    validateSignal(a, 'A');
    return a === 0 ? 1 : 0;
  }
  ```
- **Transistor Construction (CMOS)**:
  - Consists of **2 transistors**:
    - 1 PMOS transistor connecting the output node $Y$ to $V_{DD}$ (Pull-Up Network).
    - 1 NMOS transistor connecting the output node $Y$ to Ground / $V_{SS}$ (Pull-Down Network).
  - When $A = 0$ (0V), the PMOS conducts and the NMOS is open; $Y$ is pulled up to $V_{DD}$ (1).
  - When $A = 1$ ($V_{DD}$), the NMOS conducts and the PMOS is open; $Y$ is pulled down to Ground (0).
- **Role in Later Circuits**:
  - Inverts control lines (active-low signals).
  - Used in subtractors to perform two's complement ($A - B = A + \overline{B} + 1$).
  - Forms bistable feedback loops in SR latches and cross-coupled inverters (static RAM cells).

---

### 2.2 AND Gate

- **Boolean Expression**:
  $$Y = A \cdot B$$
- **Truth Table**:
  | Input $A$ | Input $B$ | Output $Y$ |
  | :---: | :---: | :---: |
  | 0 | 0 | 0 |
  | 0 | 1 | 0 |
  | 1 | 0 | 0 |
  | 1 | 1 | 1 |
- **Implementation**:
  ```javascript
  export function and(a, b) {
    validateSignal(a, 'A');
    validateSignal(b, 'B');
    return a === 1 && b === 1 ? 1 : 0;
  }
  ```
- **Transistor Construction (CMOS)**:
  - In CMOS, non-inverting gates are not primitive! An AND gate is built by taking a **NAND gate** (4 transistors) and appending a **NOT gate / inverter** (2 transistors), requiring **6 transistors** in total.
- **Role in Later Circuits**:
  - Carry generation in Half Adders ($Carry = A \cdot B$).
  - Masking and bitwise AND in the ALU.
  - Enable qualification: gating clock signals or write enables into registers.

---

### 2.3 OR Gate

- **Boolean Expression**:
  $$Y = A + B$$
- **Truth Table**:
  | Input $A$ | Input $B$ | Output $Y$ |
  | :---: | :---: | :---: |
  | 0 | 0 | 0 |
  | 0 | 1 | 1 |
  | 1 | 0 | 1 |
  | 1 | 1 | 1 |
- **Implementation**:
  ```javascript
  export function or(a, b) {
    validateSignal(a, 'A');
    validateSignal(b, 'B');
    return a === 1 || b === 1 ? 1 : 0;
  }
  ```
- **Transistor Construction (CMOS)**:
  - In CMOS, an OR gate is built by taking a **NOR gate** (4 transistors) followed by an **inverter** (2 transistors), requiring **6 transistors** in total.
- **Role in Later Circuits**:
  - Carry combination in Full Adders ($CarryOut = C_1 + C_2$).
  - Bitwise OR operations in the ALU.
  - Bus multiplexing and combining active condition signals.

---

### 2.4 NAND Gate (Universal Gate)

- **Boolean Expression**:
  $$Y = \overline{A \cdot B} = \neg (A \cdot B)$$
- **Truth Table**:
  | Input $A$ | Input $B$ | Output $Y$ |
  | :---: | :---: | :---: |
  | 0 | 0 | 1 |
  | 0 | 1 | 1 |
  | 1 | 0 | 1 |
  | 1 | 1 | 0 |
- **Implementation**:
  ```javascript
  export function nand(a, b) {
    validateSignal(a, 'A');
    validateSignal(b, 'B');
    return a === 1 && b === 1 ? 0 : 1;
  }
  ```
- **Transistor Construction (CMOS)**:
  - Uses only **4 transistors**:
    - **Pull-Up Network**: Two PMOS transistors connected in **parallel** between $V_{DD}$ and output $Y$. If either $A=0$ or $B=0$, at least one PMOS conducts, pulling $Y$ to 1.
    - **Pull-Down Network**: Two NMOS transistors connected in **series** between output $Y$ and Ground. Only when *both* $A=1$ and $B=1$ do both NMOS conduct, pulling $Y$ to 0.
- **Role in Later Circuits**:
  - Functionally complete (universal): *any* digital circuit (adders, decoders, memory latches) can be synthesized purely from NAND gates.
  - Building block for NAND-based SR latches, D latches, and Master-Slave flip-flops.

---

### 2.5 NOR Gate (Universal Gate)

- **Boolean Expression**:
  $$Y = \overline{A + B} = \neg (A + B)$$
- **Truth Table**:
  | Input $A$ | Input $B$ | Output $Y$ |
  | :---: | :---: | :---: |
  | 0 | 0 | 1 |
  | 0 | 1 | 0 |
  | 1 | 0 | 0 |
  | 1 | 1 | 0 |
- **Implementation**:
  ```javascript
  export function nor(a, b) {
    validateSignal(a, 'A');
    validateSignal(b, 'B');
    return a === 0 && b === 0 ? 1 : 0;
  }
  ```
- **Transistor Construction (CMOS)**:
  - Uses **4 transistors**:
    - **Pull-Up Network**: Two PMOS transistors in **series** between $V_{DD}$ and $Y$. Output is HIGH only when *both* $A=0$ and $B=0$.
    - **Pull-Down Network**: Two NMOS transistors in **parallel** between $Y$ and Ground. If either $A=1$ or $B=1$, the output is pulled LOW.
- **Role in Later Circuits**:
  - Functionally complete (universal).
  - Foundation of NOR-based SR latches (used in Stage 6 to demonstrate bistable storage).
  - Zero-flag detection logic in the ALU (NOR-ing all result bits produces 1 iff all bits are 0).

---

### 2.6 XOR Gate (Exclusive OR)

- **Boolean Expression**:
  $$Y = A \oplus B = (A \cdot \overline{B}) + (\overline{A} \cdot B)$$
- **Truth Table**:
  | Input $A$ | Input $B$ | Output $Y$ |
  | :---: | :---: | :---: |
  | 0 | 0 | 0 |
  | 0 | 1 | 1 |
  | 1 | 0 | 1 |
  | 1 | 1 | 0 |
- **Implementation**:
  ```javascript
  export function xor(a, b) {
    validateSignal(a, 'A');
    validateSignal(b, 'B');
    return a !== b ? 1 : 0;
  }
  ```
- **Transistor Construction (CMOS)**:
  - In gate-level logic, built from 4 NAND gates or 2 inverters + 2 ANDs + 1 OR (~16 transistors).
  - In optimized CMOS transmission-gate logic, built using **8 to 12 transistors**.
- **Role in Later Circuits**:
  - The fundamental core of binary addition: in a Half Adder, $SUM = A \oplus B$.
  - In Full Adders: $SUM = A \oplus B \oplus C_{in}$.
  - Programmable inversion in adders/subtractors (controlled invert: $B \oplus Sub$ inverts $B$ when $Sub = 1$).
  - Parity checking and overflow detection.

---

## 3. Physical Hardware vs. Logical Simulation

It is crucial to understand where our software simulation models physical reality and where it abstracts:

| Property | Physical Electronics (CMOS Silicon) | Our Software Simulation (Version 3) |
| :--- | :--- | :--- |
| **Signal Domain** | Continuous analog voltages (e.g. 0.0V to 3.3V / 1.2V). Threshold voltages ($V_{IH}, V_{IL}$) determine high/low interpretation. | Discrete binary integers: strictly `0` or `1`. Validated at runtime on every gate input. |
| **Propagation Delay** | Physical time required for electrons to charge load capacitances ($t_{pd} \approx 10\text{ ps} - 5\text{ ns}$). | Zero algorithmic delay in combinational functions; outputs evaluate instantaneously upon invocation. |
| **Inversion Naturalness** | Inverting gates (NAND, NOR, NOT) are smaller and faster than non-inverting gates (AND, OR). | Abstracted at the gate level, but documented and accounted for in architectural analysis. |
| **Electrical Loading** | High fan-out degrades rise/fall times and voltage levels. | Any gate output variable can be passed to multiple functions without electrical attenuation. |
| **Bistable Storage** | Emerges from continuous electronic feedback and regenerative gain. | Implemented via explicit synchronous clocking and state commitment models. |

---

## 4. Verification & Testing

Every gate is verified against its formal mathematical specification:
1. **Exhaustive Truth Table Coverage**: 100% of all possible input combinations ($2^1$ for 1-input gates, $2^2$ for 2-input gates) are tested with strict equality assertions (`assert.strictEqual`).
2. **Type and Boundary Enforcement**: Non-binary values (`-1`, `2`, `0.5`, `NaN`, `true`, `false`, `"0"`, `null`, `undefined`) are explicitly asserted to throw informative `TypeError` messages.
3. **Automated Truth Table Inspection**: The `generateTruthTable` utility enables programmatic extraction and verification of gate response vectors.

