import { app } from "../app";
import { OPENAPI_CONFIG } from "../openapi";

const output = new URL("../../../../packages/contracts/openapi.json", import.meta.url);

const document = app.getOpenAPIDocument(OPENAPI_CONFIG);

await Bun.write(output, `${JSON.stringify(document, null, 2)}\n`);

console.log(`Wrote ${output.pathname}`);
