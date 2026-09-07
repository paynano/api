// node --test  (run from api/). Fabricated blocks, mocked RPC; nothing touches the network.
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const N = require('nanocurrency');
const x = require('../x402');
const { decodePaymentRequiredHeader, encodePaymentSignatureHeader, decodePaymentResponseHeader } = require('@x402/core/http');
const { PaymentRequiredV2Schema } = require('@x402/core/schemas');

const PAY_TO = 'nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue';
const AMOUNT = 10n ** 27n;
const REQ = x.requirements({ payTo: PAY_TO, amountRaw: AMOUNT, maxTimeoutSeconds: 60 });
const THRESHOLD = 'ff00000000000000'; // low so tests are fast; verify() takes it as a dep
const FRONTIER = '4DA37CC62F040730D14E9D57A83D3810C54CBFF1C7A389E477F5A290B28A688F';
const BALANCE = 5n * 10n ** 27n; // payer holds 0.005 NANO

let sk, payer, other, work;
before(async () => {
  const seed = await N.generateSeed();
  sk = N.deriveSecretKey(seed, 0);
  payer = N.deriveAddress(N.derivePublicKey(sk), { useNanoPrefix: true });
  other = N.deriveAddress(N.derivePublicKey(N.deriveSecretKey(seed, 1)), { useNanoPrefix: true });
  work = await N.computeWork(FRONTIER, { workThreshold: THRESHOLD });
});

function makeBlock(over = {}) {
  const fields = { work, previous: FRONTIER, representative: payer, balance: (BALANCE - AMOUNT).toString(), link: PAY_TO, ...over };
  const { block } = N.createBlock(sk, fields);
  block.account = block.account.replace(/^xrb_/, 'nano_');
  return block;
}
const payload = (block, accepted = REQ) => ({ x402Version: 2, accepted, payload: { block } });
const info = (over = {}) => ({ frontier: FRONTIER, balance: BALANCE.toString(), representative: payer, confirmation_height_frontier: FRONTIER, ...over });
const deps = (over = {}) => ({ accountInfo: async () => info(), workThreshold: THRESHOLD, ...over });

test('valid block is accepted and its hash is the block hash', async () => {
  const b = makeBlock();
  const r = await x.verify(payload(b), REQ, deps());
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.payer, payer);
  assert.equal(r.hash, N.hashBlock({ account: payer, previous: FRONTIER, representative: payer, balance: b.balance, link: PAY_TO }));
  assert.equal(r.block.link_as_account, PAY_TO);
});

test('block without link_as_account is accepted (it is derived)', async () => {
  const b = makeBlock(); delete b.link_as_account;
  const r = await x.verify(payload(b), REQ, deps());
  assert.equal(r.ok, true, r.reason);
});

test('wrong previous is rejected', async () => {
  const r = await x.verify(payload(makeBlock()), REQ, deps({ accountInfo: async () => info({ frontier: 'A'.repeat(64), confirmation_height_frontier: 'A'.repeat(64) }) }));
  assert.equal(r.ok, false); assert.match(r.reason, /previous/);
});

test('unconfirmed frontier is rejected', async () => {
  const r = await x.verify(payload(makeBlock()), REQ, deps({ accountInfo: async () => info({ confirmation_height_frontier: 'B'.repeat(64) }) }));
  assert.equal(r.ok, false); assert.match(r.reason, /not confirmed/);
});

test('underpaid balance is rejected', async () => {
  const r = await x.verify(payload(makeBlock({ balance: (BALANCE - 1n).toString() })), REQ, deps());
  assert.equal(r.ok, false); assert.match(r.reason, /sends 1 raw/);
});

test('block that sends nothing is rejected', async () => {
  const r = await x.verify(payload(makeBlock({ balance: BALANCE.toString() })), REQ, deps());
  assert.equal(r.ok, false); assert.match(r.reason, /does not send/);
});

test('overpaid balance is rejected (exact amount only)', async () => {
  const r = await x.verify(payload(makeBlock({ balance: (BALANCE - AMOUNT - 1n).toString() })), REQ, deps());
  assert.equal(r.ok, false); assert.match(r.reason, /exactly/);
});

test('wrong link is rejected', async () => {
  const r = await x.verify(payload(makeBlock({ link: other })), REQ, deps());
  assert.equal(r.ok, false); assert.match(r.reason, /link/);
});

test('link_as_account claiming payTo while link points elsewhere is rejected', async () => {
  const b = makeBlock({ link: other }); b.link_as_account = PAY_TO;
  const r = await x.verify(payload(b), REQ, deps());
  assert.equal(r.ok, false); assert.match(r.reason, /link/);
});

test('bad signature is rejected', async () => {
  const b = makeBlock();
  b.signature = (b.signature[0] === 'A' ? 'B' : 'A') + b.signature.slice(1);
  const r = await x.verify(payload(b), REQ, deps());
  assert.equal(r.ok, false); assert.match(r.reason, /signature/);
});

test('tampered balance with the old signature is rejected', async () => {
  const b = makeBlock(); b.balance = (BALANCE - AMOUNT).toString(); // same as signed
  const t = { ...b, balance: (BALANCE - 1n).toString() };
  const r = await x.verify(payload(t), REQ, deps());
  assert.equal(r.ok, false); assert.match(r.reason, /signature/);
});

test('work below threshold is rejected', async () => {
  let bad = '0000000000000000';
  while (N.validateWork({ blockHash: FRONTIER, work: bad, threshold: THRESHOLD })) bad = (BigInt('0x' + bad) + 1n).toString(16).padStart(16, '0');
  const r = await x.verify(payload(makeBlock({ work: bad })), REQ, deps());
  assert.equal(r.ok, false); assert.match(r.reason, /work/);
});

test('accepted requirements must match ours', async () => {
  for (const [k, v] of [['amount', '1'], ['network', 'nano:betanet'], ['scheme', 'upto'], ['payTo', other], ['asset', 'USDC']]) {
    const r = await x.verify(payload(makeBlock(), { ...REQ, [k]: v }), REQ, deps());
    assert.equal(r.ok, false, k); assert.match(r.reason, new RegExp(k === 'payTo' ? 'payTo' : k));
  }
});

test('unopened payer account is rejected', async () => {
  const r = await x.verify(payload(makeBlock()), REQ, deps({ accountInfo: async () => ({ error: 'Account not found' }) }));
  assert.equal(r.ok, false); assert.match(r.reason, /not opened/);
});

test('rpc failure is a clean rejection', async () => {
  const r = await x.verify(payload(makeBlock()), REQ, deps({ accountInfo: async () => { throw new Error('ECONNREFUSED'); } }));
  assert.equal(r.ok, false); assert.match(r.reason, /rpc/);
});

test('already-seen hash is rejected before any rpc', async () => {
  let called = false;
  const r = await x.verify(payload(makeBlock()), REQ, deps({ seen: async () => true, accountInfo: async () => { called = true; return info(); } }));
  assert.equal(r.ok, false); assert.match(r.reason, /already used/); assert.equal(called, false);
});

test('garbage payloads are rejected without throwing', async () => {
  for (const p of [null, {}, { x402Version: 1, scheme: 'exact', network: 'nano', payload: {} }, { x402Version: 2, accepted: REQ, payload: {} }, { x402Version: 2, accepted: REQ, payload: { block: { type: 'state' } } }]) {
    const r = await x.verify(p, REQ, deps());
    assert.equal(r.ok, false);
  }
});

test('settle: process success and failure', async () => {
  const b = makeBlock();
  const ok = await x.settle(b, payer, { process: async blk => { assert.equal(blk, b); return { hash: 'abc' }; } });
  assert.deepEqual(ok, { success: true, network: 'nano:mainnet', transaction: 'ABC', payer });
  const bad = await x.settle(b, payer, { process: async () => ({ error: 'Old block' }) });
  assert.equal(bad.success, false); assert.match(bad.errorReason, /Old block/);
  const thrown = await x.settle(b, payer, { process: async () => { throw new Error('down'); } });
  assert.equal(thrown.success, false); assert.match(thrown.errorReason, /down/);
  const hdr = decodePaymentResponseHeader(x.settleHeader(ok));
  assert.equal(hdr.transaction, 'ABC');
});

test('402 header round-trips through @x402/core and matches the v2 schema', () => {
  const pr = x.paymentRequired({ requirements: REQ, url: 'https://pursekeeper.dev/v1/echo?msg=hi', description: 'echo', error: 'payment required' });
  const back = decodePaymentRequiredHeader(pr.header);
  assert.deepEqual(back, pr.body);
  assert.equal(PaymentRequiredV2Schema.safeParse(back).success, true);
  assert.equal(back.accepts[0].amount, AMOUNT.toString());
  assert.equal(back.accepts[0].asset, 'XNO');
});

test('payment header decoding accepts PAYMENT-SIGNATURE and X-PAYMENT', () => {
  const p = payload(makeBlock());
  const enc = encodePaymentSignatureHeader(p);
  assert.deepEqual(x.decodePayment(x.paymentHeader({ 'payment-signature': enc })).payload, p);
  assert.deepEqual(x.decodePayment(x.paymentHeader({ 'x-payment': enc })).payload, p);
  assert.equal(x.paymentHeader({}), null);
  assert.ok(x.decodePayment('not base64!').error);
});
