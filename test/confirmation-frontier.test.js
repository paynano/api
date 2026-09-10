'use strict';
// Offline regression: generated keys, a fabricated frontier, and mocked RPC only.
const {test, before} = require('node:test');
const assert = require('node:assert/strict');
const N = require('nanocurrency');
const x = require('../x402');
const f = require('../facilitator');
const FRONTIER = 'A'.repeat(64);
const EARLIER = 'B'.repeat(64);
const THRESHOLD = 'ff00000000000000';
let payer, req, block;
before(async () => {
  const seed = await N.generateSeed();
  const sk = N.deriveSecretKey(seed, 0);
  payer = N.deriveAddress(N.derivePublicKey(sk), {useNanoPrefix:true});
  const recipient = N.deriveAddress(N.derivePublicKey(N.deriveSecretKey(seed, 1)), {useNanoPrefix:true});
  req = x.requirements({payTo:recipient, amountRaw:'1000'});
  const work = await N.computeWork(FRONTIER, {workThreshold:THRESHOLD});
  block = N.createBlock(sk, {previous:FRONTIER, representative:payer, balance:'4000', link:recipient, work}).block;
  block.account = payer;
});
const payload = () => ({x402Version:2, accepted:req, payload:{block:{...block}}});
const info = fields => ({frontier:FRONTIER, balance:'5000', representative:payer, ...fields});
for (const [name, fields, valid] of [
  ['legacy confirmed', {confirmation_height_frontier:FRONTIER}, true],
  ['legacy unconfirmed', {confirmation_height_frontier:EARLIER}, false],
  ['modern confirmed', {confirmed_frontier:FRONTIER}, true],
  ['modern unconfirmed', {confirmed_frontier:EARLIER}, false],
  ['confirmation metadata absent', {}, false],
  ['blank legacy confirmation', {confirmation_height_frontier:''}, false],
  ['conflicting confirmation fields', {confirmed_frontier:EARLIER, confirmation_height_frontier:FRONTIER}, false]
]) {
  test('x402 confirmation: '+name, async () => {
    const r = await x.verify(payload(), req, {accountInfo:async()=>info(fields), workThreshold:THRESHOLD});
    assert.equal(r.ok, valid, JSON.stringify({case:name, result:r.ok, reason:r.reason}));
  });
  test('facilitator confirmation: '+name, async () => {
    const calls = [];
    const rpc = async request => {
      calls.push(request.action);
      if(request.action==='account_info') return info(fields);
      if(request.action==='block_info') return {error:'Block not found'};
      throw new Error('Unexpected RPC: '+request.action);
    };
    const r = await f.verifyRequest({paymentPayload:payload(), paymentRequirements:req}, {rpc, workThreshold:THRESHOLD});
    assert.equal(r.isValid, valid, JSON.stringify({case:name, result:r.isValid, detail:r.detail}));
    assert.ok(calls.every(action=>['block_info','account_info'].includes(action)));
  });
}
test('facilitator explicitly requests confirmation metadata', async () => {
  let observed;
  const rpc = async request => {
    if(request.action==='account_info') { observed=request; return info({confirmed_frontier:FRONTIER}); }
    if(request.action==='block_info') return {error:'Block not found'};
    throw new Error('Unexpected RPC: '+request.action);
  };
  const r = await f.verifyRequest({paymentPayload:payload(), paymentRequirements:req}, {rpc, workThreshold:THRESHOLD});
  assert.equal(r.isValid,true,r.detail);
  assert.equal(observed.include_confirmed,'true');
});
