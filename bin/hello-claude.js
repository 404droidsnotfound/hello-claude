#!/usr/bin/env node
// @ts-check
// Entry point for `npx hello-claude`: start the local server, open the browser, print the URL.

import { spawn } from "node:child_process";
import { start } from "../src/server.js";

const args = new Set(process.argv.slice(2));
const noOpen = args.has("--no-open");

const { url, close } = await start();

console.log(`\nHello Claude is running at:\n\n  ${url}\n`);
console.log(noOpen ? "Open that in your browser." : "Opening it in your browser. If nothing happens, open it yourself.");
console.log("Press Ctrl+C to stop.\n");

if (!noOpen) openBrowser(url);

for (const sig of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
  process.on(sig, () => { close(); process.exit(0); });
}

/**
 * Open a URL in the default browser without adding a dependency. Failure is
 * not fatal — the URL is already printed.
 * @param {string} target
 */
function openBrowser(target) {
  const [cmd, cmdArgs] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", target]]
    : process.platform === "darwin" ? ["open", [target]]
    : ["xdg-open", [target]];
  try {
    spawn(cmd, cmdArgs, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
  } catch { /* URL is printed; the user can open it by hand */ }
}
