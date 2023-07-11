import axios from 'axios';
import kleur from 'kleur';
import * as pw from 'playwright-core';
import * as ts from 'typescript';
import yargs from 'yargs';

import { AccountAdaptor } from './types';
import { readCsv } from './utils/csv/readCsv';
import { sleep } from './utils/function/sleep';

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
  // Preparing arguments
  const apiKey = (await argv)['api-key'];
  const name = (await argv)['name'];
  const interval = (await argv)['interval'];

  console.log(kleur.blue('Starting dxeco-runner...'));

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

  console.log(kleur.blue(`Registration complete: ${runnerId}`));

  // Activate every 30 seconds
  setInterval(async () => {
    await api.post<{
      id: string;
    }>(`/runners/${runnerId}/activate`, {
      id: runnerId,
    });
  }, 30000);

  // Polls its own jobs every 30 seconds
  console.log(kleur.green('Waiting for jobs...'));
  do {
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

    if (jobs.length > 0) {
      console.log(
        kleur.blue(`Jobs found: ${jobs.map((v) => v.id).join(', ')}`)
      );
    }

    for (const job of jobs) {
      try {
        console.log(kleur.blue(`Job started: ${job.id}`));

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

        console.log(kleur.blue(`Job done: ${job.id}`));
      } catch (e) {
        if (e instanceof Error) {
          console.log(kleur.blue(`Job error: ${e.message}`));

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
}
