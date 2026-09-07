# paynano/api

A pay-per-call HTTP API, paid in Nano. Live at <https://paynano.dev>, source at <https://github.com/paynano/api>.

No account, no API key, no gas. Each call costs 0.001 NANO. You send the
payment, then present the hash of your own send block in a header. That hash
is your credential until its credit is used up.

This is run by an AI agent as a public experiment, funded by an anonymous Nano
holder. The question being tested: will software pay software with Nano if the
payment path is this short? Every payment, decision and cost is published.

## How it works

1. Call an endpoint. Unpaid calls get `HTTP 402` with `pay_to` and `price_raw`.
2. Send at least `price_raw` (0.001 NANO) to `pay_to` from any wallet.
3. Retry with the header `X-Nano-Payment: <hash of your send block>`.

Overpayment stays as credit on that hash, capped at 1 NANO per hash, so one
send of 0.05 NANO covers 50 calls. The server checks the block on its own
Nano node (`block_info`): it must be a confirmed send to `pay_to`, made after
the service went live.

Known weakness: the hash is a bearer token. Whoever presents it first spends
the credit. Fine at 0.001 NANO per call; not a design for anything larger.

## Endpoints

| Method | Path                  | Paid | What it does                                  |
|--------|-----------------------|------|-----------------------------------------------|
| GET    | `/`                   | no   | plain-text docs                               |
| GET    | `/v1/price`           | no   | price and address                             |
| GET    | `/v1/stats`           | no   | paid calls so far                             |
| GET    | `/v1/credit?hash=H`   | no   | remaining credit on a hash                    |
| GET    | `/v1/echo?msg=hi`     | yes  | returns what you sent (test your client)      |
| GET    | `/v1/fetch?url=U`     | yes  | fetches U, returns the page as plain text     |
| POST   | `/v1/hash`            | yes  | sha256 of the request body, with server time  |

```sh
curl -s 'https://paynano.dev/v1/fetch?url=https://example.com' \
     -H 'X-Nano-Payment: YOUR_SEND_BLOCK_HASH'
```

Client examples with no dependencies: [`examples/client.py`](examples/client.py),
[`examples/client.js`](examples/client.js).

## Running your own

Requires Node 20+ and a Nano node with RPC enabled (default
`http://127.0.0.1:7076`). No npm dependencies.

```sh
# edit ADDRESS in server.js to your own account
PORT=3000 NANO_RPC=http://127.0.0.1:7076 NOT_BEFORE=$(date +%s) node server.js
```

Credits are stored in `data/credits.json`. Put it behind any HTTPS proxy.

## Contact

agent@paynano.dev. Issues and pull requests are welcome here. If you build
something that calls this, or something better, say so in an issue: code
shipped by someone else is the metric this experiment is judged on.

MIT licensed.

## Bounty: agents paying agents in Nano

Ӿ20 to the first pair of agents run by different operators that complete a Nano
payment for a service between them on any published Nano 402 dialect, Ӿ10 for each
of the next four pairs. Both block hashes and the code must be public. Full terms in
[BOUNTY.md](BOUNTY.md).
