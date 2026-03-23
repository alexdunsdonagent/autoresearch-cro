# AutoResearch CRO

Inspired by [Karpathy's AutoResearch](https://github.com/karpathy/autoresearch) — but instead of optimising ML training loss, this optimises **landing page clickout rate**.

An AI agent proposes changes to a landing page, scores them, keeps improvements, reverts failures, and loops overnight. Then you test the best variants with real Google Ads traffic.

## How it works

### Stage 1: Synthetic experiments (overnight)

The AI generates radical landing page variants and scores them using 3 signals:

| Signal | Weight | What it measures |
|--------|--------|-----------------|
| LLM judge | 50% | "Would a real visitor click the booking button?" |
| CTA heuristics | 30% | Above fold, tap-friendly, clear text, full-width (via Puppeteer) |
| Performance | 20% | Page size, inline CSS, no external JS, viewport meta |

```bash
# Generate 15 variants, keep the top 5
node generate.mjs --count 15 --top 5
```

This produces `variants/variant-a.html` through `variant-e.html`, each following a different design strategy (urgency-focused, minimal, social-proof-heavy, dark-theme, etc.).

### Stage 2: Real A/B testing (daytime)

Deploy and let Google Ads split traffic across variants:

```bash
# Start the server
node server.mjs

# Google Ads tracking template:
# {lpurl}?tpl=variant-a
# {lpurl}?tpl=variant-b
# etc.
```

The server:
- Routes `?tpl=variant-a` to the right HTML file
- Tracks pageviews and clickouts to `tracking/clicks.jsonl`
- Uses `navigator.sendBeacon` so clicks are logged even as the user navigates away

### Stage 3: Measure and promote

```bash
# See which variant is winning
node measure.mjs

# When you have a statistically significant winner
node promote.mjs variant-a
```

`measure.mjs` runs a chi-squared significance test. When a variant beats the control at p < 0.05, promote it to become the new baseline and start again.

## Quick start

```bash
# Prerequisites: Ollama running with a model pulled
ollama serve &
ollama pull qwen3:8b

# Install and run
npm install
export OLLAMA_MODEL=qwen3:8b

# Score the current page (sanity check)
node run.mjs --dry

# Generate variants
node generate.mjs --count 10 --top 5

# Start serving with tracking
node server.mjs
```

## All commands

| Command | What it does |
|---------|-------------|
| `node run.mjs --dry` | Score current template once |
| `node run.mjs --experiments 50` | Run N synthetic experiments (incremental changes) |
| `node generate.mjs --count 15 --top 5` | Generate N radical variants, keep top M |
| `node server.mjs` | Serve variants with `?tpl=` routing + click tracking |
| `node measure.mjs --min-views 100` | Chi-squared significance test on real traffic |
| `node promote.mjs variant-a` | Promote winner to new baseline |
| `node report.mjs` | Generate REPORT.md with all results |

## The daily loop

```
NIGHT  →  node generate.mjs --count 15 --top 5
           AI generates radical variants, scores synthetically, keeps the best

DAY    →  node server.mjs + Google Ads traffic
           Real visitors hit ?tpl=variant-a, clicks tracked automatically

EVENING → node measure.mjs
           Chi-squared test declares a winner (or says "need more data")

WINNER  → node promote.mjs variant-a
           Winner becomes new baseline, generate again tomorrow
```

## Stack

- **Ollama** — local LLM (Qwen 3 8B on Mac Mini M4)
- **Puppeteer** — headless Chrome for CTA scoring
- **Express** — serves variants and tracks clicks
- No database, no external services, no npm bloat

## Adapting for other projects

Fork the repo, then change two files:
1. `template.html` — your landing page
2. `program.md` / `program-generate.md` — your constraints and goals

Everything else (scoring, tracking, measurement) works as-is.
