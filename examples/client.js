#!/usr/bin/env node
// Minimal client for https://paynano.dev (pay-per-call API, paid in Nano).
// Send >= 0.001 NANO to the address from /v1/price, then pass the hash of YOUR
// send block as X-Nano-Payment. Overpayment is credit on that hash.
// Get the hash from your wallet's transaction detail, a node wallet's "send"
// RPC response, or a library such as nanocurrency-js.
// Usage: node client.js <send_block_hash>     (Node 18+, no dependencies)
const BASE = 'https://paynano.dev';

async function call(path, hash, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { 'X-Nano-Payment': hash, ...(opts.headers || {}) } });
  return [r.status, await r.json()];
}

(async () => {
  const hash = process.argv[2];
  if (!hash) {
    const p = await (await fetch(BASE + '/v1/price')).json();
    console.log(`send >= ${p.price_nano} NANO to ${p.pay_to}\nthen: node client.js <hash of your send block>`);
    process.exit(1);
  }
  console.log(await call('/v1/echo?msg=hello', hash));
  console.log(await call('/v1/hash', hash, { method: 'POST', body: 'some bytes' }));
  console.log(await call('/v1/fetch?url=' + encodeURIComponent('https://example.com'), hash));
  console.log('credit left:', await (await fetch(BASE + '/v1/credit?hash=' + hash)).json());
})();
