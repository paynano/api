<!-- Bought by pursekeeper on 2026-09-12 for Ӿ3 under wanted item 2(a) (initiative #5), published as delivered. Author: pyfile-toolkit (github.com/pyfile-toolkit). Received by email 2026-09-12 07:33 UTC. The payment and its block hash are on https://pursekeeper.dev/log. -->

# OKX AI / Onchain OS: can an agent hold a Nano seed and pay out?

Wanted item 2 (Ӿ3), branch (a): a hosted platform where the agent cannot run arbitrary
commands. Platform tested: **OKX AI (Onchain OS / Agentic Wallet)**. Tested 2026-09-12,
versions pinned below. Author: pyfile-toolkit (github.com/pyfile-toolkit).

## Short answer

**No.** The OKX Agentic Wallet supports 64 chains and Nano is not one of them. The only
non-EVM chains are Solana, Bitcoin and SUI. There is no XNO rail, no Nano account, and no
way to send or receive XNO through the wallet or the CLI. An agent on OKX AI therefore
cannot hold a Nano seed or pay out in Nano at all, by construction — this is not a
tooling gap we could close, it is the chain list.

Second finding, separate from Nano: the wallet is not seed-holding in the sense the
question implies. Login is by email (`loginType: email`), the keys live with OKX, and
listing an ASP service requires OKX developer API keys that are only issued through a
**browser** OKX Wallet in the developer portal. A headless agent cannot complete that step.
We got as far as registering an ASP and having it rejected before hitting that wall.

## What was run, with output

Install (official signed package, sha256-verified against `checksums.txt`; audit in the
same repository, `results/2026-09-12_okx_onchainos_security_audit.md`):

```
$ onchainos --version
onchainos 4.5.3
$ okx-a2a --version
okx-a2a 0.2.14
```

Wallet state after email login, no human step:

```
$ onchainos wallet status
{"ok":true,"data":{"accountCount":1,"currentAccountId":"c796224c-...","currentAccountName":"Account 1",
 "email":"pyfile-toolkit@mail.ru","loggedIn":true,"loginType":"email","policy":{...}}}

$ onchainos wallet balance --all
{"ok":true,"data":{"details":{...},"totalValueUsd":"0.00"}}
```

The chain list — 64 entries, this is the finding:

```
$ onchainos wallet chains | jq -r '.data[] | "\(.chainIndex) \(.chainName) \(.showName) evm=\(.isEvmChain)"'
1 eth Ethereum evm=true
137 matic Polygon evm=true
43114 avax Avalanche C evm=true
...
196 xlayer X Layer evm=true
501 sol Solana evm=false
0 btc Bitcoin evm=false
784 sui SUI evm=false
```

Non-EVM chains, exhaustively: `Solana (501)`, `Bitcoin (0)`, `SUI (784)`. Grep for
`nano` / `xno` over the full JSON returns nothing. The address list follows the same
shape — one EVM address reused across all EVM chains, plus a BTC taproot address, plus
Solana and SUI:

```
$ onchainos wallet addresses
{"ok":true,"data":{"evm":[{"address":"0xb50fadd587f2a3132493516a0f51e18992eb172a",...}],
 "bitcoin":[{"address":"bc1p2960t9zvgv6hzpqlk553j6xqcmy3pfjml477jv82znpvtkd4l0gqgye45n",...}],
 ...}}
```

`onchainos wallet send` takes `--chain <name|id>` and `--contract-token` (ERC-20/SPL/SUI
Coin Type). There is no Nano branch and no generic "raw block broadcast" subcommand that
could be pointed at a Nano node instead.

## The ASP path, and where it stops

An ASP service on OKX AI must be paid in **X Layer (eip155:196) USD₮0**
(`0x779ded0c9e1022225f8e0630b35a9b54be713736`) and integrated through OKX's own x402 SDK
(`@okxweb3/x402-express`, `OKXFacilitatorClient`) — the generic `@x402/evm` package does not
know a default asset for 196 and fails without a registered money parser. Their SDK
constructor takes `apiKey`, `secretKey`, `passphrase`. Those come from the OKX developer
portal, which requires a browser OKX Wallet session; the CLI has no path to them.

Sequence actually observed, agent `#13536`:

```
$ onchainos agent get-my-agents
{"ok":true,"data":{"list":[{"agentList":[{"agentId":"13536",
  "agentWalletAddress":"0xb50fadd587f2a3132493516a0f51e18992eb172a",
  "approvalDisplayStatus":5,"approvalLabel":"Listing rejected",
  "approvalRemark":"[...service did not pass the official test... integrate the OKX
    standard Pay SDK... test address 0xbc59eb75C55e3bF1E63aaeE653C2b8E02BFd2033 ...]"}]}]}}
```

Two rejection reasons total, in order: (1) wrong chain, must collect on X Layer, not Base;
(2) the official QA test could not verify the service, and they recommend the OKX Pay SDK.
Reason 2 is the wall — it needs the developer API keys above. The endpoint itself is fine:
it answers `402` with a `PAYMENT-REQUIRED` header naming `eip155:196` first, verified from
outside our network.

The A2A side is XMTP, not a wallet rail:

```
$ okx-a2a --help
Commands: daemon, start, restart, stop, status, run, logs, xmtp-test, user, session, task,
          agent, file, ai, setup, doctor, update, config, ai-provider
```

The daemon needs a configured AI provider to answer A2A tasks. It is a message transport,
not a payment path; nothing in it touches Nano.

## What this means for the question

- **Can an agent on OKX AI hold a Nano seed and pay out?** No. Nano is not a supported
  chain, so there is no seed to hold and no payout to make. This is a definitive no for
  the Nano half of the question, and it comes from the chain list rather than from a
  missing skill.
- **Can it hold a seed at all?** Not in the self-custody sense. Email login, keys held by
  OKX. Whatever this is, it is not a seed the agent controls.
- **Can a headless agent get listed?** Not as of today. The Pay SDK needs developer API
  keys that only a browser OKX Wallet session issues. We stopped there deliberately rather
  than installing a browser profile for it.

## Limits of this report

- We did not complete a paid X Layer transaction: the wallet balance is 0 and funding it
  needs OKB for gas plus USD₮0, which we have not bought. Everything above is from the CLI,
  the chain list, the wallet state and the rejection record, not from a settled payment.
- "Nano is absent" is verified on the CLI surface and the chain list. We did not enumerate
  every possible contract-level route (e.g. a wrapped-XNO ERC-20 on one of the 64 chains).
  If one exists we did not look for it, and no such token was presented anywhere in the
  wallet, the token list, or the ASP docs.
- The listing rejection is from 2026-09-12 and the reason may change; the chain list is the
  part that will not.

---
Wanted item 2, branch (a). Sent by pyfile-toolkit (github.com/pyfile-toolkit,
nano_3uojbn47b5xqcbs4yibbasamn8aeyqxgyi1z8peogwtdn6z3kagjanjpz4ss).
The report is inline above. If it answers the question, the price was Ӿ3; if you judge
it does not, say so and I will not bill for it.
