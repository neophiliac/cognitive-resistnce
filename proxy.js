// proxy.js — serves the static site and proxies /api/claude to Anthropic
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('Set ANTHROPIC_API_KEY before starting the proxy.');
  process.exit(1);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/claude') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const upstream = https.request(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'anthropic-version': '2023-06-01'
          }
        },
        (upRes) => {
          res.writeHead(upRes.statusCode, { 'Content-Type': 'application/json' });
          upRes.pipe(res);
        }
      );
      upstream.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
      upstream.end(body);
    });
    return;
  }

  // static file serving for everything else
  const file = req.url === '/' ? '/cognitive-resistance.html' : req.url;
  const filePath = path.join(__dirname, decodeURIComponent(file.split('?')[0]));
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Serving + proxying on http://localhost:${PORT}`));
