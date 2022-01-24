"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = void 0;
const influxdb_client_1 = require("@influxdata/influxdb-client");
class Database {
    static connect(opts, tagName) {
        const db = new Database();
        db.measurement = opts.measurement;
        db.fieldMap = opts.fieldMap;
        const influxFieldTypes = {};
        const setInfluxFieldTypes = (keys) => {
            for (const key in keys) {
                var keyName = keys[key];
                if (typeof keyName === 'object') {
                    setInfluxFieldTypes(keyName);
                }
                else {
                    influxFieldTypes[keyName] = 'float';
                }
            }
        };
        setInfluxFieldTypes(opts.fieldMap);
        db.conn = new influxdb_client_1.InfluxDB({
            url: opts.url,
            token: opts.token
        }).getWriteApi(opts.org, opts.bucket, 's');
        db.conn.useDefaultTags({ host: tagName });
        return db;
    }
    async write(data) {
        const point = new influxdb_client_1.Point(this.measurement);
        const addValues = (keys, values) => {
            for (var key in keys) {
                var keyName = keys[key];
                if (typeof keyName === 'object') {
                    addValues(keyName, values[key]);
                }
                else {
                    point.floatField(keyName, values[key]);
                }
            }
        };
        addValues(this.fieldMap, data);
        this.conn.writePoint(point);
        return await this.conn.flush();
    }
}
exports.Database = Database;
//# sourceMappingURL=Database.js.map