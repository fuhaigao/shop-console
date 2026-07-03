/**
 * One-shot Claude call via the local `claude` CLI in print mode.
 *
 * Mirrors StackBoard's proven `viaCli` path: we shell out to `claude -p` with
 * `--bare --output-format json --no-session-persistence`, which rides the user's
 * existing Claude Code login (OAuth/subscription) — so NO Anthropic API key and
 * NO SDK dependency. The CLI must be logged in (`claude` works in your shell);
 * the spawned subprocess inherits that auth.
 *
 * The CLI prints a JSON envelope: { type, is_error, result, ... }. We return the
 * `result` text or a structured error.
 */
import { execFile } from "node:child_process";

interface ClaudeEnvelope {
  type: string;
  is_error?: boolean;
  result?: string;
}

export type OneShot = { text: string } | { error: string };

export async function claudeOneShot(opts: {
  system: string;
  user: string;
  /** Model alias or full id; defaults to a capable model for copywriting. */
  model?: string;
  timeoutMs?: number;
}): Promise<OneShot> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const args = [
    "-p",
    opts.user,
    "--output-format",
    "json",
    "--bare",
    "--system-prompt",
    opts.system,
    "--no-session-persistence",
    "--model",
    opts.model ?? "sonnet",
  ];

  return new Promise<OneShot>((resolve) => {
    const child = execFile(
      "claude",
      args,
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          const killed = (err as { killed?: boolean }).killed;
          const tail = (stderr ?? "").trim().replace(/\s+/g, " ").slice(-200);
          resolve({
            error: killed
              ? `claude timed out after ${timeoutMs}ms`
              : `claude error: ${err.message || "unknown"}${tail ? ` (${tail})` : ""}`,
          });
          return;
        }
        let env: ClaudeEnvelope;
        try {
          env = JSON.parse(stdout) as ClaudeEnvelope;
        } catch {
          resolve({ error: `non-JSON claude output: ${stdout.trim().slice(0, 160)}` });
          return;
        }
        if (env.is_error) {
          resolve({ error: `claude reported error: ${(env.result ?? "unknown").slice(0, 200)}` });
          return;
        }
        const text = env.result?.trim();
        resolve(text ? { text } : { error: "empty claude result" });
      },
    );
    // Close stdin so the CLI doesn't wait for piped input.
    child.stdin?.end();
    child.on("error", (e) => resolve({ error: `spawn error: ${e.message || "unknown"}` }));
  });
}

/** Strip a ```json … ``` fence (if present) and parse. Returns null on failure. */
export function parseJsonLoose<T>(raw: string): T | null {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();
  // Fall back to the first {...} block if there's stray prose.
  if (!s.startsWith("{")) {
    const brace = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (brace >= 0 && end > brace) s = s.slice(brace, end + 1);
  }
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
