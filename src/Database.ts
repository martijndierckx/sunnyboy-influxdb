import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';

export type DatabaseConnectionConfig = {
  url: string;
  token: string;
  org: string;
  bucket: string;
  measurement: string;
  fieldMap: any;
};

export class Database {
  private conn: WriteApi;

  private measurement: string;
  private fieldMap: any;

  public static connect(opts: DatabaseConnectionConfig, tagName: string) {
    const db = new Database();

    // Save params
    db.measurement = opts.measurement;
    db.fieldMap = opts.fieldMap;

    // Fieldmap to fields list
    const influxFieldTypes: { [column: string]: 'float' } = {};
    const setInfluxFieldTypes = (keys: any[]) => {
      for (const key in keys) {
        var keyName = keys[key];
        if (typeof keyName === 'object') {
          setInfluxFieldTypes(keyName);
        } else {
          influxFieldTypes[keyName] = 'float';
        }
      }
    };
    setInfluxFieldTypes(opts.fieldMap);

    // Initiate connection
    db.conn = new InfluxDB({
      url: opts.url,
      token: opts.token
    }).getWriteApi(opts.org, opts.bucket, 's');

    // Setup default tags for all writes through this API
    db.conn.useDefaultTags({ host: tagName });

    return db;
  }

  public async write(data: { [name: string]: any }): Promise<void> {
    // Create point
    const point = new Point(this.measurement);

    // Add values
    const addValues = (keys, values) => {
      for (var key in keys) {
        var keyName = keys[key];
        if (typeof keyName === 'object') {
          addValues(keyName, values[key]);
        } else {
          point.floatField(keyName, values[key]);
        }
      }
    };
    addValues(this.fieldMap, data);

    // Write
    this.conn.writePoint(point);
    return await this.conn.flush();
  }
}
