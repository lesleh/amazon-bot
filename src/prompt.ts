import { readdir, readFile } from "node:fs/promises";

const PROMPTS_DIR = new URL("../prompts/", import.meta.url);
export const PROFILE_FILE = new URL("../profile.md", import.meta.url);

export interface PromptValues {
  budget: number;
  candidates: number;
  searches: number;
}

export async function loadInstructions(
  { budget, candidates, searches }: PromptValues,
  dir: URL = PROMPTS_DIR,
): Promise<string> {
  const base = await readFile(new URL("instructions.md", dir), "utf8");

  const categoriesDir = new URL("categories/", dir);
  const files = (await readdir(categoriesDir))
    .filter((file) => file.endsWith(".md"))
    .sort();
  const categories = await Promise.all(
    files.map((file) => readFile(new URL(file, categoriesDir), "utf8")),
  );

  const filled = base
    .replaceAll("{{budget}}", String(budget))
    .replaceAll("{{candidates}}", String(candidates))
    .replaceAll("{{searches}}", String(searches));
  return [filled, ...categories].map((part) => part.trim()).join("\n\n");
}

// The profile is optional and git-ignored, so a missing file means no profile.
export async function loadProfile(
  file: URL = PROFILE_FILE,
): Promise<string | undefined> {
  try {
    const profile = (await readFile(file, "utf8")).trim();
    return profile || undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function withProfile(request: string, profile?: string): string {
  return profile
    ? `## My household\n\n${profile}\n\n## What I want\n\n${request}`
    : request;
}
