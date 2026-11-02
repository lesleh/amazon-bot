import { parseArgs } from "node:util";
import { createShopperAgent, DEFAULT_MODEL } from "./agent.ts";
import { createCanopyClient } from "./canopy.ts";
import { loadInstructions } from "./prompt.ts";

const USAGE = `Usage: npm run shop -- "<what you want>" [--budget 15] [--model ${DEFAULT_MODEL}]

Example: npm run shop -- "a cordless drill for light DIY, under £80"`;

export interface CliOptions {
  request: string;
  budget: number;
  model: string;
}

export class UsageError extends Error {}

export function parseCliArgs(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      budget: { type: "string", default: "15" },
      model: { type: "string", default: DEFAULT_MODEL },
    },
  });

  const request = positionals.join(" ").trim();
  if (!request) throw new UsageError("Say what you want to buy.");

  const budget = Number(values.budget);
  if (!Number.isInteger(budget) || budget < 1) {
    throw new UsageError("--budget must be a whole number of 1 or more.");
  }

  return { request, budget, model: values.model };
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

  const apiKey = process.env.CANOPY_API_KEY;
  if (!apiKey) {
    console.error("CANOPY_API_KEY is not set. Add it to .env.");
    return 2;
  }

  const canopy = createCanopyClient({ apiKey, budget: options.budget });
  const agent = createShopperAgent({
    canopy,
    instructions: await loadInstructions(options.budget),
    modelId: options.model,
  });

  const result = await agent.generate({
    prompt: options.request,
    onStepEnd: (step) => {
      for (const call of step.toolCalls) {
        console.error(`  ${describeCall(call.toolName, call.input)}`);
      }
    },
  });

  console.log(result.text);
  console.error(
    `\nCanopy requests: ${canopy.requestsUsed} of ${options.budget}. ` +
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
  process.exitCode = await main();
}
