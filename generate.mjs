#!/usr/bin/env node

// AutoResearch CRO — Batch variant generator
//
// Usage:
//   node generate.mjs                    # generate 10 variants, keep top 5
//   node generate.mjs --count 20 --top 5 # generate 20, keep top 5
//   node generate.mjs --count 3 --top 3  # generate 3, keep all

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, copyFileSync } from 'fs';
import { spawn } from 'child_process';
import { scoreTemplate } from './score.mjs';

const TEMPLATE = 'template.html';
const VARIANTS_DIR = 'variants';
const MANIFEST_FILE = 'manifest.json';
const PROGRAM = readFileSync('program-generate.md', 'utf8');

const STRATEGIES = [
  'urgency-focused',
  'social-proof-heavy',
  'minimal-design',
  'price-anchored',
  'image-first',
  'mobile-card',
  'feature-led',
  'location-led',
  'comparison-style',
  'storytelling',
  'bold-cta',
  'trust-first',
  'single-scroll',
  'split-layout',
  'dark-theme',
];

// --- Parse CLI args ---
const args = process.argv.slice(2);
const count = args.includes('--count')
  ? parseInt(args[args.indexOf('--count') + 1], 10)
  : 10;
const top = args.includes('--top')
  ? parseInt(args[args.indexOf('--top') + 1], 10)
  : 5;

// --- Start the local server ---
function startServer() {
  const server = spawn('node', ['server.mjs'], { stdio: 'pipe' });
  return new Promise((resolve) => {
    server.stdout.on('data', () => resolve(server));
    setTimeout(() => resolve(server), 1500);
  });
}

// --- Generate a variant using Ollama ---
async function generateVariant(baselineHTML, strategy, retries = 3) {
  const { default: ollama } = await import('ollama');
  const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

  const prompt = `${PROGRAM}

## Diversity strategy for this variant: ${strategy}

## Current baseline HTML:
${baselineHTML}

---

Generate a RADICALLY DIFFERENT variant following the "${strategy}" strategy.

Return ONLY a JSON object with exactly these keys:
{
  "strategy": "${strategy}",
  "variant_name": "a short descriptive name",
  "html": "the COMPLETE HTML document (<!DOCTYPE html> to </html>)"
}

The HTML must be a complete, standalone page. Not a snippet. Include all CSS inline in a <style> tag.`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ollama.chat({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        format: 'json',
      });

      const parsed = JSON.parse(response.message.content);

      if (!parsed.html || typeof parsed.html !== 'string') {
        throw new Error(`Missing "html" key (got keys: ${Object.keys(parsed).join(', ')})`);
      }
      if (!parsed.html.includes('<!DOCTYPE') && !parsed.html.includes('<html')) {
        throw new Error('Response does not look like a complete HTML document');
      }
      if (!parsed.html.includes('data-clickout')) {
        throw new Error('Missing data-clickout attribute on CTA — required for scoring');
      }

      return {
        strategy: parsed.strategy || strategy,
        variant_name: parsed.variant_name || strategy,
        html: parsed.html,
      };
    } catch (err) {
      console.error(`    Attempt ${attempt}/${retries}: ${err.message}`);
      if (attempt === retries) throw new Error(`Failed after ${retries} attempts: ${err.message}`);
    }
  }
}

// --- Score a variant by temporarily writing it to template.html ---
async function scoreVariant(html) {
  const original = readFileSync(TEMPLATE, 'utf8');
  try {
    writeFileSync(TEMPLATE, html);
    await new Promise(r => setTimeout(r, 500)); // let server pick up new file
    return await scoreTemplate();
  } finally {
    writeFileSync(TEMPLATE, original); // always restore
  }
}

// --- Main ---
async function main() {
  console.log('🔬 AutoResearch CRO — Variant Generator');
  console.log('='.repeat(50));
  console.log(`Generating ${count} variants, keeping top ${top}\n`);

  // Ensure variants dir exists
  if (!existsSync(VARIANTS_DIR)) mkdirSync(VARIANTS_DIR);

  // Start server for Puppeteer scoring
  const server = await startServer();
  console.log('Server running on :3456\n');

  const baselineHTML = readFileSync(TEMPLATE, 'utf8');

  // Copy baseline as control
  writeFileSync(`${VARIANTS_DIR}/control.html`, baselineHTML);

  // Score control
  console.log('Scoring control (baseline)...');
  const controlScore = await scoreTemplate();
  console.log(`Control score: ${controlScore.composite}/100\n`);

  // Pick strategies (shuffle and cycle if count > strategies.length)
  const shuffled = [...STRATEGIES].sort(() => Math.random() - 0.5);
  const pickedStrategies = [];
  for (let i = 0; i < count; i++) {
    pickedStrategies.push(shuffled[i % shuffled.length]);
  }

  // Generate variants
  const variants = [{
    name: 'control',
    file: 'control.html',
    strategy: 'baseline',
    syntheticScore: controlScore.composite,
    signals: controlScore.signals,
  }];

  for (let i = 0; i < count; i++) {
    const strategy = pickedStrategies[i];
    const letter = String.fromCharCode(97 + i); // a, b, c, ...
    const variantId = `variant-${letter}`;

    console.log(`--- Variant ${i + 1}/${count}: ${strategy} ---`);

    try {
      console.log('  Generating...');
      const result = await generateVariant(baselineHTML, strategy);
      console.log(`  Name: ${result.variant_name}`);

      // Save variant
      const filename = `${variantId}.html`;
      writeFileSync(`${VARIANTS_DIR}/${filename}`, result.html);

      // Score it
      console.log('  Scoring...');
      const score = await scoreVariant(result.html);
      console.log(`  Score: ${score.composite}/100`);

      variants.push({
        name: variantId,
        file: filename,
        strategy: result.strategy,
        variantName: result.variant_name,
        syntheticScore: score.composite,
        signals: score.signals,
      });

      console.log('');
    } catch (err) {
      console.error(`  Failed: ${err.message}\n`);
    }
  }

  // Sort by score (descending), keep control + top N
  const sorted = variants
    .filter(v => v.name !== 'control')
    .sort((a, b) => b.syntheticScore - a.syntheticScore);

  const kept = sorted.slice(0, top);
  const removed = sorted.slice(top);

  // Delete removed variants
  for (const v of removed) {
    const path = `${VARIANTS_DIR}/${v.file}`;
    if (existsSync(path)) unlinkSync(path);
  }

  // Write manifest
  const manifest = {
    generated: new Date().toISOString(),
    baseline: 'control',
    controlScore: controlScore.composite,
    variants: [variants[0], ...kept],
    removed: removed.map(v => ({ name: v.name, strategy: v.strategy, score: v.syntheticScore })),
  };
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

  // Summary
  console.log('='.repeat(50));
  console.log(`Generated ${variants.length - 1} variants, keeping top ${kept.length}:\n`);
  console.log('  Control:', controlScore.composite, '/100');
  for (const v of kept) {
    const diff = v.syntheticScore - controlScore.composite;
    const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
    console.log(`  ${v.name} (${v.strategy}): ${v.syntheticScore}/100 (${diffStr})`);
  }
  if (removed.length > 0) {
    console.log(`\n  Removed ${removed.length} lower-scoring variants.`);
  }
  console.log(`\nManifest written to ${MANIFEST_FILE}`);
  console.log(`Variants in ${VARIANTS_DIR}/`);

  server.kill();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
