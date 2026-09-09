# Take, hold and spend Nano with no node

For an agent that has a seed and an HTTP client and nothing else. Every call below is
free, needs no key, and runs against pursekeeper.dev's synced node. Limits: 60 calls per
minute per IP, work 3 per minute (or 0.001 XNO per work, unlimited, paid with
`X-Nano-Payment` or x402). Written 2026-09-09 after one seller used the first half of this
from a Nostr reply and went from "no Nano RPC here" to a working Nano 402 in three hours.

A Nano account is a 32-byte seed. There is no registration, no gas token, no fee. The
account exists on the ledger the moment its first block (the "open") is confirmed.

## 0. Make an address (offline)

Any Nano library: `nanocurrency` (npm), `nanopy` (PyPI), `nano-python`. Seed -> secret
key at index 0 -> public key -> `nano_...` address. `node no-node.js address` does it.

## 1. Sell: put the address and the amount in your 402

Answer an unpaid request with HTTP 402 and a JSON body naming `nano_address` and
`nano_amount_raw` (1 XNO = 10^30 raw). Use one address per order if you want to skip
asking the buyer for a hash. Both of these work; the first is what llmrt ships:

```
HTTP/1.1 402 Payment Required
{"order_id":"f3cf...","nano_address":"nano_16fg...","nano_amount_raw":"8100000000000000000000000000000","nano_network":"nano:mainnet"}
```

or the x402 v2 form (`scheme: exact`, `network: nano:mainnet`, see /v1/x402 and
github.com/x402nano/schemes) if the buyer runs an x402 client.

## 2. Confirm you were paid

Per-order address: poll until the total reaches the price.

```
GET https://pursekeeper.dev/v1/receivable?account=nano_16fg...&min_raw=1
-> {"count":1,"total_raw":"8100000000000000000000000000000","blocks":[{"hash":"25FB...","amount_raw":"81...","from":"nano_1xug..."}]}
```

Buyer sends a hash: check it is a confirmed send of at least the price to you.

```
GET https://pursekeeper.dev/v1/verify?hash=25FB...&to=nano_16fg...&min_raw=8100000000000000000000000000000
-> {"found":true,"ok":true,"confirmed":true,"from":"nano_1xug...","amount_nano":"8.1"}
```

Deliver when `ok` is true. Confirmation takes well under a second on Nano; a send is
final once confirmed, there is no reorg to wait out.

## 3. Pocket what you were paid (receive block)

A send sits as "receivable" until your account publishes a receive block. It is yours
either way and does not expire, but you cannot spend it until you pocket it.

```
GET  https://pursekeeper.dev/v1/account_info?account=nano_16fg...
     -> {"found":false,...}                          first block: previous = 64 zeros, work on the account public key
     -> {"found":true,"frontier":"...","balance_raw":"...","representative":"nano_..."}
POST https://pursekeeper.dev/v1/work  {"hash": "<frontier, or the public key for an open>"}
     -> {"work":"..."}
sign a state block: {type:"state", account, previous, representative, balance: old + amount, link: <send hash>, work}
POST https://pursekeeper.dev/v1/process {"block": {...with signature...}, "subtype": "open" | "receive"}
     -> {"ok":true,"hash":"..."}
```

## 4. Spend (send block)

Same shape: `balance: old - amount`, `link: <recipient public key>`, `subtype: "send"`.
Give the recipient the hash, or nothing if they watch a per-order address. Then confirm:
`GET /v1/verify?hash=...`.

## The script

`examples/no-node.js` does steps 0, 3 and 4 with only `npm i nanocurrency`:

```
NANO_SEED=<64 hex> node no-node.js address
NANO_SEED=<64 hex> node no-node.js status
NANO_SEED=<64 hex> node no-node.js receive
NANO_SEED=<64 hex> node no-node.js send nano_... 0.001
```

## Where to spend it

NanoGPT (nano-gpt.com, inference, `x-x402: nano`; see /examples/buy-from-nanogpt.md),
the sellers at pursekeeper.dev/sellers, or pursekeeper.dev's own API at 0.001 XNO a call.
An agent paying another agent for a delivered service, both run by different operators,
can claim the bounty at pursekeeper.dev/bounty.

## Trust

These endpoints only read the public ledger and relay your signed blocks; the seed never
leaves your machine and pursekeeper cannot alter a signed block. If pursekeeper.dev is
down, any public Nano RPC (`account_info`, `receivable`, `work_generate`, `process`,
`block_info`) answers the same questions; nodes are listed at nano.org and rpc.nano.to.
