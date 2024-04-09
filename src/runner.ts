import axios from "npm:axios";
import log4js from "npm:log4js";
import * as pw from "npm:playwright-core";
import * as ts from "npm:typescript";

import { AccountAdaptor } from "./types.d.ts";
import { readCsv } from "./utils/csv/readCsv.ts";
import { sleep } from "./utils/function/sleep.ts";

const logger = log4js.getLogger();
logger.level = "trace";

export async function runner(
  props: Readonly<{
    /**
     * Runner name
     */
    name: string;
    /**
     * API Key
     */
    apiKey: string;
    /**
     * API URL
     * @default https://api.dxeco.io/api
     */
    apiUrl?: string;
    /**
     * Jobs polling interval
     * @default 30000
     */
    interval?: number;
  }>
) {
  const {
    name,
    apiKey,
    apiUrl = "https://api.dxeco.io/api",
    interval = 30000,
  } = props;

  try {
    logger.trace("Starting dxeco-runner...");

    // Preparing API client
    const api = axios.create({
      baseURL: apiUrl,
      headers: {
        "X-API-Key": apiKey,
      },
    });

    // Get my user context
    const {
      data: { organizationId },
    } = await api.get<{
      id: string;
      organizationId: string;
    }>("/auth/current-user");

    // Register as a runner
    const {
      data: { id: runnerId },
    } = await api.post<{
      id: string;
    }>("/runners/register", {
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
          }>("/runner-jobs", {
            params: {
              organizationId,
              runnerId,
              type: "CustomAccountIntegration",
              status: "Active",
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
        logger.trace(`Jobs found: ${jobs.map((v) => v.id).join(", ")}`);
      }

      for (const job of jobs) {
        try {
          logger.trace(`Job started: ${job.id}`);

          if (!job.runnableCode) {
            throw new Error("Runnable code not found");
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
            status: "Done",
            result,
          });

          logger.trace(`Job done: ${job.id}`);
        } catch (e) {
          if (e instanceof Error) {
            logger.trace(`Job error: ${e.message}`);

            await api.put(`/runner-jobs/${job.id}`, {
              id: job.id,
              status: "Error",
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
