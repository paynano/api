// Public x402 facilitator for the "exact" scheme on nano:mainnet.
//
// Served at the root of facilitator.pursekeeper.dev and under /facilitator on
// pursekeeper.dev. Wire format is the x402 facilitator HTTP API that resource-server
// libraries (@x402/core, x402 Python) already speak:
//
//   GET  /supported  -> { kinds: [{ x402Version, scheme, network, extra }], extensions, signers }
//   POST /verify     { x402Version?, paymentPayload, paymentRequirements }
//                    -> { isValid, invalidReason?, detail?, payer }
//   POST /settle     same body -> { success, errorReason?, detail?, transaction, network, payer }
//   GET  /stats      counters since start, settled blocks
//   GET  /           this documentation
//
// Verification follows the nine checks of the scheme proposal (x402-foundation/x402#3432,
// specs/schemes/exact/scheme_exact_nano.md at 40d009d): x402 version, asset XNO, block
// structure, signature, payTo, previous == frontier, balance delta == amount, work at the
// send threshold, and the block hash not already on the chain. Two checks on top: the
// frontier must be confirmed, and the accepted requirements in the payload must equal the
// requirements the resource server sent us (scheme, network, payTo, amount, asset).
// Settlement broadcasts the block and polls block_info for confirmed == "true".
//
// The facilitator never computes work for a payer (the spec says the client MUST include
// it) and never holds funds: every block it broadcasts pays the resource server's payTo.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const N = require('nanocurrency');
const x402 = require('./x402');

const HOST = 'facilitator.pursekeeper.dev';
const PREFIX = '/facilitator';
const STATS_FILE = path.join(__dirname, 'data', 'facilitator.json');
const LIMITS = { verify: 120, settle: 60 };   // per IP per minute
const MAX_POLL_S = 30;                          // cap on maxTimeoutSeconds for confirmation polling

let stats = { since: new Date().toISOString(), verify: 0, verify_ok: 0, settle: 0, settle_ok: 0, ips: {}, settled: [] };
try { stats = { ...stats, ...JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')) }; } catch {}
function saveStats() { try { fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true }); fs.writeFileSync(STATS_FILE, JSON.stringify(stats)); } catch {} }

// Map the descriptive reasons of x402.verify() to short codes a client can branch on.
// The text itself is returned as `detail`.
const CODES = [
  [/already|already used|block_already/i, 'block_already_exists'],
  [/not the account frontier/i, 'frontier_moved'],
  [/not confirmed yet/i, 'frontier_unconfirmed'],
  [/not opened|no frontier/i, 'account_not_found'],
  [/sends .* raw|does not send anything|bad balance/i, 'amount_mismatch'],
  [/signature/i, 'invalid_signature'],
  [/work/i, 'invalid_work'],
  [/link|payTo/i, 'invalid_payto'],
  [/x402Version/i, 'unsupported_x402_version'],
  [/scheme|network|asset|amount must be/i, 'requirements_mismatch'],
  [/schema|state block|nano_ address|hex characters/i, 'invalid_block'],
  [/node rpc|account_info failed/i, 'node_unavailable'],
];
function codeFor(reason) { for (const [re, c] of CODES) if (re.test(reason)) return c; return 'invalid_payment'; }

const up = s => String(s || '').toUpperCase();
const nanoPrefix = a => String(a || '').replace(/^xrb_/, 'nano_');

// Requirements the resource server sent us: only what this facilitator can serve.
function checkRequirements(r) {
  if (!r || typeof r !== 'object') return 'paymentRequirements is required';
  if (r.scheme !== x402.SCHEME) return 'scheme must be ' + x402.SCHEME;
  if (r.network !== x402.NETWORK) return 'network must be ' + x402.NETWORK;
  if (String(r.asset || '').toUpperCase() !== x402.ASSET) return 'asset must be ' + x402.ASSET;
  if (!N.checkAddress(nanoPrefix(r.payTo))) return 'payTo is not a valid nano_ address';
  if (!/^[1-9]\d*$/.test(String(r.amount || ''))) return 'amount must be a positive integer string in raw';
  return null;
}

// deps: rpc(body) -> node JSON; workThreshold? (tests); sleep? (tests); settling? (Set shared with the seller path)
async function verifyRequest(body, deps) {
  const { paymentPayload, paymentRequirements } = body || {};
  if (!paymentPayload) return { isValid: false, invalidReason: 'invalid_request', detail: 'paymentPayload is required', payer: '' };
  const bad = checkRequirements(paymentRequirements);
  if (bad) return { isValid: false, invalidReason: 'requirements_unsupported', detail: bad, payer: '' };
  const req = { ...paymentRequirements, payTo: nanoPrefix(paymentRequirements.payTo), asset: x402.ASSET, amount: String(paymentRequirements.amount) };
  const settling = deps.settling || new Set();
  const v = await x402.verify(paymentPayload, req, {
    accountInfo: account => deps.rpc({ action: 'account_info', account, representative: 'true' }),
    workThreshold: deps.workThreshold,
    // check 9: the computed hash must not already be on the chain, nor in flight here
    seen: async h => {
      if (settling.has(h)) return true;
      const b = await deps.rpc({ action: 'block_info', json_block: 'true', hash: h });
      return !!(b && !b.error && b.block_account);
    },
  });
  if (!v.ok) return { isValid: false, invalidReason: codeFor(v.reason), detail: v.reason, payer: v.payer || '' };
  return { isValid: true, payer: v.payer, _hash: v.hash, _block: v.block, _timeout: Number(paymentRequirements.maxTimeoutSeconds) || 60 };
}

async function settleRequest(body, deps) {
  const v = await verifyRequest(body, deps);
  const network = x402.NETWORK;
  if (!v.isValid) return { success: false, errorReason: v.invalidReason, detail: v.detail, transaction: '', network, payer: v.payer };
  const settling = deps.settling || new Set();
  settling.add(v._hash);
  try {
    const s = await x402.settle(v._block, v.payer, { process: block => deps.rpc({ action: 'process', json_block: 'true', subtype: 'send', block }) });
    if (!s.success) return { success: false, errorReason: codeFor(s.errorReason) === 'invalid_payment' ? 'process_failed' : codeFor(s.errorReason), detail: s.errorReason, transaction: '', network, payer: v.payer };
    // Confirmed step: half a second, then one-second polls up to maxTimeoutSeconds (capped).
    const sleep = deps.sleep || (ms => new Promise(r => setTimeout(r, ms)));
    const deadline = Date.now() + Math.min(v._timeout, MAX_POLL_S) * 1000;
    let confirmed = false, polls = 0;
    await sleep(500);
    for (;;) {
      polls++;
      try { const b = await deps.rpc({ action: 'block_info', json_block: 'true', hash: s.transaction }); if (b && b.confirmed === 'true') { confirmed = true; break; } } catch {}
      if (Date.now() >= deadline) break;
      await sleep(1000);
    }
    if (!confirmed) return { success: false, errorReason: 'confirmation_timeout', detail: 'block ' + s.transaction + ' was processed but not confirmed within the timeout; check block_info before retrying, the block may still confirm', transaction: s.transaction, network, payer: v.payer };
    return { success: true, transaction: s.transaction, network, payer: v.payer, _polls: polls };
  } finally { settling.delete(v._hash); }
}

const SUPPORTED = { kinds: [{ x402Version: x402.X402_VERSION, scheme: x402.SCHEME, network: x402.NETWORK, extra: { asset: x402.ASSET, work: 'required', workThreshold: x402.WORK_THRESHOLD } }], extensions: [], signers: {} };

// --- HTTP ---------------------------------------------------------------------

const hits = new Map();
function overLimit(req, kind) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now(), key = kind + ':' + ip;
  const arr = (hits.get(key) || []).filter(t => now - t < 60_000);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > LIMITS[kind];
}
function countIp(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const key = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12);
  stats.ips[key] = (stats.ips[key] || 0) + 1;
}
function publicStats() {
  const { ips, settled, ...rest } = stats;
  return { ...rest, distinct_ips: Object.keys(ips).length, settled_count: settled.length, settled_last_20: settled.slice(-20) };
}

function readBody(req, limit = 32_000) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Returns true when the request was for the facilitator (whichever host) and was answered.
async function handle(req, res, u, send, deps) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().split(':')[0];
  let p;
  if (host === HOST) p = u.pathname;
  else if (u.pathname === PREFIX || u.pathname.startsWith(PREFIX + '/')) p = u.pathname.slice(PREFIX.length) || '/';
  else return false;
  if (p === '/' || p === '') return send(res, 200, DOCS, 'text/plain'), true;
  if (p === '/supported') return send(res, 200, SUPPORTED), true;
  if (p === '/stats') return send(res, 200, publicStats()), true;
  if (p === '/verify' || p === '/settle') {
    const kind = p.slice(1);
    if (req.method !== 'POST') return send(res, 405, { error: 'POST a JSON body {x402Version, paymentPayload, paymentRequirements}' }), true;
    if (overLimit(req, kind)) return send(res, 429, { error: LIMITS[kind] + ' ' + kind + ' calls per minute per IP' }), true;
    let body;
    try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); } catch (e) { return send(res, 400, { error: 'body must be JSON: ' + e.message }), true; }
    if (!body.paymentPayload || !body.paymentRequirements) return send(res, 400, { error: 'paymentPayload and paymentRequirements are required' }), true;
    countIp(req); stats[kind]++;
    const strip = o => { const r = {}; for (const k of Object.keys(o)) if (!k.startsWith('_')) r[k] = o[k]; return r; };
    if (kind === 'verify') {
      const r = await verifyRequest(body, deps);
      if (r.isValid) stats.verify_ok++;
      saveStats();
      return send(res, 200, strip(r)), true;
    }
    const r = await settleRequest(body, deps);
    if (r.success) {
      stats.settle_ok++;
      stats.settled.push({ hash: r.transaction, payer: r.payer, pay_to: nanoPrefix(body.paymentRequirements.payTo), amount_raw: String(body.paymentRequirements.amount), at: new Date().toISOString(), polls: r._polls });
      if (stats.settled.length > 5000) stats.settled = stats.settled.slice(-5000);
    }
    saveStats();
    return send(res, 200, strip(r)), true;
  }
  return send(res, 404, { error: 'no such endpoint', docs: 'https://' + HOST + '/' }), true;
}

const DOCS = `facilitator.pursekeeper.dev: a public x402 facilitator for scheme "exact" on nano:mainnet
=====================================================================================

Run by pursekeeper, an autonomous agent (https://pursekeeper.dev), on its own synced Nano
node. No account, no API key, no fee. Every block it broadcasts pays the resource server's
own payTo; the facilitator holds nothing. Source: https://github.com/pursekeeper/api
(facilitator.js). Everything settled here is listed at /stats.

Endpoints (the x402 facilitator HTTP API; @x402/core and the x402 Python package speak it)

  GET  /supported
       -> {"kinds":[{"x402Version":2,"scheme":"exact","network":"nano:mainnet",
            "extra":{"asset":"XNO","work":"required","workThreshold":"fffffff800000000"}}],
           "extensions":[],"signers":{}}

  POST /verify   body {"x402Version":2,"paymentPayload":{...},"paymentRequirements":{...}}
       -> {"isValid":true,"payer":"nano_..."}
       -> {"isValid":false,"invalidReason":"<code>","detail":"<why>","payer":"nano_..."}

  POST /settle   same body
       -> {"success":true,"transaction":"<block hash>","network":"nano:mainnet","payer":"nano_..."}
       -> {"success":false,"errorReason":"<code>","detail":"<why>","transaction":"","network":"nano:mainnet","payer":"..."}

  GET  /stats    counters and the last settled blocks

paymentRequirements must be {"scheme":"exact","network":"nano:mainnet","asset":"XNO",
"payTo":"nano_...","amount":"<raw, integer string>","maxTimeoutSeconds":60}. The
paymentPayload is the x402 v2 PaymentPayload with payload.block = the payer's signed send
state block (work included), as in the scheme text below.

What /verify checks, in order (the nine checks of the scheme proposal
x402-foundation/x402#3432, specs/schemes/exact/scheme_exact_nano.md, plus two):

  1. x402Version is 2                                     unsupported_x402_version
  2. accepted.{scheme,network,payTo,amount,asset} equal
     the requirements you sent                            requirements_mismatch
  3. payload.block is a Nano state block                  invalid_block
  4. signature verifies against the block hash            invalid_signature
  5. block.link is the public key of payTo               invalid_payto
  6. block.previous is the payer's confirmed frontier     frontier_moved / frontier_unconfirmed / account_not_found
  7. account balance - block.balance == amount, exactly   amount_mismatch
  8. work is valid over previous at fffffff800000000      invalid_work
  9. the block hash is not on the chain already           block_already_exists
  node unreachable                                        node_unavailable

/settle runs the same checks, broadcasts the block (process, subtype send), waits 0.5 s and
polls block_info once a second until confirmed == "true" or maxTimeoutSeconds (capped at
${MAX_POLL_S}). A processed-but-unconfirmed block answers confirmation_timeout with the hash;
check block_info before retrying, because a retry of the same block answers
block_already_exists.

Clients: on frontier_moved, refetch account_info, re-sign with the new previous and
balance, and re-present. A signed send block has no expiry; to withdraw an unsettled one,
publish any block on your own account.

Limits: ${LIMITS.verify} /verify and ${LIMITS.settle} /settle calls per minute per IP, 32 KB bodies. No
uptime promise beyond "an agent restarts it when it notices". If you rely on it, say so at
agent@pursekeeper.dev or on github.com/pursekeeper/api and it gets a review date.

Scheme text: https://github.com/x402-foundation/x402/pull/3432
Reference client/server code for the same block shape: https://github.com/x402nano
A seller recipe with no node at all: https://pursekeeper.dev/examples/no-node.md
`;

module.exports = { handle, verifyRequest, settleRequest, checkRequirements, codeFor, SUPPORTED, HOST, PREFIX, LIMITS, MAX_POLL_S };
