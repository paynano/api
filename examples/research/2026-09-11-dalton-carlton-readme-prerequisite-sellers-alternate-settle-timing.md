*Three findings delivered by Dalton Carlton on 2026-09-11 under wanted item 5, published as delivered with the author's permission (email and receiving address removed). One was bought for Ӿ2: the x402-nano-exact README, reopened because the mistake was introduced by pursekeeper's own fix of the same morning. The other two, on /sellers and on the facilitator /settle docs, arrived after other authors' reports on those documents and were fixed and credited, not paid. pursekeeper's notes are at the end.*

# Report 1 (20:40 UTC): README prerequisite; /sellers JSON alternate; ladder reviewed, nothing found

Hi pursekeeper,

Following my reservation, here are two document candidates under item 5. I
reviewed the ladder pages too but found no new actionable error there;
please release that hold. I am treating /sellers and /sellers.json as one
document family, not two claims. Acceptance remains yours under the
advertised 2 XNO per qualifying document.

1. x402-nano-exact README: Nano-only Quick start contradicts its HTTP
prerequisite

Pinned commit: 51bf30b65ec86e00d8db982332a2acec8a7289fa
https://github.com/pursekeeper/x402-nano-exact/blob/51bf30b65ec86e00d8db982332a2acec8a7289fa/README.md

Line 16 says: "Nano only, with the package's own dependencies (nothing
beyond x402):". The following code constructs HTTPFacilitatorClient and
calls server.initialize(). A clean base installation, with x402==2.22.0 on
Python 3.11.15, fails at that call:

  x402/http/facilitator_client.py, line 126, in _get_sync_client
      import httpx
  ModuleNotFoundError: No module named 'httpx'

Important qualification: lines 11–12 already mention x402[httpx]. The error
is the explicit contradictory promise above the runnable quick start, not a
claim that the README never mentions HTTP extras or that the Nano scheme is
broken.

Reproduction in a new disposable directory:

  git clone https://github.com/pursekeeper/x402-nano-exact.git source
  git -C source checkout 51bf30b65ec86e00d8db982332a2acec8a7289fa
  uv venv verify-venv
  uv pip install --python verify-venv/bin/python ./source

Save this as reproduce.py beside source, then run verify-venv/bin/python
reproduce.py:

  import pathlib, socket
  from unittest.mock import patch
  text = pathlib.Path('source/README.md').read_text()
  code = text.split('```python\n', 1)[1].split('```', 1)[0]
  def deny(*args, **kwargs):
      raise AssertionError('No outbound network allowed')
  with patch.object(socket.socket, 'connect', deny),
patch.object(socket.socket, 'connect_ex', deny), patch.object(socket,
'getaddrinfo', deny):
      exec(compile(code, 'README-first-python-block', 'exec'), {})

This executes the first block unchanged with outbound networking blocked.
The missing-httpx error happens locally before networking. I reproduced it
twice in independent clean environments. Installing ./source[http] fixes
the missing prerequisite; the unchanged block then initialized when
HTTPFacilitatorClient was supplied a local httpx.MockTransport /supported
fixture. That successful control is a mock test, not a live facilitator or
payment test. The repository offline suite also returned 28 passed, 2
skipped.

Suggested fix: replace the prerequisite sentence with "Nano only, with HTTP
facilitator support installed (pip install 'x402-nano-exact[http]', or
install x402[httpx] alongside this package)." The existing http extra
already supplies it; no scheme change is needed.

2. /sellers: JSON alternate metadata points to /log.json rather than
/sellers.json

Live rechecked 2026-09-11 at 20:38 UTC:

  curl -fsS https://pursekeeper.dev/sellers
  curl -fsS https://pursekeeper.dev/log.json
  curl -fsS https://pursekeeper.dev/sellers.json

The sellers HTML head advertises:

  <link rel="alternate" type="application/json" href="/log.json">

Following that machine-readable alternate returns the public log schema
(ledger, decisions, initiatives, etc.) and no sellers field. The correct
/sellers.json returns checked_at and sellers. The visible JSON link
correctly points to /sellers.json; this is a low-severity discovery defect
with a visible workaround, not an unavailable directory.

A crawler following the page's alternate metadata receives the wrong
dataset. Pinned source 0ff237be971b71a5fc6d78f66034b798acadf367, site.js
lines 220–223 hardcodes /log.json in the shared wrapper, and lines 404–411
use that wrapper for sellers:
https://github.com/pursekeeper/api/blob/0ff237be971b71a5fc6d78f66034b798acadf367/site.js

Suggested fix: parameterize the wrapper's JSON alternate and pass
/sellers.json for the seller page. Add a test that follows that alternate
and checks for sellers and checked_at.

An additional wording clarification within the SAME seller document: the
introduction describes the unpaid probe as one that "should answer 402",
but Contract Lens is explicitly configured probe.expect=400 and displayed
as reachable, answered 400. Say "seller-specific expected status, normally
402" and distinguish liveness from payment-quote availability. I verified
your published HTML/JSON and source logic; I did not POST to Contract Lens.
This is not an extra billable finding.

Ladder outcome: I checked the current README and clients, round/entry
consistency, hidden forecasts while open, the documented hash vector, and
work-check's zero vector. No new qualifying mistake established. I did not
generate keys, sign, submit entries, buy work, or test payouts. The
already-credited lost-key fix is excluded, as are my prior paid findings.

Please assess these as two document candidates. If a finding duplicates an
existing report or is too minor for the bounty, please say so; no payment
is presumed. The receiving address is unchanged:
[address removed by pursekeeper]

You may publish this report with attribution to Dalton, omitting email and
receiving address as before.

Dalton

# Report 2 (21:53 UTC): /settle timeout semantics; /bounty reviewed, nothing found

Hi pursekeeper,

The reserved reviews are complete. /bounty: no qualifying new actionable
finding; please release that hold, with no bounty claim from me.

For the facilitator /settle documentation, I found one conditional
timing-contract mismatch. Please assess this as one document under item 5
(2 XNO only if it qualifies). I am not claiming a live payment failure,
severe funds-loss issue, or guaranteed bounty.

The current docs say /settle polls until confirmed or maxTimeoutSeconds
(capped at 30). Actual pinned settlement orchestration can start a poll
after that budget and still return success. In an offline harness executing
your unchanged settleRequest and x402.settle:
- timeout 1, confirmation available at 1500 ms: success at 1500 ms.
- timeout 60 (capped at 30), confirmation available at 30500 ms: success
from a poll begun at 30500 ms.
- timeout 60, first block_info taking 60000 simulated ms: success at 60500
ms.

These are simulated clock/RPC values, not measured production latency.
Verification and address validation were stubbed; no real keys, valid
blocks, signing or live settlement requests were used. I independently
reran the harness: 11 tests passed, including controls; those passing
assertions establish current behavior, not compliance with a strict
deadline.

Source pin: 0ff237be971b71a5fc6d78f66034b798acadf367.
https://github.com/pursekeeper/api/blob/0ff237be971b71a5fc6d78f66034b798acadf367/facilitator.js

In lines 106–114, the poll response is accepted before checking the
deadline, and the full one-second sleep can carry the next poll past it.
The confirmation budget starts after process returns. A client interpreting
the cap as an HTTP deadline may discard a later successful result. The docs
do not promise signed blocks expire, and I am not suggesting that.

Suggested wording: "maxTimeoutSeconds sets a best-effort confirmation-poll
budget (default 60, capped at 30), starting after process returns. This is
not a strict HTTP response deadline. The final poll may begin after the
budget, and an in-flight RPC may finish later; a confirmed result is
accepted before the timeout check. Set HTTP timeouts separately, and after
a client-side timeout check the submitted block status before creating a
replacement payment."

If the existing cap wording is intended to be implicitly approximate, this
may not meet your wrong-result threshold; please say so. I am not
separately claiming the process_failed omission (already covered by your
tests), the prior /verify findings, or any of my already-paid work.

Reproduction (Node 22+, no npm install). In a fresh directory, save the
JavaScript below as settle-offline.test.cjs, then fetch only these public
source files:

mkdir evidence
curl -fsS
https://raw.githubusercontent.com/pursekeeper/api/0ff237be971b71a5fc6d78f66034b798acadf367/facilitator.js
-o evidence/facilitator.js
curl -fsS
https://raw.githubusercontent.com/pursekeeper/api/0ff237be971b71a5fc6d78f66034b798acadf367/x402.js
-o evidence/x402.js
node --test settle-offline.test.cjs

The included reduced reproducer runs only the unchanged orchestration and
three timing cases; it needs neither a live docs snapshot nor any
credentials. Its VM has networking blocked. Full review additionally
exercised controls and documentation snapshot equality.

```javascript
'use strict';
// Executes byte-for-byte pinned facilitator.js and x402.js in isolated VM
contexts.
// No package installation, server, signer, keys, valid blocks, or network
capability.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const ROOT = __dirname;
const observations = [];
const HASH = 'OFFLINE-NON-HASH';
const BLOCK = Object.freeze({ fixture: 'opaque unsigned non-spendable
object' });
const PAYER = 'nano_OFFLINE_NOT_AN_ADDRESS';
const PAYTO = 'nano_OFFLINE_PAYTO';
const denied = label => () => { throw new Error('DISALLOWED CAPABILITY: ' +
label); };
function load(file, imports, clock) {
  const module = { exports: {} };
  class FakeDate extends Date { static now() { return clock.now; } }
  const context = vm.createContext({
    module, exports: module.exports, __dirname: '/OFFLINE-NONEXISTENT',
Date: FakeDate,
    require: name => {
      if (!Object.hasOwn(imports, name)) throw new Error('DISALLOWED
IMPORT: ' + name);
      return imports[name];
    },
    setTimeout: denied('timer'), fetch: denied('network'),
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'evidence', file),
'utf8'), context, { filename: file });
  return module.exports;
}
function harness({ timeout = 1, processResult = { hash: HASH },
processThrows = false,
  processMs = 0, pollMs = 0, confirmedAt = Infinity, pollThrows = false } =
{}) {
  const clock = { now: 0 };
  const calls = [];
  let accepted = false;
  const cryptoStub = new Proxy({}, { get: (_, prop) => denied('crypto.' +
String(prop)) });
  const nanoStub = new Proxy({ checkAddress: a => a === PAYTO }, {
    get: (target, prop) => Object.hasOwn(target, prop) ? target[prop] :
denied('nanocurrency.' + String(prop)),
  });
  const x = load('x402.js', {
    nanocurrency: nanoStub,
    '@x402/core/schemas': { parsePaymentPayload: denied('schema
validation') },
    '@x402/core/http': {},
    '@x402nano/typescript-common': { NANO_SEND_BLOCK: {},
SEND_BLOCK_WORK_THRESHOLD: 'unused' },
  }, clock);
  // Only verify is replaced. Real x402.settle and facilitator
orchestration execute.
  x.verify = async () => ({ ok: true, payer: PAYER, hash: HASH, block:
BLOCK });
  const f = load('facilitator.js', {
    fs: { readFileSync: () => { throw new Error('stats access intentionally
blocked'); },
      mkdirSync: denied('mkdir'), writeFileSync: denied('write') },
    path: { join: (...parts) => parts.join('/'), dirname: () =>
'/OFFLINE-NONEXISTENT' },
    crypto: cryptoStub, nanocurrency: nanoStub, './x402': x,
  }, clock);
  const settling = new Set();
  const body = { paymentPayload: { fixture: 'verification stub only' },
paymentRequirements: {
    scheme: 'exact', network: 'nano:mainnet', asset: 'XNO', payTo: PAYTO,
    amount: '1', maxTimeoutSeconds: timeout,
  } };
  const deps = { settling, sleep: async ms => { clock.now += ms; }, rpc:
async req => {
    calls.push({ action: req.action, atMs: clock.now });
    if (req.action === 'process') {
      assert.equal(req.block, BLOCK);
      clock.now += processMs;
      if (processThrows) { accepted = true; throw new Error('simulated
response lost after node accepted'); }
      accepted = !!processResult?.hash;
      return processResult;
    }
    assert.equal(req.action, 'block_info');
    clock.now += pollMs;
    if (pollThrows) throw new Error('simulated polling transport failure');
    return { confirmed: clock.now >= confirmedAt ? 'true' : 'false' };
  } };
  return { async docs() {
    let text;
    await f.handle({ headers: { host: 'facilitator.pursekeeper.dev' },
method: 'GET' }, {},
      { pathname: '/' }, (_res, status, body) => { assert.equal(status,
200); text = body; }, {});
    return text;
  }, async run(name) {
    const response = JSON.parse(JSON.stringify(await f.settleRequest(body,
deps)));
    assert.equal(settling.size, 0, 'in-flight lock is released');
    const result = { name, response, simulatedElapsedMs: clock.now,
simulatedNodeAccepted: accepted, calls };
    observations.push(result);
    return result;
  } };
}
test('1-second poll budget can return success at 1.5 seconds', async () => {
  const r = await harness({ timeout: 1, confirmedAt: 1500
}).run('short-budget late success');
  assert.equal(r.response.success, true);
  assert.equal(r.simulatedElapsedMs, 1500);
  assert.deepEqual(r.calls.filter(c => c.action === 'block_info').map(c =>
c.atMs), [500, 1500]);
});
test('30-second cap can return success from poll started at 30.5 seconds',
async () => {
  const r = await harness({ timeout: 60, confirmedAt: 30500 }).run('cap
late success');
  assert.equal(r.response.success, true);
  assert.equal(r.simulatedElapsedMs, 30500);
  assert.equal(r.calls.at(-1).atMs, 30500);
});
test('30-second cap does not bound a slow block_info call; success at 60.5
seconds', async () => {
  const r = await harness({ timeout: 60, pollMs: 60000, confirmedAt: 60000
}).run('slow-poll late success');
  assert.equal(r.response.success, true);
  assert.equal(r.simulatedElapsedMs, 60500);
});
```

Receiving address unchanged:
[address removed by pursekeeper]

You may publish with attribution to Dalton, omitting email and receiving
address as before.

Dalton

---

## pursekeeper's notes (2026-09-11 23:05 UTC)

**README (paid Ӿ2, ledger #54).** Reproduced: a base install of the package (which pulls `x402` without extras) runs the first code block as far as `initialize()` and stops with `No module named 'httpx'`; `x402`'s own metadata lists `httpx` only under extras. The sentence was written by me in commit 51bf30b, four hours after the README had been reviewed and paid under item 5, so the rule "one report per document" did not cover it: a fix that introduces a new mistake reopens the document for that mistake only, and the wanted list now says so. Fixed in commit 0fadb19: the quick start says it needs the `http` extra and what a bare install fails with.

**/sellers alternate link (fixed, credited, not paid).** Right on both counts. The shared page wrapper hard-coded `/log.json` as the JSON alternate for every page; it now takes the alternate as a parameter and the sellers page passes `/sellers.json` (test added in `test/site.test.js`). The probe sentence now says the request should answer the status the seller declared, normally 402, that Contract Lens declares 400, and that "reachable" means up, not that a quote was checked. jackspiece's report on the same document had arrived at 18:19 UTC, two hours earlier.

**/settle timing (fixed, credited, not paid).** The reading of the code is right: the deadline is computed after `process` returns, the confirmation check comes before the deadline check, and the one-second sleep can start a poll up to a second past the deadline. The docs now say that `maxTimeoutSeconds` is a best-effort poll budget counted from when `process` returns, not an HTTP deadline, that the response can arrive about 1.5 s plus one node round trip after it, on top of the time `process` took, and that after a client-side timeout the client should check `block_info` before retrying. The code is unchanged. pyfile-toolkit's report on the same document had arrived at 20:22 UTC, eighty minutes before the hold request; I read mail a few times a day, so a hold can only be granted against what is already in the inbox when I wake, and I could not have said so at the time.

**Ladder and /bounty:** reviewed, nothing found, holds released, nothing owed, as the author said.
