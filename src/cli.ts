import { parseArgs } from "node:util";
import type { Warning } from "ai";
import {
  createShopperAgent,
  DEFAULT_MODELS,
  DEFAULT_PROVIDER,
  PROVIDERS,
  type ProviderName,
} from "./agent.ts";
import { createCanopyClient } from "./canopy.ts";
import { loadInstructions } from "./prompt.ts";
import { recordingFetch, replayFetch } from "./recording.ts";
import { finalReport } from "./report.ts";
import { DEFAULT_MAX_CANDIDATES } from "./tools.ts";

const USAGE = `Usage: pnpm shop "<what you want>" [--budget 15] [--provider ${PROVIDERS.join("|")}] [--model <id>] [--record <dir> | --replay <dir>]

Example: pnpm shop "a cordless drill for light DIY, under £80"`;

export interface CliOptions {
  request: string;
  budget: number;
  provider: ProviderName;
  model: string;
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
    options: {
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
    ...(recording && { recording }),
  };
}

// The Claude Code provider warns above 20 turns, but a full run needs more.
function logWarnings({ warnings }: { warnings: Warning[] }): void {
  for (const warning of warnings) {
    const text =
      "message" in warning
        ? warning.message
        : `${warning.type}: ${warning.feature}${warning.details ? ` (${warning.details})` : ""}`;
    if (!text.startsWith("High maxTurns")) console.error(`Warning: ${text}`);
  }
}

function describeCall(toolName: string, input: unknown): string {
  const fields = Object.values(input as Record<string, unknown>).join(", ");
  return `${toolName}(${fields})`;
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

  const canopy = createCanopyClient({
    apiKey,
    budget: options.budget,
    ...(recording && {
      fetch: replaying
        ? replayFetch(recording.dir)
        : recordingFetch(recording.dir),
    }),
  });
  const abort = new AbortController();
  const agent = createShopperAgent({
    canopy,
    instructions: await loadInstructions({
      budget: options.budget,
      candidates: DEFAULT_MAX_CANDIDATES,
    }),
    provider: options.provider,
    modelId: options.model,
    onFatalError: (error) => abort.abort(error),
  });

  let result: Awaited<ReturnType<typeof agent.generate>>;
  try {
    result = await agent.generate({
      prompt: options.request,
      abortSignal: abort.signal,
      onStepEnd: (step) => {
        for (const call of step.toolCalls) {
          console.error(`  ${describeCall(call.toolName, call.input)}`);
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

  console.log(finalReport(result.steps.at(-1)?.content ?? []));
  console.error(
    `\nCanopy requests: ${canopy.requestsUsed} of ${options.budget}${replaying ? " (replayed, none sent)" : ""}. ` +
      `Tokens: ${result.totalUsage.inputTokens ?? "?"} in, ${result.totalUsage.outputTokens ?? "?"} out.`,
  );

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
