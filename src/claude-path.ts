import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

// The agent SDK bundles an older Claude Code, which runs web search on Haiku 4.5 and
// misprices Haiku 5.5. The user's installed claude is signed in and kept up to date.
export function findClaudeExecutable(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.CLAUDE_CODE_PATH) return env.CLAUDE_CODE_PATH;
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, "claude");
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not in this directory.
    }
  }
  return undefined;
}
