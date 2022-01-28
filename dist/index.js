"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
require("source-map-support/register");
const Database_1 = require("./Database");
const SMA_1 = require("./SMA");
const fs_1 = (0, tslib_1.__importDefault)(require("fs"));
const moment_1 = (0, tslib_1.__importDefault)(require("moment"));
(async () => {
    const INTERVAL = process.env.INTERVAL ? parseInt(process.env.INTERVAL) : 1000;
    const WAIT_IF_NULL = process.env.WAIT_IF_NULL ? parseInt(process.env.WAIT_IF_NULL) : 60;
    const strings = process.env.SMA_STRINGS ? parseInt(process.env.SMA_STRINGS) : 1;
    const smaConnOpts = {
        host: process.env.SMA_HOST,
        forceHttp: process.env.SMA_FORCE_HTTP ? true : false,
        password: process.env.SMA_INSTALLER_PASSWORD,
        phases: process.env.SMA_PHASES == '3' ? SMA_1.Phases.Three : SMA_1.Phases.One,
        strings: strings >= 1 && strings <= 3 ? strings : 1,
    };
    const sma = new SMA_1.SMA(smaConnOpts);
    try {
        await sma.login();
    }
    catch (e) {
        console.error(`Couldn't connect to ${smaConnOpts.host}`);
        console.error(e);
        process.exit(1);
    }
    const influxFieldMap = JSON.parse(fs_1.default.readFileSync(process.env.INFLUX_MAP_FILE ?? './src/influx_map.json').toString());
    if (smaConnOpts.phases == SMA_1.Phases.One) {
        if (influxFieldMap.AC.L2)
            delete influxFieldMap.AC.L2;
        if (influxFieldMap.AC.L3)
            delete influxFieldMap.AC.L3;
        if (influxFieldMap.AC.L1L2)
            delete influxFieldMap.AC.L1L2;
        if (influxFieldMap.AC.L2L3)
            delete influxFieldMap.AC.L2L3;
        if (influxFieldMap.AC.L3L1)
            delete influxFieldMap.AC.L3L1;
    }
    if (smaConnOpts.strings <= 2 && influxFieldMap.DC.C)
        delete influxFieldMap.DC.C;
    if (smaConnOpts.strings == 1 && influxFieldMap.DC.B)
        delete influxFieldMap.DC.B;
    const influxConnOpts = {
        url: process.env.INFLUX_URL,
        bucket: process.env.INFLUX_BUCKET,
        org: process.env.INFLUX_ORG,
        token: process.env.INFLUX_TOKEN,
        measurement: process.env.INFLUX_MEASUREMENT,
        fieldMap: influxFieldMap
    };
    const db = Database_1.Database.connect(influxConnOpts, process.env.INFLUX_METERTAG);
    var previousValues = {
        values: null,
        timestamp: null
    };
    setInterval(async () => {
        const timeSinceLastValues = (0, moment_1.default)().diff(previousValues.timestamp, 'seconds');
        if (previousValues.values == null ||
            previousValues.values.DC.A.volt != 0 ||
            (previousValues.values.DC.A.volt == 0 && timeSinceLastValues >= WAIT_IF_NULL)) {
            let values;
            try {
                values = await sma.getValues();
            }
            catch (e) {
                console.error(`Retrieving values failed:`);
                console.error(e);
                await sma.logoff();
                process.exit(1);
            }
            previousValues.values = values;
            previousValues.timestamp = (0, moment_1.default)();
            if (values) {
                try {
                    await db.write(values);
                    console.log(`Data written to InfluxDB`);
                }
                catch (e) {
                    console.error(`Writing data to InfluxDB (${influxConnOpts.url}) failed:`);
                    console.error(e);
                    await sma.logoff();
                    process.exit(1);
                }
            }
        }
        else {
            console.log(`Waiting ${WAIT_IF_NULL} seconds because previous values where 0`);
        }
    }, INTERVAL);
})();
//# sourceMappingURL=index.js.map