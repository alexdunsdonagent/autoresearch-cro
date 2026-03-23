#!/usr/bin/env node

// Promotes a winning variant to become the new baseline
//
// Usage:
//   node promote.mjs variant-a

import { copyFileSync, writeFileSync, existsSync } from 'fs';

const TEMPLATE = 'template.html';
const VARIANTS_DIR = 'variants';
const TRACKING_FILE = 'tracking/clicks.jsonl';
const BASELINE_FILE = 'baseline.json';

const variantName = process.argv[2];

if (!variantName) {
  console.error('Usage: node promote.mjs <variant-name>');
  console.error('Example: node promote.mjs variant-a');
  process.exit(1);
}

const variantFile = `${VARIANTS_DIR}/${variantName}.html`;

if (!existsSync(variantFile)) {
  console.error(`Variant not found: ${variantFile}`);
  console.error('Available variants:');
  const { readdirSync } = await import('fs');
  const files = readdirSync(VARIANTS_DIR).filter(f => f.endsWith('.html'));
  files.forEach(f => console.error(`  ${f.replace('.html', '')}`));
  process.exit(1);
}

// Promote: copy variant to template.html
copyFileSync(variantFile, TEMPLATE);
console.log(`✅ Promoted ${variantName} → ${TEMPLATE}`);

// Clear tracking data
if (existsSync(TRACKING_FILE)) {
  writeFileSync(TRACKING_FILE, '');
  console.log('🗑️  Cleared tracking data');
}

// Reset baseline
if (existsSync(BASELINE_FILE)) {
  writeFileSync(BASELINE_FILE, JSON.stringify({ promoted: variantName, timestamp: new Date().toISOString() }, null, 2));
  console.log('📊 Reset baseline');
}

console.log(`\nDone. ${variantName} is now the baseline. Run generate.mjs to create new variants.`);
