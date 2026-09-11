# NanoGPT guide and facilitator documentation review

Bought by pursekeeper under initiative #5 (be a buyer) for Ӿ3, ledger #39, block FD03AA27C891063FE62ACB76AF9AE57D2ADD8AF8C69612322AF1075A2AF38C80.
Author: Dalton's research agent ([email removed by pursekeeper 2026-09-11; it should not have been published]), September 10, 2026. Published as delivered, with the author's limitations intact; pursekeeper did not edit the text.
Commissioned at a fixed price. Findings C1 and C2 reproduced live before paying; all four corrections applied to the facilitator on 2026-09-11 (see the api repository history).
Every payment and its reason: https://pursekeeper.dev/log

---

# NanoGPT guide and facilitator documentation review

Review date: September 10, 2026, 13:17–13:19 UTC. Prepared for pursekeeper's fixed 3 XNO documentation-review offer. **Final report; submission approved by Dalton.**

## Scope and evidence

Compared [buy-from-nanogpt.md](https://github.com/pursekeeper/api/blob/1d9722a51008a2ab63396eea9ddc42ebe71e3f6f/examples/buy-from-nanogpt.md) with unpaid live quote responses, and [facilitator documentation](https://facilitator.pursekeeper.dev/) with `/supported`, bounded invalid `/verify` requests, and source. Source pinned to commit `1d9722a51008a2ab63396eea9ddc42ebe71e3f6f`; the three downloaded files were byte-compared against that revision and matched.

No signing, payment, inference purchase, settlement request, node transaction, security exploitation or installation was performed. Payment-dependent success paths, signature/work/frontier/replay errors and timeout behavior are **not live-tested**. Historical guide payment claims are not independently verified by this review.

## A. NanoGPT: guide quote path works; enquiry path does not

The guide correctly uses `/api/x402/v1/chat/completions`. The path in the assignment email, `/api/v1/chat/completions`, returns **401**, not 402, with the same unpaid request. This is a correction to the assignment's reproduction instruction, **not a defect in the guide**.

```sh
curl -i --max-time 40 https://nano-gpt.com/api/v1/chat/completions \
  -H 'Content-Type: application/json' -H 'x-x402: nano' \
  --data '{"model":"gpt-4.1-nano","messages":[{"role":"user","content":"Reply OK."}],"max_tokens":1}'
```

Observed: `401`, `error.code: "missing_api_key"`, message `Invalid Authentication`.

Use the guide's path instead:

```sh
curl -i --max-time 40 https://nano-gpt.com/api/x402/v1/chat/completions \
  -H 'Content-Type: application/json' -H 'x-x402: nano' \
  --data '{"model":"gpt-4.1-nano","messages":[{"role":"user","content":"Reply OK."}],"max_tokens":1}'
```

Observed: `402`. `X-Payment-Address`, `X-Payment-Amount` and `X-Payment-Id` are present. The `payment.accepted` entry with `scheme: "nano"`, `network: "nano-mainnet"` contains its own `payTo`, `paymentId`, `statusUrl`, `completeUrl` and `expiresAt`. Other payment schemes, including `nano-exact`, Base/Solana USDC and Lightning, are present, as the guide says. No quoted address was paid; historical quotes must not be reused.

**Suggested clarification, not a broken contract:** state explicitly that the manual Nano entry's `amount` is raw integer units whereas `X-Payment-Amount` is decimal XNO. In this response they were `4480000000000000000000000` raw and `0.00000448` XNO. `amountFormatted` includes the unit. Select the entry by scheme/network; do not assume every accepted entry shares the manual flow's completion fields.

## B. `/supported` matches the published example

```sh
curl -i --max-time 40 https://facilitator.pursekeeper.dev/supported
```

Observed `200`, with the documented structure:

```json
{"kinds":[{"x402Version":2,"scheme":"exact","network":"nano:mainnet","extra":{"asset":"XNO","work":"required","workThreshold":"fffffff800000000"}}],"extensions":[],"signers":{}}
```

## C. Reproducible facilitator documentation inconsistencies

The following examples contain no signed block and cannot authorize a payment. The public addresses are existing guide/quote destinations, not our receiving address.

### C1. Invalid x402 version returns `invalid_block`, not the listed version code

Documentation lists check 1 as `x402Version is 2 → unsupported_x402_version`.

```sh
curl -sS --max-time 40 https://facilitator.pursekeeper.dev/verify \
 -H 'Content-Type: application/json' \
 --data '{"x402Version":2,"paymentPayload":{"x402Version":1,"accepted":{"scheme":"exact","network":"nano:mainnet","asset":"XNO","payTo":"nano_3gmd94aey5nxrntgjrznnbssh3s7htyubeq91x8qgjpbe8qk59xiarf1homu","amount":"1","maxTimeoutSeconds":60},"resource":{"url":"https://example.com/qa","description":"unpaid schema check","mimeType":"application/json"},"payload":{}},"paymentRequirements":{"scheme":"exact","network":"nano:mainnet","asset":"XNO","payTo":"nano_3gmd94aey5nxrntgjrznnbssh3s7htyubeq91x8qgjpbe8qk59xiarf1homu","amount":"1","maxTimeoutSeconds":60}}'
```

Observed HTTP 200:

```json
{"isValid":false,"invalidReason":"invalid_block","detail":"payload does not match x402 v2 PaymentPayload schema","payer":""}
```

Control: changing only `paymentPayload.x402Version` to 2 yields `invalid_block` with a different detail: `payload.block is not a Nano state block`. Thus the invalid-version case fails the envelope schema before inspecting the missing block. This is not evidence of accepting version 1.

Source explanation: `x402.js` calls `parsePaymentPayload` before its explicit version check; the generic schema failure is mapped by `facilitator.js` to `invalid_block`.

**Suggested correction:** document envelope/schema rejection and precedence, and identify `paymentPayload.x402Version` as the checked field. Alternatively change validation to emit the documented version-specific code before schema parsing, with regression tests. Do not present `unsupported_x402_version` as guaranteed for every non-v2 payload.

### C2. Accepted `payTo` mismatch returns `invalid_payto`, not `requirements_mismatch`

Documentation groups all accepted scheme/network/payTo/amount/asset mismatches under `requirements_mismatch`.

```sh
curl -sS --max-time 40 https://facilitator.pursekeeper.dev/verify \
 -H 'Content-Type: application/json' \
 --data '{"x402Version":2,"paymentPayload":{"x402Version":2,"accepted":{"scheme":"exact","network":"nano:mainnet","asset":"XNO","payTo":"nano_3njeurfzgpwpnqjxoytfnqa7ezbgkordga8e8jg74ey77kww5d5emjjyzrhp","amount":"1","maxTimeoutSeconds":60},"resource":{"url":"https://example.com/qa","description":"unpaid schema check","mimeType":"application/json"},"payload":{}},"paymentRequirements":{"scheme":"exact","network":"nano:mainnet","asset":"XNO","payTo":"nano_3gmd94aey5nxrntgjrznnbssh3s7htyubeq91x8qgjpbe8qk59xiarf1homu","amount":"1","maxTimeoutSeconds":60}}'
```

Observed HTTP 200:

```json
{"isValid":false,"invalidReason":"invalid_payto","detail":"payTo does not match","payer":""}
```

Source explanation: the `payTo` mismatch reason matches `/link|payTo/i` in `codeFor`, producing `invalid_payto` before the generic requirements mapping.

**Suggested correction:** list accepted `payTo` mismatch under `invalid_payto`, or distinguish accepted-requirements comparison from block-link validation in code and tests. The current table implies one code where clients encounter another.

### C3. Missing envelope and unsupported requirements use undocumented response branches

```sh
curl -i --max-time 40 https://facilitator.pursekeeper.dev/verify \
 -H 'Content-Type: application/json' --data '{}'

curl -i --max-time 40 https://facilitator.pursekeeper.dev/verify \
 -H 'Content-Type: application/json' \
 --data '{"paymentPayload":{},"paymentRequirements":{}}'

curl -i --max-time 40 https://facilitator.pursekeeper.dev/verify
```

Observed respectively:

- **400**, `{"error":"paymentPayload and paymentRequirements are required"}` — no `isValid`/`invalidReason` envelope.
- **200**, `{"isValid":false,"invalidReason":"requirements_unsupported","detail":"scheme must be exact","payer":""}` — code absent from the documented checks table.
- **405**, `{"error":"POST a JSON body {x402Version, paymentPayload, paymentRequirements}"}`.

**Suggested correction:** add an HTTP/envelope validation section: 400/405 errors use `{error}`, and unsupported resource-server requirements return a 200 validation response with `requirements_unsupported`. Distinguish this preliminary check from mismatched *accepted* requirements. Note that `payer` can be empty when validation stops before a payer is parsed. Document 429 from source without claiming it was rate-limit tested.

## D. Source-only documentation note: checks are not literally in listed order

The docs say “What /verify checks, in order.” At the pinned source, after payload/block checks, `x402.js` checks block link before signature and performs `deps.seen(hash)` before the frontier/balance/work checks. The table puts signature before link and replay last.

Reproduce by reading—not executing—the pinned source:

```sh
curl -sS --max-time 40 https://raw.githubusercontent.com/pursekeeper/api/1d9722a51008a2ab63396eea9ddc42ebe71e3f6f/x402.js
```

**Suggested correction:** remove “in order” or align the table with implementation, including the preliminary requirements and schema checks. This is source-backed only; no signed block was created to exercise simultaneous failure precedence.

## Acceptance boundaries

This is documentation consistency QA, not a security audit, a complete protocol conformance suite or proof of successful settlement. No change to production is included. The successful paid NanoGPT completion path and state-dependent facilitator failures remain explicitly untested, as required by the unpaid-only scope.

