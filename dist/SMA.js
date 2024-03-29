"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SMA = exports.Strings = exports.Phases = exports.Protocol = void 0;
const tslib_1 = require("tslib");
const axios_1 = tslib_1.__importDefault(require("axios"));
const https_1 = require("https");
var Protocol;
(function (Protocol) {
    Protocol["Https"] = "https";
    Protocol["Http"] = "http";
})(Protocol = exports.Protocol || (exports.Protocol = {}));
var Phases;
(function (Phases) {
    Phases[Phases["One"] = 1] = "One";
    Phases[Phases["Three"] = 3] = "Three";
})(Phases = exports.Phases || (exports.Phases = {}));
var Strings;
(function (Strings) {
    Strings[Strings["One"] = 1] = "One";
    Strings[Strings["Two"] = 2] = "Two";
    Strings[Strings["Three"] = 3] = "Three";
})(Strings = exports.Strings || (exports.Strings = {}));
class SMA {
    constructor(opts) {
        this.host = opts.host;
        this.password = opts.password;
        this.protocol = opts.forceHttp ? Protocol.Http : Protocol.Https;
        this.strings = opts.strings;
        this.phases = opts.phases;
        this.defaultHeaders = {
            Origin: `${this.protocol}://${this.host}`
        };
        if (this.protocol == Protocol.Https) {
            this.agent = new https_1.Agent({
                rejectUnauthorized: false
            });
        }
        this.handleExits();
    }
    async login() {
        const res = await axios_1.default.post(`${this.protocol}://${this.host}/dyn/login.json`, { right: 'istl', pass: this.password }, { headers: this.defaultHeaders, httpsAgent: this.agent });
        if (res.status == 200 && res.data.result && res.data.result.sid) {
            this.sessionId = res.data.result.sid;
            return;
        }
        console.error('Error when parsing SMA SID response:');
        console.log(res.data);
        throw Error('Login failed. Max number of sessions reached? If so, just wait a couple of minutes and try again ...');
    }
    async logoff() {
        try {
            const res = await axios_1.default.post(`${this.protocol}://${this.host}/dyn/logout.json?sid=${this.sessionId}`, {}, { headers: this.defaultHeaders, httpsAgent: this.agent });
            if (res.status == 200) {
                console.log('Logged out from SMA');
            }
        }
        catch (e) {
            console.error('Logging out failed');
            console.error(e);
        }
    }
    async getValues() {
        const res = await axios_1.default.post(`${this.protocol}://${this.host}/dyn/getAllOnlValues.json?sid=${this.sessionId}`, { destDev: [] }, { headers: this.defaultHeaders, httpsAgent: this.agent });
        if (res.status == 200 && res.data && res.data.result) {
            const mainKey = Object.keys(res.data.result)[0];
            if (mainKey !== undefined) {
                let dayYield = 0;
                if (res.data.result[mainKey]['6400_00262200'] !== undefined) {
                    dayYield = res.data.result[mainKey]['6400_00262200'][1][0].val / 1000;
                }
                else if (res.data.result[mainKey]['6400_00260100'] !== null) {
                    dayYield = res.data.result[mainKey]['6400_00260100'][1][0].val / 1000;
                }
                const data = {
                    DC: {
                        A: {
                            watt: res.data.result[mainKey]['6380_40251E00'][1][0].val == null ? 0 : res.data.result[mainKey]['6380_40251E00'][1][0].val,
                            volt: res.data.result[mainKey]['6380_40451F00'][1][0].val == null ? 0 : res.data.result[mainKey]['6380_40451F00'][1][0].val / 100,
                            amp: res.data.result[mainKey]['6380_40452100'][1][0].val == null ? 0 : res.data.result[mainKey]['6380_40452100'][1][0].val / 1000
                        }
                    },
                    AC: {
                        watt: res.data.result[mainKey]['6100_40263F00'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_40263F00'][1][0].val,
                        frequency: res.data.result[mainKey]['6100_00465700'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00465700'][1][0].val / 100,
                        L1: {
                            volt: res.data.result[mainKey]['6100_00464800'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00464800'][1][0].val / 100,
                            amp: res.data.result[mainKey]['6100_40465300'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_40465300'][1][0].val / 1000
                        }
                    },
                    dayYield: {
                        kwh: dayYield
                    },
                    totalYield: {
                        kwh: res.data.result[mainKey]['6400_00260100'][1][0].val == null ? 0 : res.data.result[mainKey]['6400_00260100'][1][0].val / 1000
                    }
                };
                if (this.strings >= 2) {
                    data.DC.B = {
                        watt: res.data.result[mainKey]['6380_40251E00'][1][1].val == null ? 0 : res.data.result[mainKey]['6380_40251E00'][1][1].val,
                        volt: res.data.result[mainKey]['6380_40451F00'][1][1].val == null ? 0 : res.data.result[mainKey]['6380_40451F00'][1][1].val / 100,
                        amp: res.data.result[mainKey]['6380_40452100'][1][1].val == null ? 0 : res.data.result[mainKey]['6380_40452100'][1][1].val / 1000
                    };
                }
                if (this.strings == 3) {
                    data.DC.C = {
                        watt: res.data.result[mainKey]['6380_40251E00'][1][2].val == null ? 0 : res.data.result[mainKey]['6380_40251E00'][1][1].val,
                        volt: res.data.result[mainKey]['6380_40451F00'][1][2].val == null ? 0 : res.data.result[mainKey]['6380_40451F00'][1][1].val / 100,
                        amp: res.data.result[mainKey]['6380_40452100'][1][2].val == null ? 0 : res.data.result[mainKey]['6380_40452100'][1][1].val / 1000
                    };
                }
                if (this.phases == Phases.Three) {
                    data.AC.L2 = {
                        volt: res.data.result[mainKey]['6100_00464900'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00464900'][1][0].val / 100,
                        amp: res.data.result[mainKey]['6100_40465400'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_40465400'][1][0].val / 1000
                    };
                    data.AC.L3 = {
                        volt: res.data.result[mainKey]['6100_00464A00'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00464A00'][1][0].val / 100,
                        amp: res.data.result[mainKey]['6100_40465500'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_40465500'][1][0].val / 1000
                    };
                    data.AC.L1L2 = {
                        volt: res.data.result[mainKey]['6100_00464B00'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00464B00'][1][0].val / 100
                    };
                    data.AC.L2L3 = {
                        volt: res.data.result[mainKey]['6100_00464C00'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00464C00'][1][0].val / 100
                    };
                    data.AC.L3L1 = {
                        volt: res.data.result[mainKey]['6100_00464D00'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00464D00'][1][0].val / 100
                    };
                }
                return data;
            }
        }
        console.error('Error when parsing SMA data:');
        console.log(res.data);
        throw Error('Error when parsing SMA data');
    }
    handleExits() {
        const exitHandler = async () => {
            await this.logoff();
        };
        process.on('exit', exitHandler);
        process.on('SIGINT', exitHandler);
        process.on('SIGUSR1', exitHandler);
        process.on('SIGUSR2', exitHandler);
        process.on('uncaughtException', exitHandler);
    }
}
exports.SMA = SMA;
//# sourceMappingURL=SMA.js.map