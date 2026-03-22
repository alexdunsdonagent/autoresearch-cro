// Serves template.html locally so Puppeteer + Lighthouse can score it
import express from 'express';
import { readFileSync } from 'fs';

const PORT = 3456;
const app = express();

app.get('/', (_req, res) => {
  const html = readFileSync('template.html', 'utf8');
  res.type('html').send(html);
});

app.listen(PORT, () => {
  console.log(`Serving template at http://localhost:${PORT}`);
});

export default PORT;
