# AutoResearch CRO — Setup & Run Guide

## What this is

Karpathy-inspired autonomous CRO experiment runner. Tests landing page variations overnight using a local LLM as judge instead of real traffic.

## Architecture

- `run.mjs` — main experiment loop (`--dry`, `--experiments N`, Ctrl+C to stop)
- `score.mjs` — 3-signal scoring: LLM judge via Ollama (50%) + page perf (20%) + CTA Puppeteer checks (30%)
- `template.html` — the ONE file the agent edits
- `program.md` — agent constraints and focus areas
- `server.mjs` — Express on :3456, serves template for Puppeteer
- `results/` — experiment logs (gitignored)

## Prerequisites

- Mac Mini M4 (16 GB RAM)
- Node.js
- Ollama + Qwen 3 8B model

## Install

```bash
# 1. Install Ollama
brew install ollama

# 2. Pull the model (~5 GB)
nohup ollama serve > /dev/null 2>&1 &
ollama pull qwen3:8b

# 3. Install Node dependencies
cd ~/Code/autoresearch-cro
npm install
```

## Run

```bash
# Start Ollama in background
nohup ollama serve > /dev/null 2>&1 &

# Set model
export OLLAMA_MODEL=qwen3:8b

# Score current template once (sanity check)
node run.mjs --dry

# Run experiments overnight
node run.mjs

# Or run fixed number
node run.mjs --experiments 50
```

## Cost

- Electricity: ~9p/night (Mac Mini draws ~40W under AI load)
- API costs: £0 (everything runs locally)
- Disk: ~5 GB for model, delete anytime with `ollama rm qwen3:8b`
