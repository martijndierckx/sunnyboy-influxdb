import Axios, { AxiosRequestHeaders } from 'axios';
import { Agent } from 'https';
import type { SMARegisters } from './SMARegisters';

export class SMA {
  private host: string;
  private password: string;
  private defaultHeaders: AxiosRequestHeaders;
  private agent: Agent;
  private sessionId: string;

  public constructor(opts: { host: string; password: string }) {
    this.host = opts.host;
    this.password = opts.password;
    this.defaultHeaders = {
      Origin: `https://${this.host}`
    };

    // Allow insecure SSL
    this.agent = new Agent({
      rejectUnauthorized: false
    });

    // Logoff before quitting
    this.handleExits();
  }

  public async login() {
    const res = await Axios.post(
      `https://${this.host}/dyn/login.json`,
      { right: 'istl', pass: this.password },
      { headers: this.defaultHeaders, httpsAgent: this.agent }
    );

    if (res.status == 200) {
      // Save Session ID
      this.sessionId = res.data.result.sid;

      return;
    }

    // Something went wrong
    console.error('Error when parsing SMA SID response:');
    console.log(res.data);
  }

  public async logoff() {
    const res = await Axios.post(
      `https://${this.host}/dyn/logout.json?sid=${this.sessionId}`,
      {},
      { headers: this.defaultHeaders, httpsAgent: this.agent }
    );
    if (res.status == 200) {
      console.log('Logged out from SMA');
    }
  }

  public async getValues(): Promise<SMARegisters> {
    const res = await Axios.post(
      `https://${this.host}/dyn/getAllOnlValues.json?sid=${this.sessionId}`,
      { destDev: [] },
      { headers: this.defaultHeaders, httpsAgent: this.agent }
    );

    if (res.status == 200) {
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
        return {
          DC: {
            A: {
              watt: res.data.result[mainKey]['6380_40251E00'][1][0].val == null ? 0 : res.data.result[mainKey]['6380_40251E00'][1][0].val,
              volt: res.data.result[mainKey]['6380_40451F00'][1][0].val == null ? 0 : res.data.result[mainKey]['6380_40451F00'][1][0].val / 100,
              amp: res.data.result[mainKey]['6380_40452100'][1][0].val == null ? 0 : res.data.result[mainKey]['6380_40452100'][1][0].val / 1000
            },
            B: {
              watt: res.data.result[mainKey]['6380_40251E00'][1][1].val == null ? 0 : res.data.result[mainKey]['6380_40251E00'][1][1].val,
              volt: res.data.result[mainKey]['6380_40451F00'][1][1].val == null ? 0 : res.data.result[mainKey]['6380_40451F00'][1][1].val / 100,
              amp: res.data.result[mainKey]['6380_40452100'][1][1].val == null ? 0 : res.data.result[mainKey]['6380_40452100'][1][1].val / 1000
            }
          },
          AC: {
            watt: res.data.result[mainKey]['6100_40263F00'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_40263F00'][1][0].val,
            frequency: res.data.result[mainKey]['6100_00465700'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00465700'][1][0].val / 100,
            L1: {
              volt: res.data.result[mainKey]['6100_00464800'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00464800'][1][0].val / 100,
              amp: res.data.result[mainKey]['6100_40465300'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_40465300'][1][0].val / 1000
            },
            L2: {
              volt: res.data.result[mainKey]['6100_00464900'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00464900'][1][0].val / 100,
              amp: res.data.result[mainKey]['6100_40465400'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_40465400'][1][0].val / 1000
            },
            L3: {
              volt: res.data.result[mainKey]['6100_00464A00'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00464A00'][1][0].val / 100,
              amp: res.data.result[mainKey]['6100_40465500'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_40465500'][1][0].val / 1000
            },
            L1L2: {
              volt: res.data.result[mainKey]['6100_00464B00'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00464B00'][1][0].val / 100
            },
            L2L3: {
              volt: res.data.result[mainKey]['6100_00464C00'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00464C00'][1][0].val / 100
            },
            L3L1: {
              volt: res.data.result[mainKey]['6100_00464D00'][1][0].val == null ? 0 : res.data.result[mainKey]['6100_00464D00'][1][0].val / 100
            }
          },
          dayYield: {
            kwh: dayYield
          },
          totalYield: {
            kwh: res.data.result[mainKey]['6400_00260100'][1][0].val == null ? 0 : res.data.result[mainKey]['6400_00260100'][1][0].val / 1000
          }
        };
      }
    }

    // Something went wrong
    console.error('Error when parsing SMA SID response:');
    console.log(res.data);

    throw Error('Error when parsing SMA SID response:');
  }

  private handleExits(): void {
    const exitHandler = async () => {
      try {
        await this.logoff();
      } catch (e) {
        console.log('Logoff failed');
      }
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
