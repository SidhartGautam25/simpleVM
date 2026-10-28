// in version 1 , we only implement the ADD instruction, and we don't implement the run() and load() methods yet,
// so this VM is not very useful yet. But it is a start. In version 2, we will implement more instructions and 
// make the VM more useful.

// but we can still test the ADD instruction by manually loading instructions into memory and stepping through them.


import VM from './index.js';

var vm = new VM();

// manually place value in register  r1 and r2
vm.reg[1] = 5;
vm.reg[2] = 10;

// manually build ADD instruction , destination register is r0, source register 1 is r1, source register 2 is r2
var instruction = (0b0001 << 12) | (0b000 << 9) | (0b001 << 6) | (0b000 << 3) | (0b010);
vm.mem[0x3000] = instruction;

vm.step();
console.log(vm.reg[0]); // should print 15