import yargs from "npm:yargs";
import { runner } from "./runner.ts";

const argv = yargs(Deno.args.slice(2))
  .option("name", {
    description: "Runner name",
    type: "string",
  })
  .option("api-key", {
    description: "API Key",
    type: "string",
  })
  .option("api-url", {
    description: "API URL",
    type: "string",
    default: "https://api.dxeco.io/api",
  })
  .option("interval", {
    description: "Jobs polling interval",
    type: "number",
    default: 30000,
  })
  .demandOption(["name", "api-key"])
  .help().argv;

await runner({
  name: argv.name,
  apiKey: argv["api-key"],
  apiUrl: argv["api-url"],
  interval: argv.interval,
});
