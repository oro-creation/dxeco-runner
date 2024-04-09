import axios from "npm:axios";
import { sleep } from "./utils/function/sleep.ts";
import { getLogger } from "jsr:@std/log";
import { bundle } from "https://deno.land/x/emit@0.38.3/mod.ts";

const logger = getLogger();

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
    logger.info("Starting dxeco-runner...");

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

    logger.info(`Registration complete: ${runnerId}`);

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

    logger.info(`Waiting for jobs...`);

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
        logger.info(`Jobs found: ${jobs.map((v) => v.id).join(", ")}`);
      }

      for (const job of jobs) {
        let blobUrl: string | undefined;
        try {
          logger.info(`Job started: ${job.id}`);

          if (!job.runnableCode) {
            throw new Error("Runnable code not found");
          }

          logger.info(`code: ${job.runnableCode}`);
          const bundled = (await bundle(job.runnableCode, {})).code;
          logger.info(`Runnable code bundled: ${job.runnableCode}`);

          blobUrl = URL.createObjectURL(
            new Blob([bundled], {
              type: "text/javascript",
            })
          );
          const result = await import(blobUrl);
          logger.info(`Runnable code imported: ${result}`);

          await api.put(`/runner-jobs/${job.id}`, {
            id: job.id,
            status: "Done",
            result,
          });

          logger.info(`Job done: ${job.id}`);
        } catch (e) {
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
          }
          logger.error(`Job error: ${e}`);
          if (e instanceof Error) {
            logger.info(`Job error: ${e.message}`);

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
