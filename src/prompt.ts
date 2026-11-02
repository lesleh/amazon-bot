import { readdir, readFile } from "node:fs/promises";

const PROMPTS_DIR = new URL("../prompts/", import.meta.url);

export interface PromptValues {
  budget: number;
  candidates: number;
}

export async function loadInstructions(
  { budget, candidates }: PromptValues,
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
    .replaceAll("{{candidates}}", String(candidates));
  return [filled, ...categories].map((part) => part.trim()).join("\n\n");
}
