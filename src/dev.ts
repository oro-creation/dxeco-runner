import { runner } from "./runner.ts";

await runner({
  name: "TestRunner",
  apiKey: "dummy",
  apiUrl: "http://localhost:4000/api",
  interval: 5000,
});
