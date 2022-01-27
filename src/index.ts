import 'source-map-support/register';
import { Database } from './Database';
import { SMA } from './SMA';
import fs from 'fs';
import type { SMARegisters } from './SMARegisters';
import moment from 'moment';

(async () => {
  // Set refresh interval
  const INTERVAL = process.env.INTERVAL ? parseInt(process.env.INTERVAL) : 1000;
  const WAIT_IF_NULL = process.env.WAIT_IF_NULL ? parseInt(process.env.WAIT_IF_NULL) : 60;

  // Configure connection
  const smaConnOpts = {
    host: process.env.SMA_HOST,
    forceHttp: process.env.SMA_FORCE_HTTP ? true : false,
    password: process.env.SMA_INSTALLER_PASSWORD
  };

  // Connect to SMA
  const sma = new SMA(smaConnOpts);
  try {
    await sma.login();
  } catch (e) {
    console.error(`Couldn't connect to ${smaConnOpts.host}`);
    console.error(e);
    process.exit(1);
  }

  // Connect to Influx
  const influxConnOpts = {
    url: process.env.INFLUX_URL,
    bucket: process.env.INFLUX_BUCKET,
    org: process.env.INFLUX_ORG,
    token: process.env.INFLUX_TOKEN,
    measurement: process.env.INFLUX_MEASUREMENT,
    fieldMap: JSON.parse(fs.readFileSync(process.env.INFLUX_MAP_FILE ?? './src/influx_map.json').toString())
  };
  const db = Database.connect(influxConnOpts, process.env.INFLUX_METERTAG);

  // Cache latest values
  var latestValues = {
    values: null,
    timestamp: null
  };

  // Read values every second
  setInterval(async () => {
    // Were latest values 0, wait X seconds
    const timeSinceLastValues = moment().diff(latestValues.timestamp, 'seconds');
    if (
      latestValues.values == null ||
      latestValues.values.DC.A.volt != 0 ||
      latestValues.values.DC.B.volt != 0 ||
      (latestValues.values.DC.A.volt == 0 && latestValues.values.DC.B.volt == 0 && timeSinceLastValues >= WAIT_IF_NULL)
    ) {
      // Get data
      let values: SMARegisters;
      try {
        values = await sma.getValues();
      } catch (e) {
        console.error(`Retrieving values failed:`);
        console.error(e);
        sma.logoff();
        process.exit(1); // Force quit / restart
      }

      // Cache
      latestValues.values = values;
      latestValues.timestamp = moment();

      // Write values
      if (values) {
        try {
          await db.write(values);

          console.log(`Data written to InfluxDB`);
        } catch (e) {
          console.error(`Writing data to InfluxDB (${influxConnOpts.url}) failed:`);
          console.error(e);
          sma.logoff();
          process.exit(1); // Force quit / restart
        }
      }
    } else {
      console.log(`Waiting ${WAIT_IF_NULL} seconds because previous values where 0`);
    }
  }, INTERVAL);
})();
