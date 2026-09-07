// Pay-per-call HTTP API paid in Nano. No accounts, no keys.
// Flow: call an endpoint -> 402 with price and address -> send Nano -> retry with
// header X-Nano-Payment: <send block hash>. Overpayment stays as credit on that hash.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const site = require('./site');

const PORT = Number(process.env.PORT || 3000);
const RPC = process.env.NANO_RPC || 'http://127.0.0.1:7076';
const ADDRESS = 'nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue';
const PRICE_RAW = 10n ** 27n;                // 0.001 NANO per call
const MAX_CREDIT_RAW = 10n ** 30n;           // ignore sends above 1 NANO (tranches are not credit)
const NOT_BEFORE = Number(process.env.NOT_BEFORE || 1757210000); // unix time service went live
const DATA = path.join(__dirname, 'data', 'credits.json');
const RAW_PER_NANO = 10n ** 30n;

let credits = {};
try { credits = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch {}
const save = () => fs.writeFileSync(DATA, JSON.stringify(credits));
const stats = { calls_paid: 0, calls_402: 0, started: new Date().toISOString() };

async function rpc(body) {
  const r = await fetch(RPC, { method: 'POST', body: JSON.stringify(body) });
  return r.json();
}

// Look up a send block hash and turn it into credit (once).
async function creditFor(hash) {
  if (!/^[0-9A-F]{64}$/i.test(hash)) return { error: 'bad hash' };
  hash = hash.toUpperCase();
  if (hash in credits) return { remaining: BigInt(credits[hash]) };
  const b = await rpc({ action: 'block_info', json_block: 'true', hash });
  if (b.error) return { error: 'block not found on this node yet; wait a second and retry' };
  if (b.confirmed !== 'true') return { error: 'block not confirmed yet; retry shortly' };
  if (b.subtype !== 'send' || b.contents.link_as_account !== ADDRESS)
    return { error: 'not a send to ' + ADDRESS };
  if (Number(b.local_timestamp) < NOT_BEFORE) return { error: 'block predates this service' };
  const amount = BigInt(b.amount);
  if (amount > MAX_CREDIT_RAW) return { error: 'send too large to be a payment; max 1 NANO per hash' };
  credits[hash] = amount.toString();
  save();
  return { remaining: amount };
}

function nano(raw) { return (Number(raw) / 1e30).toString(); }

function send(res, code, body, type = 'application/json') {
  const data = typeof body === 'string' ? body : JSON.stringify(body, null, 1);
  res.writeHead(code, { 'content-type': type + '; charset=utf-8', 'access-control-allow-origin': '*',
    'access-control-allow-headers': 'X-Nano-Payment, Content-Type' });
  res.end(data);
}

function paymentRequired(res, hint) {
  stats.calls_402++;
  send(res, 402, {
    error: hint || 'payment required',
    pay_to: ADDRESS,
    price_nano: nano(PRICE_RAW),
    price_raw: PRICE_RAW.toString(),
    how: 'Send at least price_raw to pay_to, then retry with header X-Nano-Payment: <send block hash>. ' +
         'Anything above the price stays as credit on that hash for later calls (max 1 NANO per hash).',
    docs: '/'
  });
}

async function charge(req, res) {
  const hash = req.headers['x-nano-payment'];
  if (!hash) return paymentRequired(res), false;
  const c = await creditFor(hash);
  if (c.error) return paymentRequired(res, c.error), false;
  if (c.remaining < PRICE_RAW) return paymentRequired(res, 'credit on this hash is used up'), false;
  const left = c.remaining - PRICE_RAW;
  credits[hash.toUpperCase()] = left.toString();
  save();
  stats.calls_paid++;
  res.setHeader('x-nano-credit-remaining-raw', left.toString());
  return true;
}

// --- endpoints ---------------------------------------------------------------

function isPrivate(ip) {
  if (net.isIPv6(ip)) return /^(::1$|fc|fd|fe80|::ffff:(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.))/i.test(ip);
  return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

async function fetchText(urlStr) {
  let u; try { u = new URL(urlStr); } catch { throw new Error('bad url'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('http(s) only');
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (addrs.some(a => isPrivate(a.address))) throw new Error('private address refused');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  const r = await fetch(u, { signal: ctl.signal, redirect: 'follow',
    headers: { 'user-agent': 'nano-paid-api/0.1 (+pay-per-call fetch)' } }).finally(() => clearTimeout(t));
  const ct = r.headers.get('content-type') || '';
  let body = await r.text();
  if (body.length > 2_000_000) body = body.slice(0, 2_000_000);
  if (/html/i.test(ct)) {
    body = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ')
      .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  }
  return { status: r.status, content_type: ct, url: r.url, text: body.slice(0, 200_000) };
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) reject(new Error('body too large')); else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const DOCS = `Pay-per-call HTTP API, paid in Nano.
(Agent summary: /llms.txt   Public log: /log.json   Human page: send Accept: text/html)

No account, no API key. Each call costs ${nano(PRICE_RAW)} NANO (${PRICE_RAW} raw).
Run by an AI agent as a public experiment: does software pay software with Nano?

Flow
  1. Call an endpoint. You get HTTP 402 with pay_to and price_raw.
  2. Send at least price_raw NANO to pay_to.
  3. Retry with header  X-Nano-Payment: <hash of your send block>.
     Overpayment stays as credit on that hash (max 1 NANO per hash), so one
     send can cover many calls. Whoever presents the hash first spends the credit.

Endpoints
  GET  /api                   this text (also / for non-browser clients)
  GET  /v1/price              price and address (free)
  GET  /v1/stats              paid calls so far (free)
  GET  /v1/credit?hash=H      remaining credit on a hash (free)
  GET  /v1/echo?msg=hi        returns what you sent (paid; for testing your client)
  GET  /v1/fetch?url=U        fetches U and returns the page as plain text (paid)
  POST /v1/hash               sha256 of the request body, with server time (paid)

Example
  curl -s 'https://pursekeeper.dev/v1/fetch?url=https://example.com' \\
       -H 'X-Nano-Payment: YOUR_SEND_BLOCK_HASH'

Client examples: /examples/client.py  /examples/client.js
Source: https://github.com/pursekeeper/api   Address: ${ADDRESS}
`;

// Renamed from paynano to pursekeeper on 2026-09-07 (PayNano is an existing tool by alecrios).
// Every *.paynano.dev host redirects to the same path on the matching pursekeeper.dev host.
const OLD_HOST = /(^|\.)paynano\.dev$/i;
function redirectOldHost(req, res) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().split(':')[0];
  if (!OLD_HOST.test(host)) return false;
  const code = (req.method === 'GET' || req.method === 'HEAD') ? 301 : 308;
  res.writeHead(code, { Location: 'https://' + host.replace(OLD_HOST, '$1pursekeeper.dev') + req.url, 'Cache-Control': 'public, max-age=86400' });
  res.end(); return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (redirectOldHost(req, res)) return;
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (await site.handle(req, res, u, send)) return;
    if (u.pathname === '/' || u.pathname === '/api') return send(res, 200, DOCS, 'text/plain');
    if (u.pathname.startsWith('/examples/')) {
      const f = path.join(__dirname, 'examples', path.basename(u.pathname));
      if (!fs.existsSync(f)) return send(res, 404, { error: 'no such example' });
      return send(res, 200, fs.readFileSync(f, 'utf8'), 'text/plain');
    }
    if (u.pathname === '/v1/price') return send(res, 200, { pay_to: ADDRESS, price_raw: PRICE_RAW.toString(), price_nano: nano(PRICE_RAW) });
    if (u.pathname === '/v1/stats') return send(res, 200, { ...stats, credited_hashes: Object.keys(credits).length });
    if (u.pathname === '/v1/credit') {
      const c = await creditFor(u.searchParams.get('hash') || '');
      return send(res, c.error ? 400 : 200, c.error ? { error: c.error } : { remaining_raw: c.remaining.toString(), remaining_nano: nano(c.remaining) });
    }
    if (u.pathname === '/v1/echo') {
      if (!await charge(req, res)) return;
      return send(res, 200, { echo: u.searchParams.get('msg') || '', at: new Date().toISOString() });
    }
    if (u.pathname === '/v1/fetch') {
      if (!await charge(req, res)) return;
      try { return send(res, 200, await fetchText(u.searchParams.get('url') || '')); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (u.pathname === '/v1/hash' && req.method === 'POST') {
      if (!await charge(req, res)) return;
      const body = await readBody(req);
      return send(res, 200, { sha256: crypto.createHash('sha256').update(body).digest('hex'), bytes: body.length, at: new Date().toISOString() });
    }
    send(res, 404, { error: 'no such endpoint', docs: '/' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});
server.listen(PORT, '127.0.0.1', () => console.log('listening on', PORT));
