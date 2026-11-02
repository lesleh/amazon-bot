# Amazon bot

A command line agent that searches amazon.co.uk for something you want to buy. It checks the reviews, price and seller of the top results, then recommends one. It only considers products available with Prime.

It uses the Vercel AI SDK with Claude, gets Amazon data from [Canopy API](https://canopyapi.co) and checks brands with web search.

## Setup

You need Node 24 or later. By default the agent runs through Claude Code, so you also need Claude Code installed and signed in.

1. Run `pnpm install`.
2. Copy `.env.example` to `.env`.
3. Add your Canopy API key to `.env`. Add an Anthropic API key only if you use `--provider anthropic`.

## Usage

```sh
pnpm shop "a cordless drill for light DIY, under £80"
```

The report goes to standard output. Progress and request counts go to standard error.

Options:

- `--budget <n>`: the maximum number of Canopy requests for one run (default 15). The free Canopy plan allows 100 a month.
- `--provider <name>`: `claude-code` (default) uses your Claude Code sign-in. `anthropic` uses the Anthropic API and needs `ANTHROPIC_API_KEY`.
- `--model <id>`: the Claude model to use (default Haiku: `haiku` for Claude Code, `claude-haiku-5-5` for the Anthropic API)

## Category checks

The agent's instructions are in `prompts/instructions.md`. To add checks for a type of product, add a Markdown file to `prompts/categories/`. The agent reads every file in that folder and applies the one that matches the product.

## Development

```sh
pnpm test
pnpm typecheck
pnpm lint
```
