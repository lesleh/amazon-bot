import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Warning } from "ai";
import {
  createShopperAgent,
  DEFAULT_MODELS,
  DEFAULT_PROVIDER,
  isUnknownModelWarning,
  PROVIDERS,
  type ProviderName,
} from "./agent.ts";
import { createCanopyClient } from "./canopy.ts";
import { renderReport } from "./html.ts";
import { loadInstructions, loadProfile, withProfile } from "./prompt.ts";
import { recordingFetch, replayFetch } from "./recording.ts";
import { finalReport } from "./report.ts";
import {
  defaultRecordingDir,
  openInBrowser,
  saveReport,
} from "./report-file.ts";
import type { ShoppingReport } from "./shopping-report.ts";
import { CANOPY_TOOL_NAMES, DEFAULT_MAX_CANDIDATES } from "./tools.ts";
import { formatModelCosts, formatUsage, type ModelCost } from "./usage.ts";
import { MAX_WEB_SEARCHES } from "./web-search-limit.ts";

const USAGE = `Usage: pnpm shop "<what you want>" [--budget 15] [--provider ${PROVIDERS.join("|")}] [--model <id>] [--record <dir> | --replay <dir>] [--no-open]

Example: pnpm shop "a cordless drill for light DIY, under £80"`;

export interface CliOptions {
  request: string;
  budget: number;
  provider: ProviderName;
  model: string;
  open: boolean;
  recording?: { mode: "record" | "replay"; dir: string };
}

export class UsageError extends Error {}

function isProvider(value: string): value is ProviderName {
  return (PROVIDERS as readonly string[]).includes(value);
}

export function parseCliArgs(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      open: { type: "boolean", default: true },
      budget: { type: "string", default: "15" },
      provider: { type: "string", default: DEFAULT_PROVIDER },
      model: { type: "string" },
      record: { type: "string" },
      replay: { type: "string" },
    },
  });

  const request = positionals.join(" ").trim();
  if (!request) throw new UsageError("Say what you want to buy.");

  const budget = Number(values.budget);
  if (!Number.isInteger(budget) || budget < 1) {
    throw new UsageError("--budget must be a whole number of 1 or more.");
  }

  const { provider } = values;
  if (!isProvider(provider)) {
    throw new UsageError(`--provider must be one of: ${PROVIDERS.join(", ")}.`);
  }

  if (values.record && values.replay) {
    throw new UsageError("Use --record or --replay, not both.");
  }
  const recording = values.record
    ? { mode: "record" as const, dir: values.record }
    : values.replay
      ? { mode: "replay" as const, dir: values.replay }
      : undefined;

  return {
    request,
    budget,
    provider,
    model: values.model ?? DEFAULT_MODELS[provider],
    open: values.open,
    ...(recording && { recording }),
  };
}

// The Claude Code provider warns above 20 turns, but a full run needs more.
// It also warns about full model IDs, which are correct.
function logWarnings({ warnings }: { warnings: Warning[] }): void {
  for (const warning of warnings) {
    const text =
      "message" in warning
        ? warning.message
        : `${warning.type}: ${warning.feature}${warning.details ? ` (${warning.details})` : ""}`;
    if (!text.startsWith("High maxTurns") && !isUnknownModelWarning(text)) {
      console.error(`Warning: ${text}`);
    }
  }
}

function logCall(toolName: string, input: unknown): void {
  const fields = Object.values(input as Record<string, unknown>)
    .filter((value) => value !== undefined)
    .join(", ");
  console.error(`  ${toolName}(${fields})`);
}

async function main(): Promise<number> {
  let options: CliOptions;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${USAGE}`);
    return 2;
  }

  const { recording } = options;
  const replaying = recording?.mode === "replay";
  const apiKey = replaying ? "replay" : process.env.CANOPY_API_KEY;
  if (!apiKey) {
    console.error("CANOPY_API_KEY is not set. Add it to .env.");
    return 2;
  }

  let recordDir: string | undefined;
  let canopyFetch: typeof fetch;
  if (recording?.mode === "replay") {
    canopyFetch = replayFetch(recording.dir);
  } else {
    recordDir =
      recording?.dir ?? defaultRecordingDir(options.request, new Date());
    canopyFetch = recordingFetch(recordDir);
  }
  const canopy = createCanopyClient({
    apiKey,
    budget: options.budget,
    fetch: canopyFetch,
  });
  const abort = new AbortController();
  let report: ShoppingReport | undefined;
  const agent = createShopperAgent({
    canopy,
    instructions: await loadInstructions({
      budget: options.budget,
      candidates: DEFAULT_MAX_CANDIDATES,
      searches: MAX_WEB_SEARCHES,
    }),
    provider: options.provider,
    modelId: options.model,
    onFatalError: (error) => abort.abort(error),
    onCall: logCall,
    onReport: (submitted) => {
      report = submitted;
    },
  });

  let result: Awaited<ReturnType<typeof agent.generate>>;
  try {
    result = await agent.generate({
      prompt: withProfile(options.request, await loadProfile()),
      abortSignal: abort.signal,
      // Canopy tools log as they start; the rest, such as web search, log per step.
      onStepEnd: (step) => {
        for (const call of step.toolCalls) {
          const name = call.toolName.replace(/^mcp__(canopy|listing)__/, "");
          if (!CANOPY_TOOL_NAMES.has(name)) logCall(name, call.input);
        }
      },
    });
  } catch (error) {
    if (!abort.signal.aborted) throw error;
    console.error(
      `Stopped: ${(abort.signal.reason as Error).message}\nCheck CANOPY_API_KEY in .env.`,
    );
    return 1;
  }

  const lastStep = result.steps.at(-1);
  const claudeCodeMetadata = lastStep?.providerMetadata?.["claude-code"];
  const costUsd = claudeCodeMetadata?.costUsd;
  const modelUsage = claudeCodeMetadata?.modelUsage as
    | Record<string, ModelCost>
    | undefined;
  if (report) {
    const generatedAt = new Date();
    const path = await saveReport(
      renderReport(report, {
        request: options.request,
        generatedAt,
        model: options.model,
        canopyRequests: canopy.requestsUsed,
        budget: options.budget,
        replayed: replaying,
        ...(typeof costUsd === "number" && { modelCostUsd: costUsd }),
      }),
      options.request,
      generatedAt,
    );
    console.log(`${report.headline}\n\nReport: ${path}`);
    if (options.open) openInBrowser(path);
  } else {
    // Without a submitted report, the agent's last message is the best there is.
    console.error("The agent did not submit a report. Its last message:\n");
    console.log(finalReport(lastStep?.content ?? []));
  }
  console.error(
    `\nCanopy requests: ${canopy.requestsUsed} of ${options.budget}${replaying ? " (replayed, none sent)" : ""}.\n` +
      formatUsage(
        result.totalUsage,
        typeof costUsd === "number" ? costUsd : undefined,
      ),
  );
  for (const line of formatModelCosts(modelUsage ?? {})) console.error(line);
  if (recordDir && existsSync(recordDir)) {
    console.error(`Recorded to ${recordDir}. Replay it with --replay.`);
  }

  if (result.finishReason !== "stop") {
    console.error(
      `The agent stopped early (${result.finishReason}). The report can be incomplete.`,
    );
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  globalThis.AI_SDK_LOG_WARNINGS = logWarnings;
  process.exitCode = await main();
}
