import { app } from "../app";
import { OPENAPI_CONFIG } from "../openapi";

const file = new URL("../../../../packages/contracts/openapi.json", import.meta.url);

const expected = `${JSON.stringify(app.getOpenAPIDocument(OPENAPI_CONFIG), null, 2)}\n`;
const actual = await Bun.file(file).text();

if (expected !== actual) {
  console.error("OpenAPI document is stale. Run: bun run contracts:generate");
  process.exit(1);
}

console.log("OpenAPI document is current.");
