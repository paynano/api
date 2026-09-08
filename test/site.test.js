// node --test  (run from api/). The counterparty threshold: dust senders are listed
// in inflow but not counted as counterparties until they have sent COUNTERPARTY_MIN
// in total; addresses we paid count regardless.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { counterpartyNumbers, nanoToRaw, COUNTERPARTY_MIN_RAW, COUNTERPARTY_MIN_NANO } = require('../site');

const A = 'nano_1oatxz8ha1j55m4wzkkgmpoyyn4gr9bgu9snnfyqc6toawb5ht5e8w4x6s9o';
const B = 'nano_3gmd94aey5nxrntgjrznnbssh3s7htyubeq91x8qgjpbe8qk59xiarf1homu';
const C = 'nano_1i3y944esngqw6wb6ia68dotj4yuqctch9kx8ct65twt8ewi4rdcfgax7ggf';
const D = 'nano_16qcqjhqkgopyq6dtuoarwosma8z51asec4t5zki3eq78yiuz7i5kd7bdzyh';
const row = (kind, counterparty, nano) => ({ kind, counterparty, amount_raw: nanoToRaw(nano).toString() });

test('nanoToRaw is exact', () => {
  assert.equal(nanoToRaw('0.01'), 10n ** 28n);
  assert.equal(nanoToRaw('1'), 10n ** 30n);
  assert.equal(nanoToRaw('0.000000000000000000000000000001'), 1n);
  assert.throws(() => nanoToRaw('1e3'));
  assert.equal(COUNTERPARTY_MIN_RAW, nanoToRaw(COUNTERPARTY_MIN_NANO));
});

test('dust below the threshold is inflow but not a counterparty', () => {
  const n = counterpartyNumbers([row('payment_in', A, '0.001'), row('payment_in', A, '0.002')], new Set(), nanoToRaw('0.01'));
  assert.equal(n.external.nano, nanoToRaw('0.003'));            // every raw counts
  assert.equal(n.external.counterparties, 0);
  assert.equal(n.external.below_threshold, 1);
  assert.deepEqual([n.counterparties.in, n.counterparties.out, n.counterparties.both, n.counterparties.in_below_threshold], [0, 0, 0, 1]);
});

test('an address counts once its total reaches the threshold, across several payments', () => {
  const n = counterpartyNumbers([row('payment_in', A, '0.004'), row('payment_in', A, '0.006'), row('payment_in', B, '0.5')], new Set(), nanoToRaw('0.01'));
  assert.equal(n.external.counterparties, 2);
  assert.equal(n.external.below_threshold, 0);
  assert.equal(n.counterparties.both, 2);
});

test('addresses we paid count regardless of what they sent back, and are never external', () => {
  const n = counterpartyNumbers([row('payment_out', A, '0.2'), row('payment_in', A, '0.0003'), row('payment_in', B, '0.02')], new Set(), nanoToRaw('0.01'));
  assert.equal(n.external.counterparties, 1);
  assert.equal(n.external.nano, nanoToRaw('0.02'));
  assert.deepEqual([n.counterparties.out, n.counterparties.in, n.counterparties.both, n.counterparties.in_below_threshold], [1, 1, 2, 0]);
});

test('our own addresses are excluded entirely', () => {
  const n = counterpartyNumbers([row('payment_out', C, '0.01'), row('payment_in', D, '1')], new Set([C, D]), nanoToRaw('0.01'));
  assert.equal(n.external.counterparties, 0);
  assert.equal(n.external.nano, 0n);
  assert.equal(n.counterparties.both, 0);
});
