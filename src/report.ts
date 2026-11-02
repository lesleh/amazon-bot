type Part = { type: string; text?: string };

// Claude Code returns the whole tool loop as one step, so narration before tool calls is mixed in.
export function finalReport(content: readonly Part[]): string {
  const lastTool = content.findLastIndex(
    (part) => part.type === "tool-call" || part.type === "tool-result",
  );
  return content
    .slice(lastTool + 1)
    .flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
    .join("")
    .trim();
}
