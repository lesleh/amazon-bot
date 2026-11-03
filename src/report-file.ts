import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const REPORTS_DIR = new URL("../reports/", import.meta.url);

const pad = (n: number) => String(n).padStart(2, "0");

// Dated and named after the request, so reports sort by time and never overwrite each other.
export function reportFileName(request: string, date: Date): string {
  const slug =
    request
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60)
      .replace(/-$/, "") || "report";
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${stamp}-${slug}.html`;
}

export async function saveReport(
  html: string,
  request: string,
  date: Date,
  dir: URL = REPORTS_DIR,
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = fileURLToPath(new URL(reportFileName(request, date), dir));
  await writeFile(path, html);
  return path;
}

const OPENERS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ["open"],
  linux: ["xdg-open"],
  win32: ["cmd", "/c", "start", ""],
};

// Returns false when this platform has no known way to open a file.
export function openInBrowser(path: string): boolean {
  const opener = OPENERS[process.platform];
  if (!opener) return false;
  const [command = "", ...args] = opener;
  spawn(command, [...args, path], { detached: true, stdio: "ignore" }).unref();
  return true;
}
