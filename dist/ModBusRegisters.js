"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModbusRegisters = void 0;
class ModbusRegisters {
    constructor(registers) {
        this.registers = null;
        this.registers = registers;
    }
    get16BitFloatVal(param) {
        try {
            const address = (param - 1) * 2;
            const buffer = Buffer.concat([this.registers[address], this.registers[address + 1]]);
            return +buffer.readFloatBE().toFixed(3);
        }
        catch (e) { }
        return 0;
    }
}
exports.ModbusRegisters = ModbusRegisters;
//# sourceMappingURL=ModBusRegisters.js.map