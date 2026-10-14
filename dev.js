// Local dev server — no dependencies, no Vercel CLI needed.
//   npm run dev  →  http://localhost:3000
//
// Serves public/ and runs api/register.js exactly as Vercel would.
// If GOOGLE_SCRIPT_URL is set (in .env.local or the shell), submissions go to your
// real Google Sheet. Otherwise a mock "Apps Script" writes them to local-sheet/*.csv.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from './api/register.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

// Load .env.local if present.
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env.local */ }

const useMock = !process.env.GOOGLE_SCRIPT_URL;
if (useMock) {
  process.env.SHARED_SECRET ||= 'local-dev-secret';
  process.env.GOOGLE_SCRIPT_URL = `http://localhost:${PORT}/__mock-apps-script`;
}

// ── Mock Apps Script: mirrors apps-script/Code.gs, writing CSV instead of Sheet rows ──
const SHEET_DIR = path.join(ROOT, 'local-sheet');
const csv = (row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
function appendCsv(file, headers, rows) {
  fs.mkdirSync(SHEET_DIR, { recursive: true });
  const p = path.join(SHEET_DIR, file);
  if (!fs.existsSync(p)) fs.writeFileSync(p, csv(headers));
  fs.appendFileSync(p, rows.map(csv).join(''));
}
function mockAppsScript(body) {
  if (body.secret !== process.env.SHARED_SECRET) return { ok: false, error: 'Unauthorised.' };
  const r = body.registration;
  const reference = 'SO26-' + Math.random().toString(16).slice(2, 8).toUpperCase();
  const roster = [r.captain, ...r.players];
  const teamsPath = path.join(SHEET_DIR, 'Teams.csv');
  const existing = fs.existsSync(teamsPath) ? fs.readFileSync(teamsPath, 'utf8').toLowerCase() : '';
  const duplicate = existing.includes(`"${r.university.toLowerCase()}","${r.sportName.toLowerCase()}"`);
  const teamList = roster.map((p, i) => `${i + 1}. ${p.name} / ${p.collegeId} / ${p.idNumber}${p.idType === 'passport' ? ' (passport)' : ''}`).join('\n');
  appendCsv('Teams.csv',
    ['Submitted at', 'Reference', 'University', 'Sport', 'Coordinator name', 'Coordinator mobile', 'Coordinator email', 'Captain name', 'Captain mobile', 'Captain email', 'Players (incl. captain)', 'Team list', 'Possible duplicate'],
    [[new Date().toISOString(), reference, r.university, r.sportName, r.coordinator.name, r.coordinator.phone, r.coordinator.email, r.captain.name, r.captain.phone, r.captain.email, roster.length, teamList, duplicate ? 'YES' : '']]);
  appendCsv('Players.csv',
    ['Reference', 'University', 'Sport', '#', 'Role', 'Full name', 'College ID', 'ID type', 'ID number'],
    roster.map((p, i) => [reference, r.university, r.sportName, i + 1, i === 0 ? 'Captain' : 'Player', p.name, p.collegeId, p.idType === 'passport' ? 'Passport' : 'Emirates ID', p.idNumber]));
  console.log(`  ✓ saved ${reference} — ${r.university} / ${r.sportName} (${roster.length} players)`);
  return { ok: true, reference, duplicate };
}

const readBody = (req) => new Promise((resolve) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => resolve(b));
});

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/__mock-apps-script' && useMock) {
    const out = mockAppsScript(JSON.parse(await readBody(req)));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(out));
  }

  if (url.pathname === '/api/register') {
    const raw = await readBody(req);
    let body = raw;
    try { body = JSON.parse(raw); } catch { /* handler rejects it */ }
    // Minimal shim of Vercel's req/res helpers.
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (j) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(j)); return res; };
    return handler(Object.assign(req, { body }), res);
  }

  const file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`\n  SportOasis registration → http://localhost:${PORT}`);
  console.log(useMock
    ? `  Mock mode: submissions are written to ${path.relative(process.cwd(), SHEET_DIR) || '.'}/Teams.csv and Players.csv\n`
    : `  Live mode: submissions go to ${process.env.GOOGLE_SCRIPT_URL}\n`);
});
