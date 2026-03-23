#!/usr/bin/env node

// Measures real A/B test results from tracking data
//
// Usage:
//   node measure.mjs                  # show results
//   node measure.mjs --min-views 100  # require 100 views per variant for significance

import { readFileSync, writeFileSync, existsSync } from 'fs';

const TRACKING_FILE = 'tracking/clicks.jsonl';
const RESULTS_FILE = 'measure-results.json';

// --- Parse CLI args ---
const args = process.argv.slice(2);
const minViews = args.includes('--min-views')
  ? parseInt(args[args.indexOf('--min-views') + 1], 10)
  : 30;

// --- Chi-squared test (2x2 contingency table) ---
function chiSquared(clickedA, totalA, clickedB, totalB) {
  const notClickedA = totalA - clickedA;
  const notClickedB = totalB - clickedB;
  const total = totalA + totalB;
  const totalClicked = clickedA + clickedB;
  const totalNotClicked = notClickedA + notClickedB;

  // Expected values
  const eClickedA = (totalA * totalClicked) / total;
  const eNotClickedA = (totalA * totalNotClicked) / total;
  const eClickedB = (totalB * totalClicked) / total;
  const eNotClickedB = (totalB * totalNotClicked) / total;

  // Avoid division by zero
  if (eClickedA === 0 || eNotClickedA === 0 || eClickedB === 0 || eNotClickedB === 0) {
    return { chi2: 0, significant: false, p_approx: 1 };
  }

  const chi2 =
    ((clickedA - eClickedA) ** 2) / eClickedA +
    ((notClickedA - eNotClickedA) ** 2) / eNotClickedA +
    ((clickedB - eClickedB) ** 2) / eClickedB +
    ((notClickedB - eNotClickedB) ** 2) / eNotClickedB;

  // Critical values for df=1: 3.841 (p=0.05), 6.635 (p=0.01), 10.828 (p=0.001)
  let p_approx;
  if (chi2 >= 10.828) p_approx = 0.001;
  else if (chi2 >= 6.635) p_approx = 0.01;
  else if (chi2 >= 3.841) p_approx = 0.05;
  else p_approx = 1;

  return { chi2: Math.round(chi2 * 100) / 100, significant: chi2 >= 3.841, p_approx };
}

// --- Main ---
function main() {
  if (!existsSync(TRACKING_FILE)) {
    console.log('No tracking data found. Run the server with ?tpl= traffic first.');
    process.exit(0);
  }

  const lines = readFileSync(TRACKING_FILE, 'utf8')
    .split('\n')
    .filter(l => l.trim());

  if (lines.length === 0) {
    console.log('Tracking file is empty.');
    process.exit(0);
  }

  // Aggregate by variant
  const stats = {};
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      const v = event.variant || 'unknown';
      if (!stats[v]) stats[v] = { views: 0, clicks: 0 };
      if (event.event === 'pageview') stats[v].views++;
      if (event.event === 'clickout') stats[v].clicks++;
    } catch {
      // skip malformed lines
    }
  }

  // Calculate conversion rates
  const variants = Object.entries(stats).map(([name, data]) => ({
    name,
    views: data.views,
    clicks: data.clicks,
    rate: data.views > 0 ? data.clicks / data.views : 0,
  }));

  // Sort by conversion rate descending
  variants.sort((a, b) => b.rate - a.rate);

  // Find control
  const control = variants.find(v => v.name === 'control') || variants[variants.length - 1];

  // Print results
  console.log('📊 A/B Test Results');
  console.log('='.repeat(50));
  console.log(`\nMin views for significance: ${minViews}`);
  console.log(`Total events: ${lines.length}\n`);

  console.log('Variant'.padEnd(20), 'Views'.padEnd(8), 'Clicks'.padEnd(8), 'Rate'.padEnd(10), 'vs Control'.padEnd(12), 'Significant');
  console.log('-'.repeat(75));

  const results = {};

  for (const v of variants) {
    const rateStr = (v.rate * 100).toFixed(1) + '%';
    let vsControl = '-';
    let sigStr = '-';

    if (v.name !== control.name && control.rate > 0) {
      const lift = ((v.rate - control.rate) / control.rate) * 100;
      vsControl = (lift > 0 ? '+' : '') + lift.toFixed(1) + '%';

      if (v.views >= minViews && control.views >= minViews) {
        const sig = chiSquared(v.clicks, v.views, control.clicks, control.views);
        sigStr = sig.significant ? `YES (p<${sig.p_approx})` : `no (χ²=${sig.chi2})`;
        results[v.name] = { ...v, lift, ...sig };
      } else {
        sigStr = 'need more data';
        results[v.name] = { ...v, lift, chi2: 0, significant: false, p_approx: 1 };
      }
    } else {
      results[v.name] = { ...v };
    }

    console.log(
      v.name.padEnd(20),
      String(v.views).padEnd(8),
      String(v.clicks).padEnd(8),
      rateStr.padEnd(10),
      vsControl.padEnd(12),
      sigStr,
    );
  }

  // Find winner
  const significantWinners = variants.filter(v =>
    v.name !== control.name &&
    v.views >= minViews &&
    control.views >= minViews &&
    v.rate > control.rate &&
    chiSquared(v.clicks, v.views, control.clicks, control.views).significant
  );

  let winner = null;
  let recommendation = '';

  if (significantWinners.length > 0) {
    winner = significantWinners[0]; // highest rate
    const lift = ((winner.rate - control.rate) / control.rate * 100).toFixed(1);
    recommendation = `${winner.name} outperforms control by +${lift}% relative lift. Promote with: node promote.mjs ${winner.name}`;
    console.log(`\n🏆 WINNER: ${winner.name} (+${lift}% lift, statistically significant)`);
  } else {
    const totalViews = variants.reduce((s, v) => s + v.views, 0);
    if (totalViews < minViews * variants.length) {
      recommendation = `Need more traffic. ${totalViews} total views, need ~${minViews * variants.length} for significance.`;
      console.log(`\n⏳ No winner yet — need more traffic.`);
    } else {
      recommendation = 'No variant significantly outperforms control. Consider generating new variants.';
      console.log(`\n🤷 No significant winner found. Try new variants.`);
    }
  }

  // Save results
  const output = {
    measured: new Date().toISOString(),
    minViews,
    totalEvents: lines.length,
    control: control.name,
    variants: results,
    winner: winner?.name || null,
    recommendation,
  };

  writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2));
  console.log(`\nResults written to ${RESULTS_FILE}`);
}

main();
