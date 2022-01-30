import Axios, { AxiosRequestHeaders } from 'axios';
import { Agent } from 'https';
import type { SMARegisters } from './SMARegisters';

export enum Protocol {
  Https = 'https',
  Http = 'http'
}

export enum Phases {
  One = 1,
  Three = 3
}

export enum Strings {
  One = 1,
  Two = 2,
  Three = 3
}

export type SMAConfig = {
  host: string;
  password: string;
  forceHttp?: boolean;
  phases: Phases;
  strings: Strings;
};

export class SMA {
  private host: string;
  private password: string;
  private protocol: Protocol;
  private defaultHeaders: AxiosRequestHeaders;
  private agent: Agent;
  private sessionId: string;
  private strings: Strings;
  private phases: Phases;

  public constructor(opts: SMAConfig) {
    this.host = opts.host;
    this.password = opts.password;
    this.protocol = opts.forceHttp ? Protocol.Http : Protocol.Https;
    this.strings = opts.strings;
    this.phases = opts.phases;
    this.defaultHeaders = {
      Origin: `${this.protocol}://${this.host}`
    };

    // Allow insecure SSL
    if (this.protocol == Protocol.Https) {
      this.agent = new Agent({
        rejectUnauthorized: false
      });
    }

    // Logoff before quitting
    this.handleExits();
  }

  public async login() {
    const res = await Axios.post(
      `${this.protocol}://${this.host}/dyn/login.json`,
      { right: 'istl', pass: this.password },
      { headers: this.defaultHeaders, httpsAgent: this.agent }
    );

    if (res.status == 200 && res.data.result && res.data.result.sid) {
      // Save Session ID
      this.sessionId = res.data.result.sid;

      return;
    }

    // Something went wrong
    console.error('Error when parsing SMA SID response:');
    console.log(res.data);

    throw Error('Login failed. Max number of sessions reached? If so, just wait a couple of minutes and try again ...');
  }

  public async logoff() {
    try {
      const res = await Axios.post(
        `https://${this.host}/dyn/logout.json?sid=${this.sessionId}`,
        {},
        { headers: this.defaultHeaders, httpsAgent: this.agent }
      );
      if (res.status == 200) {
        console.log('Logged out from SMA');
      }
    } catch (e) {
      console.error('Logging out failed');
      console.error(e);
    }
  }

  public async getValues(): Promise<SMARegisters> {
    const res = await Axios.post(
      `${this.protocol}://${this.host}/dyn/getAllOnlValues.json?sid=${this.sessionId}`,
      { destDev: [] },
      { headers: this.defaultHeaders, httpsAgent: this.agent }
    );

    if (res.status == 200 && res.data && res.data.result) {
      // Get Main Key
      const mainKey = Object.keys(res.data.result)[0];

      if (mainKey !== undefined) {
        // Day Yield
        let dayYield = 0;
        if (res.data.result[mainKey]['6400_00262200'] !== undefined) {
          // Old way
          dayYield = res.data.result[mainKey]['6400_00262200'][1][0].val / 1000;
        } else if (res.data.result[mainKey]['6400_00260100'] !== null) {
          // New way
          dayYield = res.data.result[mainKey]['6400_00260100'][1][0].val / 1000;
        }

        // Read and Clean values
        const data: SMARegisters = {
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

        // Add B string data if present
        if (this.strings >= 2) {
          data.DC.B = {
            watt: res.data.result[mainKey]['6380_40251E00'][1][1].val == null ? 0 : res.data.result[mainKey]['6380_40251E00'][1][1].val,
            volt: res.data.result[mainKey]['6380_40451F00'][1][1].val == null ? 0 : res.data.result[mainKey]['6380_40451F00'][1][1].val / 100,
            amp: res.data.result[mainKey]['6380_40452100'][1][1].val == null ? 0 : res.data.result[mainKey]['6380_40452100'][1][1].val / 1000
          };
        }

        // Add C string data if present
        if (this.strings == 3) {
          data.DC.C = {
            watt: res.data.result[mainKey]['6380_40251E00'][1][2].val == null ? 0 : res.data.result[mainKey]['6380_40251E00'][1][1].val,
            volt: res.data.result[mainKey]['6380_40451F00'][1][2].val == null ? 0 : res.data.result[mainKey]['6380_40451F00'][1][1].val / 100,
            amp: res.data.result[mainKey]['6380_40452100'][1][2].val == null ? 0 : res.data.result[mainKey]['6380_40452100'][1][1].val / 1000
          };
        }

        // Add multi phases data if present
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

    // Something went wrong
    console.error('Error when parsing SMA data:');
    console.log(res.data);

    throw Error('Error when parsing SMA data');
  }

  private handleExits(): void {
    const exitHandler = async () => {
      await this.logoff();
    };

    // Do something when app is closing
    process.on('exit', exitHandler);

    // Catches ctrl+c event
    process.on('SIGINT', exitHandler);

    // Catches "kill pid" (for example: nodemon restart)
    process.on('SIGUSR1', exitHandler);
    process.on('SIGUSR2', exitHandler);

    // Catches uncaught exceptions
    process.on('uncaughtException', exitHandler);
  }
}
