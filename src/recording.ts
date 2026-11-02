import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Fetch = typeof fetch;

function urlOf(input: Parameters<Fetch>[0]): URL {
  return new URL(input instanceof Request ? input.url : String(input));
}

// One file per request, named by endpoint and sorted query, so a replay finds the same file.
export function recordingKey(url: URL): string {
  const params = new URLSearchParams(
    [...url.searchParams].sort(([a], [b]) => a.localeCompare(b)),
  );
  const endpoint = url.pathname
    .replace(/^\/api\/amazon\//, "")
    .replaceAll("/", "_");
  return `${endpoint}--${params}.json`;
}

export function recordingFetch(dir: string, inner: Fetch = fetch): Fetch {
  return async (input, init) => {
    const response = await inner(input, init);
    if (response.ok) {
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, recordingKey(urlOf(input))),
        await response.clone().text(),
      );
    }
    return response;
  };
}

// The model words its search differently from run to run, so a replay falls back to the
// recording's only search. Product lookups must match exactly.
async function onlySearch(dir: string): Promise<string | undefined> {
  const searches = (await readdir(dir)).filter((file) =>
    file.startsWith("search--"),
  );
  return searches.length === 1 ? searches[0] : undefined;
}

export function replayFetch(dir: string): Fetch {
  return async (input) => {
    const key = recordingKey(urlOf(input));
    const fallback = key.startsWith("search--")
      ? await onlySearch(dir)
      : undefined;
    for (const file of [key, fallback]) {
      if (!file) continue;
      try {
        return new Response(await readFile(join(dir, file), "utf8"));
      } catch {
        // Try the next candidate file.
      }
    }
    throw new Error(
      `No recorded response for ${key}. Replays cannot fetch new data, so skip it.`,
    );
  };
}
