# Version 3: Educational Computer from Logic Gates to Working CPU

A complete, working, educational computer system built strictly from the ground up: from digital logic gates to a clocked, multicycle central processing unit.

Unlike standard instruction set emulators, this project models physical digital architecture:
- Operations emerge from logic gates, full adders, multiplexers, and clocked registers.
- Arithmetic is performed by binary adder circuits, not JavaScript arithmetic operators (`+`, `-`).
- The CPU advances on explicit clock edges and sequences instructions across multiple discrete micro-architectural phases (Fetch, Decode, Execute, Memory, Writeback).

---

## Directory Structure (`src/version3`)

```
src/version3/
├── README.md
├── docs/
│   └── stage1-gates.md            # Stage 1: Signals, gates, truth tables, and CMOS principles
├── src/
│   ├── logic/
│   │   ├── signals.js             # Signal validation (0 = LOW, 1 = HIGH)
│   │   ├── gates.js               # Primitive gates: NOT, AND, OR, NAND, NOR, XOR
│   │   ├── bit-utils.js           # Conversion between integers and bit arrays, sign extension
│   │   ├── half-adder.js          # Stage 2: Half Adder (XOR + AND)
│   │   ├── full-adder.js          # Stage 3: Full Adder (2 Half Adders + OR)
│   │   ├── adder.js               # Stage 4: 16-Bit Ripple-Carry Adder
│   │   ├── subtractor.js          # Stage 4: Universal Adder/Subtractor (Two's Complement)
│   │   ├── mux.js                 # Stage 5: 2:1, 4:1, and N-bit Multiplexers
│   │   └── decoder.js             # Stage 5: 2:4 and 3:8 Decoders
│   ├── storage/
│   │   ├── clock.js               # Stage 7: Square-wave clock (LOW, HIGH, Rising, Falling)
│   │   ├── d-flip-flop.js         # Stage 7: Edge-triggered D flip-flop (Two-phase commit)
│   │   └── register.js            # Stage 8: 16-bit Synchronous Register with load enable
│   ├── datapath/
│   │   ├── bus.js                 # Stage 9: Shared Bus with Contention Detection
│   │   ├── register-file.js       # Stage 10: 8 General Registers (R0..R7) with dual read ports
│   │   └── alu.js                 # Stage 11: 16-Bit Gate-based ALU with NZP condition flags
│   ├── memory/
│   │   ├── ram.js                 # Stage 12: 64K Word-addressable Main Memory
│   │   └── memory-interface.js    # Stage 13: MAR & MDR Interface Registers
│   ├── cpu/
│   │   ├── instruction-set.js     # Stage 15: LC-3 ISA Opcodes & PSR Flags
│   │   ├── instruction-decoder.js # Stage 16: Bit-level field extraction
│   │   ├── control-unit.js        # Stage 17 & 23: Multicycle FSM Controller
│   │   └── cpu.js                 # Stage 22 & 23: Clocked CPU datapath coordinator
│   ├── assembler/
│   │   └── assembler.js           # Stage 24: Two-pass assembler (Labels, .FILL, .ORIG)
│   └── examples/
│       ├── run-arithmetic.js      # Example A: Gate-level addition (5 + 3 = 8)
│       ├── run-memory.js          # Example B: Store & Load via MAR and MDR
│       └── run-loop.js            # Example C: Loop accumulation (Sum 1..5 = 15) with BRp
└── test/
    ├── logic/
    │   ├── signals.test.js
    │   └── gates.test.js
    └── integration/
        └── cpu.test.js            # End-to-end integration tests for programs A, B, and C
```

---

## Completed Architecture Stages

- [x] **Stage 1**: Binary Signals & Primitive Logic Gates (`NOT`, `AND`, `OR`, `NAND`, `NOR`, `XOR`).
- [x] **Stage 2**: Half Adder (`halfAdder` via `xor` and `and`).
- [x] **Stage 3**: Full Adder (`fullAdder` via two Half Adders and an `or` gate).
- [x] **Stage 4**: Multi-Bit Ripple-Carry Adder & Universal Subtractor with signed overflow and zero detection.
- [x] **Stage 5**: Multiplexers (2:1, 4:1, 16-bit word) and Decoders (3:8 register address decoder).
- [x] **Stage 7 & 8**: Clock generator, Edge-triggered D flip-flop, and 16-bit synchronous Registers with load enable.
- [x] **Stage 9**: Shared Bus with single-driver enforcement and electrical contention detection.
- [x] **Stage 10**: Multi-port Register File (R0..R7) with dual read ports and decoded write port.
- [x] **Stage 11**: 16-Bit Arithmetic Logic Unit (ALU) using gate-level adder/subtractor and logic gates.
- [x] **Stage 12 & 13**: Main Memory (64K RAM) and Memory Interface Registers (MAR, MDR).
- [x] **Stage 15 & 16**: Instruction Set Architecture (LC-3 style) and Instruction Decoder.
- [x] **Stage 17, 22, 23**: Multicycle Control Unit FSM (FETCH_1 -> FETCH_2 -> FETCH_3 -> DECODE -> EXECUTE -> MEM_READ -> MEM_WRITE -> WRITEBACK).
- [x] **Stage 24**: Two-Pass Assembler supporting instructions, labels, `.ORIG`, and `.FILL`.
- [x] **Stage 25**: Working, runnable assembly programs with clock-by-clock hardware tracing.

---

## Working Examples You Can Check and Run

### 1. Example A: Gate-Level Arithmetic Addition ($5 + 3 = 8$)
Executes `ADD R0, R1, R2` where $5 + 3$ is calculated by the 16-bit gate-based ripple-carry adder:
```powershell
node src/version3/src/examples/run-arithmetic.js
# or via npm script:
npm.cmd run example:arithmetic
```

### 2. Example B: Memory Store & Load via MAR and MDR
Demonstrates memory communication: stores `42` into memory variable `DATA` using `ST`, then loads it into `R2` using `LD` through MAR and MDR:
```powershell
node src/version3/src/examples/run-memory.js
# or via npm script:
npm.cmd run example:memory
```

### 3. Example C: Conditional Branching & Looping (Sum 1..5 = 15)
Computes the sum of numbers $1 + 2 + 3 + 4 + 5 = 15$ in a loop using `ADD R1, R1, #-1` and conditional branch `BRp LOOP`:
```powershell
node src/version3/src/examples/run-loop.js
# or via npm script:
npm.cmd run example:loop
```

### 4. Run the Full Test Suite
Runs all 29 unit and integration tests across digital logic, signals, and end-to-end CPU execution:
```powershell
npm.cmd test
```
