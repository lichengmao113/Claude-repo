#!/usr/bin/env node

import { resolve } from "node:path";
import { startProdServer } from "vinext/server/prod-server";

const outDir = resolve(process.argv[2] ?? "dist");
const production = await startProdServer({
  port: 0,
  host: "127.0.0.1",
  outDir,
  silent: true,
  purpose: "Belief Atlas internal renderer",
});

process.send?.({ type: "ready", port: production.port });

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await new Promise((resolveClose) => production.server.close(resolveClose));
  production.server.closeAllConnections?.();
  process.disconnect?.();
}

process.on("message", (message) => {
  if (message?.type === "close") void close();
});
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
process.once("disconnect", () => void close());
