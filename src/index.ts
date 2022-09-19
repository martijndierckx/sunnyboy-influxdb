import 'source-map-support/register';
import { Database } from './Database';
import { Phases, SMA } from './SMA';
import fs from 'fs';
import type { SMARegisters } from './SMARegisters';
import moment from 'moment';
import Express from 'express';

(async () => {
  // Set refresh interval & Wait period
  const INTERVAL = process.env.INTERVAL ? parseInt(process.env.INTERVAL) : 1000;
  const WAIT_IF_NULL = process.env.WAIT_IF_NULL ? parseInt(process.env.WAIT_IF_NULL) : 60;

  // Configure connection
  const strings = process.env.SMA_STRINGS ? parseInt(process.env.SMA_STRINGS) : 1;
  const smaConnOpts = {
    host: process.env.SMA_HOST,
    forceHttp: process.env.SMA_FORCE_HTTP ? true : false,
    password: process.env.SMA_INSTALLER_PASSWORD,
    phases: process.env.SMA_PHASES == '3' ? Phases.Three : Phases.One,
    strings: strings >= 1 && strings <= 3 ? strings : 1
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

  // Configure field map for Influx / Delete all unused field names
  const influxFieldMap = JSON.parse(fs.readFileSync(process.env.INFLUX_MAP_FILE ?? './src/influx_map.json').toString());
  if (smaConnOpts.phases == Phases.One) {
    if (influxFieldMap.AC.L2) delete influxFieldMap.AC.L2;
    if (influxFieldMap.AC.L3) delete influxFieldMap.AC.L3;
    if (influxFieldMap.AC.L1L2) delete influxFieldMap.AC.L1L2;
    if (influxFieldMap.AC.L2L3) delete influxFieldMap.AC.L2L3;
    if (influxFieldMap.AC.L3L1) delete influxFieldMap.AC.L3L1;
  }
  if (smaConnOpts.strings <= 2 && influxFieldMap.DC.C) delete influxFieldMap.DC.C;
  if (smaConnOpts.strings == 1 && influxFieldMap.DC.B) delete influxFieldMap.DC.B;

  // Connect to Influx
  const influxConnOpts = {
    url: process.env.INFLUX_URL,
    bucket: process.env.INFLUX_BUCKET,
    org: process.env.INFLUX_ORG,
    token: process.env.INFLUX_TOKEN,
    measurement: process.env.INFLUX_MEASUREMENT,
    fieldMap: influxFieldMap
  };
  const db = Database.connect(influxConnOpts, process.env.INFLUX_INVERTERTAG);

  // Cache latest values
  var previousValues = {
    values: null,
    timestamp: null
  };

  // Configure webserver
  if (process.env.HTTP_PORT) {
    const HTTP_PORT = parseInt(process.env.HTTP_PORT);
    const express = Express();

    express.get('/data', (_req, res) => {
      res.send(previousValues);
    });

    express.listen(HTTP_PORT, () => {
      console.log(`HTTP listening on port ${HTTP_PORT}`);
    });
  }

  // Read values every second
  setInterval(async () => {
    // If values were 0, then wait X seconds before retrieving/writing values again
    const timeSinceLastValues = moment().diff(previousValues.timestamp, 'seconds');
    if (
      previousValues.values == null ||
      previousValues.values.DC.A.volt != 0 ||
      (previousValues.values.DC.A.volt == 0 && timeSinceLastValues >= WAIT_IF_NULL)
    ) {
      // Get data
      let values: SMARegisters;
      try {
        values = await sma.getValues();
      } catch (e) {
        console.error(`Retrieving values failed:`);
        console.error(e);
        await sma.logoff();
        process.exit(1); // Force quit / restart
      }

      // Cache
      previousValues.values = values;
      previousValues.timestamp = moment();

      // Write values
      if (values) {
        try {
          await db.write(values);
          console.log(`Data written to InfluxDB`);
        } catch (e) {
          console.error(`Writing data to InfluxDB (${influxConnOpts.url}) failed:`);
          console.error(e);
          await sma.logoff();
          process.exit(1); // Force quit / restart
        }
      }
    } else {
      console.log(`Waiting ${WAIT_IF_NULL} seconds because previous values were 0`);
    }
  }, INTERVAL);
})();
