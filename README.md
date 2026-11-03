# Amazon bot

A command line agent that searches amazon.co.uk for something you want to buy. It checks the reviews, price and seller of the top results, reads the listing images when the text leaves out a fact it needs, then recommends one. It only considers products available with Prime.

It uses the Vercel AI SDK with Claude, gets Amazon data from [Canopy API](https://canopyapi.co) and checks brands with web search. Each web search costs about 1 cent, so a run makes at most 6.

## Setup

You need Node 24 or later. By default the agent runs through Claude Code, so you also need Claude Code installed and signed in.

1. Run `pnpm install`.
2. Copy `.env.example` to `.env`.
3. Add your Canopy API key to `.env`. Add an Anthropic API key only if you use `--provider anthropic`.

## Usage

```sh
pnpm shop "a cordless drill for light DIY, under £80"
```

The agent saves its report as an HTML page in `reports/` and opens it in your browser. The page shows the recommended product, a side-by-side comparison of the candidates, the red flags for each one and the sources. The terminal shows the recommendation in one sentence, the path to the page, and progress and request counts. The `reports/` folder is not committed.

Options:

- `--budget <n>`: the maximum number of Canopy requests for one run (default 15). The free Canopy plan allows 100 a month.
- `--provider <name>`: `claude-code` (default) uses your Claude Code sign-in. `anthropic` uses the Anthropic API and needs `ANTHROPIC_API_KEY`.
- `--no-open`: save the report without opening it.
- `--model <id>`: the Claude model to use (default `claude-haiku-5-5`). Use full model IDs: through Claude Code, aliases such as `haiku` can resolve to an older model.

## Household profile

To give the agent facts about your household with every request, copy `profile.example.md` to `profile.md` and edit it. For example, the number of pets changes how long a bag of food lasts. When the profile and your request disagree, the agent follows the request. `profile.md` is not committed.

## Recording and replay

Each Canopy request costs money, so you can record a run once and replay it while you change the prompt:

```sh
pnpm shop "dry cat food for an adult cat" --record recordings/cat-food
pnpm shop "dry cat food for an adult cat" --replay recordings/cat-food
```

A replay sends no Canopy requests. If the agent asks for something the recording does not have, it gets an error and moves on. The `recordings/` folder is not committed.

## Category checks

The agent's instructions are in `prompts/instructions.md`. To add checks for a type of product, add a Markdown file to `prompts/categories/`. The agent reads every file in that folder and applies the one that matches the product.

## Development

```sh
pnpm test
pnpm typecheck
pnpm lint
```
