/**
 * internalToken.ts — shared helper for the demo scripts
 *
 * The risk engine only records login events for a caller that presents the
 * shared token, so these scripts read it from the environment, falling back
 * to the repository's git-ignored .env. The value is never printed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const VARIABLE = "INTERNAL_API_TOKEN";

function readFromEnvFile(): string {
  try {
    const contents = readFileSync(join(__dirname, "..", ".env"), "utf8");
    const line = contents
      .split(/\r?\n/)
      .find((candidate) => candidate.startsWith(`${VARIABLE}=`));
    return line ? line.slice(VARIABLE.length + 1).trim() : "";
  } catch {
    return "";
  }
}

export function internalHeaders(): Record<string, string> {
  const token = process.env[VARIABLE] || readFromEnvFile();
  if (!token) {
    console.error(
      `${VARIABLE} is not set. Copy .env.example to .env and give it a value, ` +
        "the same one the risk engine container reads."
    );
    process.exit(1);
  }
  return { "Content-Type": "application/json", "X-Internal-Token": token };
}
