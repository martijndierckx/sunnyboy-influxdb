"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModbusConnection = void 0;
const tslib_1 = require("tslib");
const ModBusRegisters_1 = require("./ModBusRegisters");
const Modbus = (0, tslib_1.__importStar)(require("jsmodbus"));
const net_1 = require("net");
class ModbusConnection {
    constructor() {
        this.conn = null;
    }
    static async connect(config) {
        return new Promise((resolve) => {
            const modbusConn = new ModbusConnection();
            modbusConn.socket = new net_1.Socket();
            modbusConn.conn = new Modbus.client.TCP(modbusConn.socket, config.slaveId, 3000);
            modbusConn.socket.on('connect', () => {
                resolve(modbusConn);
            });
            modbusConn.socket.on('end', () => {
                modbusConn.conn = null;
            });
            modbusConn.socket.connect(config);
        });
    }
    async disconnect() {
        this.socket.end(() => {
            return;
        });
    }
    get isConnected() {
        return this.conn !== null;
    }
    async getRegister(address) {
        const register = await this.getRegisterRange(address, 1);
        if (register == null)
            return null;
        return register[address];
    }
    async getRegisterRanges(ranges) {
        const registers = {};
        for (const range of ranges) {
            Object.assign(registers, await this.getRegisterRange(range.startParam, range.quantity));
        }
        return new ModBusRegisters_1.ModbusRegisters(registers);
    }
    async getRegisterRange(startParam, quantity) {
        let res;
        try {
            res = await this.conn.readInputRegisters((startParam - 1) * 2, quantity * 2);
        }
        catch (e) {
            console.log(e);
            return null;
        }
        if (res.response && res.response.body && !res.response.body.isException && res.response.body.byteCount > 0) {
            const data = {};
            for (const [i, val] of res.response.body.values.entries()) {
                let buf = Buffer.allocUnsafe(2);
                buf.writeUInt16BE(val);
                data[(startParam - 1) * 2 + i] = buf;
            }
            return data;
        }
        throw Error(`Failed retrieving register range ${startParam} + ${(startParam - 1) * 2 + quantity}`);
    }
}
exports.ModbusConnection = ModbusConnection;
//# sourceMappingURL=ModBusConnection.js.map