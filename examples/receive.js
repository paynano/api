#!/usr/bin/env node
// Receive every pending send into a Nano account (opens the account if new).
//
//   NANO_SEED=<64 hex> node receive.js
//
// Env: NANO_SEED (required), NANO_INDEX (default 0), NANO_RPC (default http://127.0.0.1:7076),
//      NANO_REP (representative for a new account; default: a well-known public one),
//      WORK_URL (optional RPC-style work_generate endpoint; default: NANO_RPC).
// Only dependency: nanocurrency. Prints one line per received block.
'use strict';
const N = require('nanocurrency');
const RPC = process.env.NANO_RPC || 'http://127.0.0.1:7076';
const WORK_URL = process.env.WORK_URL || RPC;
const RECEIVE_THRESHOLD = 'fffffe0000000000';
const rpc = (u, body) => fetch(u, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }).then(r => r.json());

(async () => {
  if (!process.env.NANO_SEED) { console.error('set NANO_SEED (64 hex chars)'); process.exit(2); }
  const sk = N.deriveSecretKey(process.env.NANO_SEED, Number(process.env.NANO_INDEX || 0));
  const pub = N.derivePublicKey(sk);
  const account = N.deriveAddress(pub, { useNanoPrefix: true });
  console.error('account', account);

  const pend = await rpc(RPC, { action: 'receivable', account, count: '50', source: 'true', threshold: '1' });
  const blocks = pend.blocks && typeof pend.blocks === 'object' ? Object.entries(pend.blocks) : [];
  if (!blocks.length) { console.error('nothing receivable'); return; }

  let info = await rpc(RPC, { action: 'account_info', account, representative: 'true' });
  let opened = !info.error;
  let previous = opened ? info.frontier : '0'.repeat(64);
  let balance = opened ? BigInt(info.balance) : 0n;
  const representative = opened ? info.representative
    : (process.env.NANO_REP || 'nano_3arg3asgtigae3xckabaaewkx3bzsh7nwz7jkmjos79ihyaxwphhm6qgjps4');

  for (const [hash, meta] of blocks) {
    const amount = BigInt(typeof meta === 'object' ? meta.amount : meta);
    const workHash = opened ? previous : pub;
    const w = await rpc(WORK_URL, { action: 'work_generate', hash: workHash, difficulty: RECEIVE_THRESHOLD });
    if (!w.work) throw new Error('work_generate: ' + JSON.stringify(w));
    balance += amount;
    const { block, hash: newHash } = N.createBlock(sk, { work: w.work, previous, representative, balance: balance.toString(), link: hash });
    block.account = block.account.replace(/^xrb_/, 'nano_');
    const r = await rpc(RPC, { action: 'process', json_block: 'true', subtype: opened ? 'receive' : 'open', block });
    if (!r.hash) throw new Error('process: ' + JSON.stringify(r));
    console.log(`${opened ? 'receive' : 'open'} ${r.hash} amount ${amount} raw from send ${hash} -> balance ${balance} raw`);
    opened = true; previous = r.hash;
  }
})().catch(e => { console.error('error:', e.message); process.exit(1); });
