# Amazon bot

A command line agent that searches amazon.co.uk for something you want to buy. It checks the reviews, price and seller of the top results, then recommends one. It only considers products available with Prime.

It uses the Vercel AI SDK with Claude, gets Amazon data from [Canopy API](https://canopyapi.co) and checks brands with web search.

## Setup

You need Node 24 or later.

1. Run `npm install`.
2. Copy `.env.example` to `.env`.
3. Add your Anthropic and Canopy API keys to `.env`.

## Usage

```sh
npm run shop -- "a cordless drill for light DIY, under £80"
```

The report goes to standard output. Progress and request counts go to standard error.

Options:

- `--budget <n>`: the maximum number of Canopy requests for one run (default 15). The free Canopy plan allows 100 a month.
- `--model <id>`: the Claude model to use (default `claude-haiku-5-5`)

## Category checks

The agent's instructions are in `prompts/instructions.md`. To add checks for a type of product, add a Markdown file to `prompts/categories/`. The agent reads every file in that folder and applies the one that matches the product.

## Development

```sh
npm test
npm run typecheck
npm run lint
```
