export const MAX_WEB_SEARCHES = 6;

// A Claude Code PreToolUse hook. Each web search costs about 1 cent, so refuse any past the limit.
export function webSearchLimitHook(max: number = MAX_WEB_SEARCHES) {
  let used = 0;
  return async () => {
    if (used < max) {
      used++;
      return {};
    }
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `You have used all ${max} web searches. Report on what you have.`,
      },
    };
  };
}
