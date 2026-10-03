#!/usr/bin/env node

import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startLocalBeliefServer } from "./local-belief-server.mjs";

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptsRoot, "..");
const distRoot = join(projectRoot, "dist");
const argumentsSet = new Set(process.argv.slice(2));
const unknownArguments = [...argumentsSet].filter(
  (argument) => !["--build", "--no-build"].includes(argument),
);

if (
  unknownArguments.length > 0 ||
  (argumentsSet.has("--build") && argumentsSet.has("--no-build"))
) {
  process.stderr.write("Usage: node scripts/start-local.mjs [--build | --no-build]\n");
  process.exitCode = 2;
} else {
  await main();
}

async function main() {
  assertSupportedNode();

  let buildReady = argumentsSet.has("--build") ? false : await hasBuild();
  if (!buildReady && !argumentsSet.has("--no-build")) {
    process.stdout.write("No vinext production build found; building it locally...\n");
    await runBuild();
    buildReady = await hasBuild();
  }
  if (!buildReady) {
    throw new Error(
      "No vinext SSR build found in dist/server. Run the existing build command first.",
    );
  }

  const renderer = await startVinextChild();
  let local = null;
  let closing = false;

  try {
    local = await startLocalBeliefServer({
      upstreamOrigin: `http://127.0.0.1:${renderer.port}`,
    });
  } catch (error) {
    await closeChild(renderer.child);
    throw error;
  }

  renderer.child.once("exit", async (exitCode, signal) => {
    if (closing) return;
    closing = true;
    process.stderr.write(
      `\nThe internal vinext server stopped unexpectedly (${exitCode ?? signal ?? "unknown"}).\n`,
    );
    await local.close().catch(() => {});
    process.exitCode = 1;
  });

  process.stdout.write(
    [
      "",
      "Belief Atlas is running only on this Mac.",
      `Internal renderer: http://127.0.0.1:${renderer.port}`,
      "Open this one-time URL to establish the local session cookie:",
      local.startupUrl,
      "",
      "Press Ctrl+C to stop both local servers. The URL token is local and should not be shared.",
      "",
    ].join("\n"),
  );

  const close = async (signal) => {
    if (closing) return;
    closing = true;
    process.stdout.write(`\nStopping local servers (${signal})...\n`);
    const results = await Promise.allSettled([
      local.close(),
      closeChild(renderer.child),
    ]);
    process.exitCode = results.some((result) => result.status === "rejected")
      ? 1
      : 0;
  };

  process.once("SIGINT", () => void close("SIGINT"));
  process.once("SIGTERM", () => void close("SIGTERM"));
}

function assertSupportedNode() {
  const majorVersion = Number.parseInt(process.versions.node.split(".", 1)[0], 10);
  if (!Number.isInteger(majorVersion) || majorVersion < 22) {
    throw new Error(`Node.js 22 or newer is required; found ${process.versions.node}.`);
  }
}

async function hasBuild() {
  for (const entry of ["index.js", "entry.js"]) {
    try {
      await access(join(distRoot, "server", entry), fsConstants.R_OK);
      await access(join(distRoot, "client"), fsConstants.R_OK);
      return true;
    } catch {
      // Try the other supported server entry.
    }
  }
  return false;
}

async function startVinextChild() {
  const childScript = join(scriptsRoot, "vinext-child.mjs");
  const child = spawn(process.execPath, [childScript, distRoot], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
    shell: false,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    windowsHide: true,
  });

  return new Promise((resolveChild, rejectChild) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      rejectChild(new Error("The internal vinext server did not start in time."));
    }, 30_000);
    const cleanup = () => clearTimeout(timeout);
    child.once("error", () => {
      cleanup();
      rejectChild(new Error("Could not start the internal vinext server."));
    });
    child.once("exit", (exitCode, signal) => {
      cleanup();
      rejectChild(
        new Error(
          `The internal vinext server exited during startup (${exitCode ?? signal ?? "unknown"}).`,
        ),
      );
    });
    child.on("message", (message) => {
      if (
        message?.type === "ready" &&
        Number.isInteger(message.port) &&
        message.port > 0
      ) {
        cleanup();
        resolveChild({ child, port: message.port });
      }
    });
  });
}

async function closeChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolveClose) => {
    let finished = false;
    let killTimer;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(killTimer);
      resolveClose();
    };
    child.once("exit", finish);
    child.send?.({ type: "close" }, () => {});
    child.kill("SIGTERM");
    killTimer = setTimeout(() => {
      child.kill("SIGKILL");
      setTimeout(finish, 1_000).unref?.();
    }, 2_000);
    killTimer.unref?.();
  });
}

async function runBuild() {
  const vinextCli = join(projectRoot, "node_modules", "vinext", "dist", "cli.js");
  try {
    await access(vinextCli, fsConstants.R_OK);
  } catch {
    throw new Error(
      "The local build tool is missing. Install the existing lockfile dependencies first.",
    );
  }

  await new Promise((resolveBuild, rejectBuild) => {
    const child = spawn(process.execPath, [vinextCli, "build"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        WRANGLER_LOG_PATH:
          process.env.WRANGLER_LOG_PATH ??
          join(projectRoot, ".wrangler", "wrangler.log"),
      },
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", () => rejectBuild(new Error("Could not start the local build.")));
    child.once("close", (exitCode, signal) => {
      if (exitCode === 0) resolveBuild();
      else {
        rejectBuild(
          new Error(
            `Local build failed (${exitCode ?? signal ?? "unknown exit"}).`,
          ),
        );
      }
    });
  });
}
