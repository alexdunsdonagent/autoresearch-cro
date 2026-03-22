// Scores template.html using 3 signals:
// 1. LLM judge (Ollama local model) — 50%
// 2. Page size / performance heuristics — 20%
// 3. CTA placement & visibility heuristics (Puppeteer) — 30%

import { readFileSync } from 'fs';
import ollama from 'ollama';
import puppeteer from 'puppeteer';

const TEMPLATE = 'template.html';
const SERVER_URL = 'http://localhost:3456';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

// --- Signal 1: LLM Judge (0-10) ---
async function scoreLLM(html) {
  const prompt = `You are evaluating a UK holiday cottage landing page for clickout conversion.

A "clickout" means the visitor clicks through to the booking provider's site. This is the ONLY goal.

Score this page from 1 to 10 on how likely a real visitor searching for a holiday cottage would click the booking button. Consider:

1. Is the CTA (Call to Action) button clearly visible and above the fold?
2. Can the visitor see the price without scrolling?
3. Are there trust signals (ratings, reviews, provider name)?
4. Does the visual hierarchy guide the eye toward the CTA?
5. Is key info (sleeps, bedrooms, location) easy to scan?
6. Would this work well on mobile?

Return ONLY a JSON object: {"score": <number 1-10>, "reason": "<one sentence>"}

HTML:
${html}`;

  try {
    const response = await ollama.chat({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      format: 'json',
    });
    const parsed = JSON.parse(response.message.content);
    return { score: Math.min(10, Math.max(1, parsed.score)), reason: parsed.reason };
  } catch (err) {
    console.error('LLM scoring failed:', err.message);
    return { score: 5, reason: 'LLM unavailable — default score' };
  }
}

// --- Signal 2: Page size & performance heuristics (0-10) ---
function scorePerformance(html) {
  const sizeKB = Buffer.byteLength(html, 'utf8') / 1024;
  const reasons = [];

  // Smaller pages load faster — penalise over 100KB
  let sizeScore = 10;
  if (sizeKB > 200) sizeScore = 2;
  else if (sizeKB > 150) sizeScore = 4;
  else if (sizeKB > 100) sizeScore = 6;
  else if (sizeKB > 50) sizeScore = 8;
  reasons.push(`${sizeKB.toFixed(1)}KB`);

  // Check for inline CSS (good — no extra request)
  const hasInlineCSS = html.includes('<style>');
  const cssScore = hasInlineCSS ? 10 : 6;
  if (!hasInlineCSS) reasons.push('no inline CSS');

  // Check for external JS (bad — blocks render)
  const externalJS = (html.match(/<script[^>]+src=/g) || []).length;
  const jsScore = externalJS === 0 ? 10 : Math.max(2, 10 - externalJS * 3);
  if (externalJS > 0) reasons.push(`${externalJS} external scripts`);

  // Viewport meta tag (essential for mobile)
  const hasViewport = html.includes('viewport');
  const vpScore = hasViewport ? 10 : 2;
  if (!hasViewport) reasons.push('missing viewport');

  const score = (sizeScore * 0.4) + (cssScore * 0.2) + (jsScore * 0.2) + (vpScore * 0.2);
  return { score: Math.round(score * 10) / 10, reason: reasons.join(', ') || 'clean & fast' };
}

// --- Signal 3: CTA heuristics via Puppeteer (0-10) ---
async function scoreCTA() {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812 }); // iPhone-sized
    await page.goto(SERVER_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });

    const ctaData = await page.evaluate(() => {
      const ctas = document.querySelectorAll('[data-clickout="true"]');
      if (ctas.length === 0) return { found: false };

      const first = ctas[0];
      const rect = first.getBoundingClientRect();
      const style = window.getComputedStyle(first);
      const bg = style.backgroundColor;
      const color = style.color;
      const fontSize = parseFloat(style.fontSize);

      return {
        found: true,
        count: ctas.length,
        aboveFold: rect.top < window.innerHeight,
        top: rect.top,
        width: rect.width,
        viewportWidth: window.innerWidth,
        height: rect.height,
        fontSize,
        text: first.textContent.trim(),
        bg,
        color,
      };
    });

    if (!ctaData.found) {
      return { score: 0, reason: 'no CTA button found' };
    }

    const reasons = [];
    let score = 5; // baseline

    // Above the fold?
    if (ctaData.aboveFold) { score += 2; reasons.push('above fold'); }
    else { score -= 2; reasons.push('below fold'); }

    // Full width on mobile?
    const widthRatio = ctaData.width / ctaData.viewportWidth;
    if (widthRatio > 0.8) { score += 1; reasons.push('full-width CTA'); }

    // Big enough to tap?
    if (ctaData.height >= 44) { score += 1; reasons.push('tap-friendly'); }
    else { score -= 1; reasons.push('too small to tap'); }

    // Has clear action text?
    const actionWords = ['book', 'check', 'availability', 'reserve', 'view'];
    const hasAction = actionWords.some(w => ctaData.text.toLowerCase().includes(w));
    if (hasAction) { score += 1; reasons.push(`clear CTA text: "${ctaData.text}"`); }
    else { reasons.push('vague CTA text'); }

    // Multiple CTAs?
    if (ctaData.count >= 2) { score += 0.5; reasons.push(`${ctaData.count} CTAs`); }

    return { score: Math.min(10, Math.max(0, score)), reason: reasons.join(', ') };
  } catch (err) {
    console.error('CTA scoring failed:', err.message);
    return { score: 5, reason: 'Puppeteer unavailable — default score' };
  } finally {
    if (browser) await browser.close();
  }
}

// --- Combined score ---
export async function scoreTemplate() {
  const html = readFileSync(TEMPLATE, 'utf8');

  const [llm, perf, cta] = await Promise.all([
    scoreLLM(html),
    scorePerformance(html),
    scoreCTA(),
  ]);

  // Weighted composite: LLM 50%, Perf 20%, CTA 30%
  const composite = (llm.score * 5) + (perf.score * 2) + (cta.score * 3);
  // composite is 0-100

  return {
    composite: Math.round(composite * 10) / 10,
    signals: {
      llm: { score: llm.score, weight: '50%', reason: llm.reason },
      performance: { score: perf.score, weight: '20%', reason: perf.reason },
      cta: { score: cta.score, weight: '30%', reason: cta.reason },
    },
  };
}

// Run standalone
if (process.argv[1].endsWith('score.mjs')) {
  const result = await scoreTemplate();
  console.log(JSON.stringify(result, null, 2));
}
