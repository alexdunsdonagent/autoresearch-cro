#!/usr/bin/env node

// Generates a markdown experiment report from results/*.json

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';

const RESULTS_DIR = 'results';
const BASELINE_FILE = 'baseline.json';
const REPORT_FILE = 'REPORT.md';

export function generateReport() {
  if (!existsSync(RESULTS_DIR)) return null;

  const files = readdirSync(RESULTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  if (files.length === 0) return null;

  const results = files.map(f => JSON.parse(readFileSync(`${RESULTS_DIR}/${f}`, 'utf8')));
  const baseline = existsSync(BASELINE_FILE)
    ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
    : null;

  const kept = results.filter(r => r.kept);
  const reverted = results.filter(r => !r.kept && !r.error);
  const errors = results.filter(r => r.error);

  const firstTimestamp = results[0]?.timestamp;
  const lastTimestamp = results[results.length - 1]?.timestamp;

  let md = `# Experiment Report — AutoResearch CRO

Generated: ${new Date().toISOString()}

## Overview

| Metric | Value |
|--------|-------|
| Total experiments | ${results.length} |
| Improvements kept | ${kept.length} |
| Reverted | ${reverted.length} |
| Errors | ${errors.length} |
| Success rate | ${results.length > 0 ? ((kept.length / results.length) * 100).toFixed(1) : 0}% |
| Baseline score | ${baseline?.composite || 'N/A'}/100 |
| Final score | ${baseline?.composite || 'N/A'}/100 |
| First experiment | ${firstTimestamp || 'N/A'} |
| Last experiment | ${lastTimestamp || 'N/A'} |

## Subject

\`template.html\` — selfcatering cottage landing page (Meadow View, Keswick)

## Scoring Method

| Signal | Weight | What it measures |
|--------|--------|-----------------|
| LLM judge | 50% | Would a real visitor click the booking button? (1-10) |
| CTA heuristics | 30% | Above fold, tap-friendly, clear text, full-width (0-10) |
| Performance | 20% | Page size, inline CSS, no external JS, viewport meta (0-10) |

## Experiment Results

| # | Hypothesis | LLM | Perf | CTA | Score | vs Baseline | Kept? |
|---|-----------|-----|------|-----|-------|-------------|-------|
`;

  const baselineScore = results.length > 0 ? 90 : 0; // initial baseline from first run

  for (const r of results) {
    if (r.error) {
      md += `| ${r.experiment} | ${r.hypothesis || 'ERROR'} | - | - | - | ERROR | - | - |\n`;
      continue;
    }
    const llm = r.signals?.llm?.score ?? '-';
    const perf = r.signals?.performance?.score ?? '-';
    const cta = r.signals?.cta?.score ?? '-';
    const diff = r.composite - baselineScore;
    const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
    md += `| ${r.experiment} | ${r.hypothesis} | ${llm} | ${perf} | ${cta} | ${r.composite} | ${diffStr} | ${r.kept ? 'Yes' : 'No'} |\n`;
  }

  // Key findings
  md += `\n## Key Findings\n\n`;

  // Group by unique hypotheses to find patterns
  const hypotheses = {};
  for (const r of results) {
    if (r.error) continue;
    const key = r.hypothesis?.toLowerCase().slice(0, 50) || 'unknown';
    if (!hypotheses[key]) hypotheses[key] = [];
    hypotheses[key].push(r);
  }

  let findingNum = 1;
  for (const [, runs] of Object.entries(hypotheses)) {
    const avgScore = runs.reduce((s, r) => s + r.composite, 0) / runs.length;
    const allReverted = runs.every(r => !r.kept);
    const allKept = runs.every(r => r.kept);

    if (allReverted) {
      md += `${findingNum}. **${runs[0].hypothesis}** — Tested ${runs.length}x, all reverted. Avg score: ${avgScore.toFixed(1)}/100 (baseline: ${baselineScore}).\n`;
    } else if (allKept) {
      md += `${findingNum}. **${runs[0].hypothesis}** — Tested ${runs.length}x, all kept. Avg score: ${avgScore.toFixed(1)}/100.\n`;
    } else {
      md += `${findingNum}. **${runs[0].hypothesis}** — Mixed results across ${runs.length} runs. Avg score: ${avgScore.toFixed(1)}/100.\n`;
    }
    findingNum++;
  }

  // LLM reasoning
  md += `\n## LLM Judge Reasoning\n\n`;
  for (const r of results) {
    if (r.error || !r.signals?.llm?.reason) continue;
    md += `- **Experiment ${r.experiment}** (score ${r.signals.llm.score}/10): ${r.signals.llm.reason}\n`;
  }

  // Recommendations
  md += `\n## Recommendations\n\n`;

  const maxLLM = Math.max(...results.filter(r => !r.error).map(r => r.signals?.llm?.score ?? 0));
  const maxCTA = Math.max(...results.filter(r => !r.error).map(r => r.signals?.cta?.score ?? 0));
  const maxPerf = Math.max(...results.filter(r => !r.error).map(r => r.signals?.performance?.score ?? 0));

  if (maxPerf >= 10 && maxCTA >= 10) {
    md += `- Performance and CTA heuristics are maxed out. **Focus future experiments on improving the LLM judge score** (trust signals, urgency, visual hierarchy).\n`;
  }
  if (kept.length === 0) {
    md += `- No improvements found yet. Consider running more experiments to explore a wider range of variables.\n`;
  }
  if (errors.length > 0) {
    md += `- ${errors.length} experiment(s) failed due to errors. Check model reliability.\n`;
  }

  const testedVariables = new Set(results.map(r => r.hypothesis?.split(' ')[0]?.toLowerCase()));
  if (testedVariables.size < 3) {
    md += `- Limited variable diversity — the model is testing the same area repeatedly. Consider nudging it to explore different focus areas.\n`;
  }

  // --- Live A/B Test Results (if tracking data exists) ---
  const MEASURE_FILE = 'measure-results.json';
  const TRACKING_FILE = 'tracking/clicks.jsonl';

  if (existsSync(MEASURE_FILE)) {
    const measure = JSON.parse(readFileSync(MEASURE_FILE, 'utf8'));
    md += `\n## Live A/B Test Results\n\n`;
    md += `Measured: ${measure.measured}\n\n`;

    md += `| Variant | Views | Clicks | Rate | vs Control | Significant |\n`;
    md += `|---------|-------|--------|------|------------|-------------|\n`;

    for (const [name, data] of Object.entries(measure.variants)) {
      const rate = data.rate !== undefined ? (data.rate * 100).toFixed(1) + '%' : '-';
      const lift = data.lift !== undefined ? (data.lift > 0 ? '+' : '') + data.lift.toFixed(1) + '%' : '-';
      const sig = data.significant ? `YES (p<${data.p_approx})` : (data.chi2 ? `no (χ²=${data.chi2})` : '-');
      md += `| ${name} | ${data.views || 0} | ${data.clicks || 0} | ${rate} | ${lift} | ${sig} |\n`;
    }

    if (measure.winner) {
      md += `\n**Winner: ${measure.winner}**\n`;
    }
    md += `\n${measure.recommendation}\n`;
  } else if (existsSync(TRACKING_FILE)) {
    const lines = readFileSync(TRACKING_FILE, 'utf8').split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      md += `\n## Live A/B Test\n\n`;
      md += `Tracking data exists (${lines.length} events) but not yet measured. Run \`node measure.mjs\` to analyse.\n`;
    }
  }

  md += `\n---\n*Generated by AutoResearch CRO report.mjs*\n`;

  writeFileSync(REPORT_FILE, md);
  return REPORT_FILE;
}

// Run standalone
if (process.argv[1]?.endsWith('report.mjs')) {
  const file = generateReport();
  if (file) {
    console.log(`Report written to ${file}`);
  } else {
    console.log('No results to report.');
  }
}
