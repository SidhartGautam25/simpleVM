// max value of a 16 bit address
var ADDR_MAX = 0xFFFF;

// we have 10 registers, 0-7 are general purpose, 8 is PC, 9 is PSR
var REG_PC = 8;
var REG_PSR = 9;
var REG_COUNT = 10;

// PSR flags
// last result was negative, zero, or positive
var FLAG_NEGATIVE = 0b100;
var FLAG_ZERO = 0b010;
var FLAG_POSITIVE = 0b001;
// to check if the number is negative or not -> num & SIGN_BIT ( if result is negative, it will be true, else false)
var SIGN_BIT = 1 << 15;


function signExtend(num, bits) {
  var signBit = 1 << (bits - 1);
  return (num & signBit) ? (num | (~0 << bits)) : num;
}

function signFlag(num) {
  if (num & SIGN_BIT) {
    return FLAG_NEGATIVE;
  } else if (num === 0) {
    return FLAG_ZERO;
  } else {
    return FLAG_POSITIVE;
  }
}




export default function VM(){
    this.reset();

}


VM.prototype.reset = function(){
    this.mem = new Uint16Array(ADDR_MAX + 1);
    this.reg = new Uint16Array(REG_COUNT);
    this.reg[REG_PC] = 0x3000; // default starting address
    this.reg[REG_PSR] = FLAG_ZERO; // default PSR value
}
VM.prototype.run = function(){}
VM.prototype.step = function(){
    var instruction = this.mem[this.reg[REG_PC]];
    this.reg[REG_PC]++;
    this.perform(instruction);
}
VM.prototype.load = function(){}
VM.prototype.setCC = function(register){
    // our vm need to remember was the last result negative, zero, or positive
    // because instructions like BR(BRANCH), we need to know if the last result was negative, zero, or positive
    // and so after computing the result of an instruction, we need to set the PSR(Processor Status Register) to
    // remember the last result
    this.reg[REG_PSR] = signFlag(this.reg[register]);
}
VM.prototype.perform=function(instruction){
    var opcode = instruction >> 12;
    if(opcode === 0b0001){ // ADD
        // destination register
        var dr = (instruction >> 9) & 0b111;
        // source register 1
        var sr1 = (instruction >> 6) & 0b111;
        var immFlag = (instruction >> 5) & 0b1;

        if(immFlag){
            // immediate mode
            var imm5 = signExtend(instruction & 0b11111, 5);
            this.reg[dr] = (this.reg[sr1] + imm5) & ADDR_MAX;
        }else{
            // register mode
            var sr2 = instruction & 0b111;
            this.reg[dr] = (this.reg[sr1] + this.reg[sr2]) & ADDR_MAX;
        }

        this.setCC(dr);
    }
}
