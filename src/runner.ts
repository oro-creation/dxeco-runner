import axios from 'axios';
import log4js from 'log4js';
import * as pw from 'playwright-core';
import * as ts from 'typescript';
import yargs from 'yargs';

import { AccountAdaptor } from './types';
import { readCsv } from './utils/csv/readCsv';
import { sleep } from './utils/function/sleep';

const logger = log4js.getLogger();
logger.level = 'trace';

const argv = yargs(process.argv.slice(2))
  .option('name', {
    description: 'Runner name',
    type: 'string',
  })
  .option('api-key', {
    description: 'API Key',
    type: 'string',
  })
  .option('interval', {
    description: 'Jobs polling interval',
    type: 'number',
    default: 30000,
  })
  .demandOption(['name', 'api-key'])
  .help().argv;

export async function runner() {
  try {
    // Preparing arguments
    const apiKey = (await argv)['api-key'];
    const name = (await argv)['name'];
    const interval = (await argv)['interval'];

    logger.trace('Starting dxeco-runner...');

    // Preparing API client
    const api = axios.create({
      baseURL: 'http://localhost:4000/api',
      headers: {
        'X-API-Key': apiKey,
      },
    });

    // Get my user context
    const {
      data: { organizationId },
    } = await api.get<{
      id: string;
      organizationId: string;
    }>('/auth/current-user');

    // Register as a runner
    const {
      data: { id: runnerId },
    } = await api.post<{
      id: string;
    }>('/runners/register', {
      organizationId,
      name,
    });

    logger.trace(`Registration complete: ${runnerId}`);

    // Activate every 30 seconds
    setInterval(async () => {
      try {
        await api.post<{
          id: string;
        }>(`/runners/${runnerId}/activate`, {
          id: runnerId,
        });
      } catch (e) {
        if (e instanceof Error) {
          logger.error(`Activation failed: ${e.message}\n${e.stack}`);
        }
      }
    }, 30000);

    logger.trace(`Waiting for jobs...`);

    // Polls its own jobs every 30 seconds
    do {
      const jobs = await (async () => {
        try {
          const {
            data: { data: jobs },
          } = await api.get<{
            data: Array<{
              id: string;
              status: string;
              runnableCode?: string;
            }>;
          }>('/runner-jobs', {
            params: {
              organizationId,
              runnerId,
              type: 'CustomAccountIntegration',
              status: 'Active',
            },
          });
          return jobs;
        } catch (e) {
          if (e instanceof Error) {
            logger.error(
              `Getting runner-jobs failed: ${e.message}\n${e.stack}`
            );
          }
          return [];
        }
      })();

      if (jobs.length > 0) {
        logger.trace(`Jobs found: ${jobs.map((v) => v.id).join(', ')}`);
      }

      for (const job of jobs) {
        try {
          logger.trace(`Job started: ${job.id}`);

          if (!job.runnableCode) {
            throw new Error('Runnable code not found');
          }

          const transpiled = ts.transpile(job.runnableCode);

          const runnable = eval(transpiled) as (args: {
            props: unknown;
            axios: unknown;
            csv: {
              readCsv(path: string): Array<Array<string>>;
            };
            pw: {
              chromium: pw.BrowserType;
            };
          }) => Promise<AccountAdaptor[]>;

          const result = await runnable({
            props: {},
            axios,
            csv: {
              readCsv,
            },
            pw,
          });

          await api.put(`/runner-jobs/${job.id}`, {
            id: job.id,
            status: 'Done',
            result,
          });

          logger.trace(`Job done: ${job.id}`);
        } catch (e) {
          if (e instanceof Error) {
            logger.trace(`Job error: ${e.message}`);

            await api.put(`/runner-jobs/${job.id}`, {
              id: job.id,
              status: 'Error',
              errorReason: e.stack,
            });

            continue;
          }
        }
      }

      await sleep(interval);
    } while (true);
  } catch (e) {
    if (e instanceof Error) {
      logger.error(`${e.message}\n${e.stack}`);
    }
  }
}
