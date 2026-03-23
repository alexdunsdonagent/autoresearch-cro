#!/usr/bin/env node

// AutoResearch CRO — Main experiment loop
//
// Usage:
//   node run.mjs                     # run until stopped (Ctrl+C)
//   node run.mjs --experiments 50    # run exactly 50 experiments
//   node run.mjs --dry               # score current template once, don't loop
//
// Requires:
//   1. Ollama running locally (ollama serve)
//   2. A model pulled (ollama pull llama3.2)
//   3. npm install (for puppeteer, ollama, express)

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { spawn } from 'child_process';
import { scoreTemplate } from './score.mjs';
import { generateReport } from './report.mjs';

const TEMPLATE = 'template.html';
const BASELINE_FILE = 'baseline.json';
const RESULTS_DIR = 'results';
const PROGRAM = readFileSync('program.md', 'utf8');

// --- Parse CLI args ---
const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const maxExperiments = args.includes('--experiments')
  ? parseInt(args[args.indexOf('--experiments') + 1], 10)
  : Infinity;

// --- Ensure results dir exists ---
if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR);

// --- Start the local server ---
function startServer() {
  const server = spawn('node', ['server.mjs'], { stdio: 'pipe' });
  return new Promise((resolve) => {
    server.stdout.on('data', () => resolve(server));
    // Give it a moment to bind
    setTimeout(() => resolve(server), 1500);
  });
}

// --- Load or create baseline ---
function getBaseline() {
  if (existsSync(BASELINE_FILE)) {
    return JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
  }
  return null;
}

function saveBaseline(result, experimentNum) {
  writeFileSync(BASELINE_FILE, JSON.stringify({ ...result, experiment: experimentNum }, null, 2));
}

// --- Save experiment result ---
function saveResult(experimentNum, result, hypothesis, kept) {
  const filename = `${RESULTS_DIR}/${String(experimentNum).padStart(4, '0')}.json`;
  writeFileSync(filename, JSON.stringify({
    experiment: experimentNum,
    timestamp: new Date().toISOString(),
    hypothesis,
    kept,
    ...result,
  }, null, 2));
}

// --- Load recent results for context ---
function recentResults(n = 5) {
  if (!existsSync(RESULTS_DIR)) return [];
  const files = readdirSync(RESULTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .slice(-n);
  return files.map(f => JSON.parse(readFileSync(`${RESULTS_DIR}/${f}`, 'utf8')));
}

// --- Generate a hypothesis and edit template using Ollama ---
async function proposeChange(currentHTML, recentExperiments, baseline, retries = 3) {
  const { default: ollama } = await import('ollama');
  const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

  const prompt = `${PROGRAM}

## Current baseline score: ${baseline?.composite || 'none yet'}

## Recent experiment results:
${JSON.stringify(recentExperiments, null, 2)}

## Current template.html:
${currentHTML}

---

Propose ONE small, focused change to template.html to improve the clickout score.

You MUST return a JSON object with EXACTLY these 3 keys:
{
  "hypothesis": "one sentence describing what you're testing",
  "find": "the exact string in the current HTML to replace (copy-paste it exactly)",
  "replace": "the new string to replace it with"
}

Rules:
- "find" must be an EXACT substring from the current template.html above — copy it precisely
- "replace" is what it gets changed to
- Make ONE small change only
- Do NOT return any other keys`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ollama.chat({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        format: 'json',
      });

      const parsed = JSON.parse(response.message.content);

      if (!parsed.hypothesis || typeof parsed.hypothesis !== 'string') {
        throw new Error('Missing hypothesis');
      }
      if (!parsed.find || typeof parsed.find !== 'string') {
        throw new Error(`Missing "find" key (got keys: ${Object.keys(parsed).join(', ')})`);
      }
      if (!parsed.replace || typeof parsed.replace !== 'string') {
        throw new Error(`Missing "replace" key (got keys: ${Object.keys(parsed).join(', ')})`);
      }
      if (!currentHTML.includes(parsed.find)) {
        throw new Error(`"find" string not found in current HTML: "${parsed.find.slice(0, 80)}..."`);
      }

      // Apply the find/replace to produce new HTML
      const newHTML = currentHTML.replace(parsed.find, parsed.replace);
      if (newHTML === currentHTML) {
        throw new Error('find and replace are identical — no change made');
      }

      return { hypothesis: parsed.hypothesis, new_html: newHTML };
    } catch (err) {
      console.error(`  Attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw new Error(`Model failed after ${retries} attempts: ${err.message}`);
    }
  }
}

// --- Main loop ---
async function main() {
  console.log('🔬 AutoResearch CRO');
  console.log('='.repeat(50));

  const server = await startServer();
  console.log('Server running on :3456\n');

  // Score current template as baseline
  console.log('Scoring baseline...');
  const baselineResult = await scoreTemplate();
  let baseline = getBaseline();

  if (!baseline || dryRun) {
    saveBaseline(baselineResult, 0);
    baseline = { ...baselineResult, experiment: 0 };
    console.log(`Baseline score: ${baselineResult.composite}/100`);
    console.log(JSON.stringify(baselineResult.signals, null, 2));
  }

  if (dryRun) {
    console.log('\n--dry flag set. Exiting.');
    server.kill();
    process.exit(0);
  }

  console.log(`\nStarting experiments (max: ${maxExperiments === Infinity ? '∞' : maxExperiments})...\n`);

  let experimentNum = baseline.experiment || 0;
  const originalHTML = readFileSync(TEMPLATE, 'utf8');
  let currentHTML = originalHTML;

  // Graceful shutdown
  let running = true;
  process.on('SIGINT', () => {
    console.log('\n\nStopping experiments...');
    running = false;
  });

  while (running && experimentNum < maxExperiments) {
    experimentNum++;
    const recent = recentResults(5);

    console.log(`--- Experiment #${experimentNum} ---`);

    try {
      // 1. Ask the LLM to propose a change
      console.log('Generating hypothesis...');
      const proposal = await proposeChange(currentHTML, recent, baseline);
      console.log(`Hypothesis: ${proposal.hypothesis}`);

      // 2. Apply the change
      writeFileSync(TEMPLATE, proposal.new_html);

      // 3. Wait a moment for server to pick up the new file
      await new Promise(r => setTimeout(r, 500));

      // 4. Score it
      console.log('Scoring...');
      const result = await scoreTemplate();
      console.log(`Score: ${result.composite}/100 (baseline: ${baseline.composite}/100)`);

      // 5. Keep or revert
      const improved = result.composite > baseline.composite;
      if (improved) {
        console.log(`✅ KEPT (+${(result.composite - baseline.composite).toFixed(1)} points)`);
        baseline = result;
        currentHTML = proposal.new_html;
        saveBaseline(result, experimentNum);
      } else {
        console.log(`❌ REVERTED (${(result.composite - baseline.composite).toFixed(1)} points)`);
        writeFileSync(TEMPLATE, currentHTML); // revert
      }

      saveResult(experimentNum, result, proposal.hypothesis, improved);
      console.log('');
    } catch (err) {
      console.error(`Experiment #${experimentNum} failed: ${err.message}\n`);
      // Revert on any error
      writeFileSync(TEMPLATE, currentHTML);
      saveResult(experimentNum, { composite: 0, error: err.message }, 'error', false);
    }
  }

  // Summary
  const allResults = recentResults(1000);
  const kept = allResults.filter(r => r.kept);
  console.log('='.repeat(50));
  console.log(`Done. ${allResults.length} experiments, ${kept.length} improvements kept.`);
  console.log(`Final score: ${baseline.composite}/100`);

  // Auto-generate report
  const reportFile = generateReport();
  if (reportFile) console.log(`\nReport written to ${reportFile}`);

  server.kill();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
