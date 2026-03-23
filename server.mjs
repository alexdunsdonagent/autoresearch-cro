// Serves landing page variants with clickout tracking
import express from 'express';
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';

const PORT = 3456;
const TRACKING_DIR = 'tracking';
const TRACKING_FILE = `${TRACKING_DIR}/clicks.jsonl`;
const VARIANTS_DIR = 'variants';

const app = express();

// Ensure directories exist
if (!existsSync(TRACKING_DIR)) mkdirSync(TRACKING_DIR);
if (!existsSync(VARIANTS_DIR)) mkdirSync(VARIANTS_DIR);

// Tracking script injected before </body>
const trackingScript = `<script>
document.querySelectorAll('[data-clickout="true"]').forEach(function(el) {
  el.addEventListener('click', function() {
    var variant = new URLSearchParams(location.search).get('tpl') || 'control';
    navigator.sendBeacon('/track', JSON.stringify({variant: variant, event: 'clickout', timestamp: new Date().toISOString()}));
  });
});
</script>`;

// --- Serve landing page variants ---
app.get('/', (req, res) => {
  const tpl = req.query.tpl;
  let html;

  if (tpl) {
    // Try to serve from variants directory
    const variantFile = `${VARIANTS_DIR}/${tpl}.html`;
    if (existsSync(variantFile)) {
      html = readFileSync(variantFile, 'utf8');
    } else {
      // Fallback to template.html
      html = readFileSync('template.html', 'utf8');
    }
  } else {
    // No tpl param — serve template.html (backward compatible with run.mjs/score.mjs)
    html = readFileSync('template.html', 'utf8');
  }

  // Log pageview (only for real traffic with tpl param, not Puppeteer scoring)
  if (tpl) {
    const line = JSON.stringify({
      variant: tpl,
      event: 'pageview',
      timestamp: new Date().toISOString(),
      ua: req.headers['user-agent'] || '',
    });
    appendFileSync(TRACKING_FILE, line + '\n');
  }

  // Inject tracking script for real traffic
  if (tpl && html.includes('</body>')) {
    html = html.replace('</body>', trackingScript + '</body>');
  }

  res.type('html').send(html);
});

// --- Clickout tracking endpoint ---
app.post('/track', express.text({ type: '*/*' }), (req, res) => {
  try {
    const data = JSON.parse(req.body);
    const line = JSON.stringify({
      variant: data.variant || 'unknown',
      event: data.event || 'clickout',
      timestamp: data.timestamp || new Date().toISOString(),
      ua: req.headers['user-agent'] || '',
    });
    appendFileSync(TRACKING_FILE, line + '\n');
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'invalid JSON' });
  }
});

app.listen(PORT, () => {
  console.log(`Serving template at http://localhost:${PORT}`);
});

export default PORT;
