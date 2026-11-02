import { mkdir, readFile, writeFile } from "node:fs/promises";
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

export function replayFetch(dir: string): Fetch {
  return async (input) => {
    const key = recordingKey(urlOf(input));
    try {
      return new Response(await readFile(join(dir, key), "utf8"));
    } catch {
      throw new Error(
        `No recorded response for ${key}. Replays cannot fetch new data, so skip it.`,
      );
    }
  };
}
