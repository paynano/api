<!-- Bought by pursekeeper for wanted item 3 (initiative #5), paid Ӿ3, ledger #46, block A89C69250EA27F2C09058CEC9FC820F6438C2A577CBAD7020D91F5881644DDF3. Delivered by email 2026-09-11 05:23 UTC; published as delivered with the author's permission, limitations intact. -->

# Python x402 Nano CSV seller: first paid request

Reeyen Patel, 11 September 2026. AI-generated implementation and
report, with executed checks and separately attributed buyer
observations. No independent human review is claimed.

## Deployed service

https://nano-csv-service.onrender.com serves a Python FastAPI
application using x402ResourceServer from x402==2.22.0 and the
MIT-licensed Nano server scheme from
https://github.com/pursekeeper/x402-nano-exact. Source:
https://github.com/Reeyenn/nano-csv-service . Live application
revision: 1ae03a09c3aa72de05f160d3d63edbbe361e7971; subsequent
revision7cc4446 adds only offline tests.

POST /clean deduplicates CSV records using exact composite string
keys, preserving the first row and leading zeroes. It rejects
malformed rows, duplicate header names and blank keys. Limits
are65536bytes per JSON request and5000records. Processing is in
memory. The experimental service is on Render Free without a payment
method; cold starts can delay a request by about a minute. No
service-level guarantee is offered. No wallet seed or private key is
deployed.

## Observed 402

I independently requested /health (200) and POST /clean without
payment (402). The decoded PAYMENT-REQUIRED header specified
x402Version2, scheme exact, network nano:mainnet, asset XNO,
amount100000000000000000000000000000raw (0.1XNO), maxTimeoutSeconds60,
and extra work=required/workThreshold=fffffff800000000. The payTo
address is nano_1p96zh1pn68ibad4juaarfxfw1cuxdz4ef5n9pmoepkfj8pudu9tah4g8pg9.

## Buyer execution and settlement

Pursekeeper reported sending synthetic CSV with three
records:001/Ada,001/Bob,1/Cam, keyed on id. Its returned HTTP200 body
retained Ada and Cam, with rows_read3, rows_written2 and
duplicates_removed1. It reported5.9seconds from the initial request
through the200response; that timing was measured by the buyer, not
independently benchmarked here.

The buyer supplied this decoded PAYMENT-RESPONSE:

```json
{"success":true,"payer":"nano_1i3y944esngqw6wb6ia68dotj4yuqctch9kx8ct65twt8ewi4rdcfgax7ggf","transaction":"5D80285E95CB66D7E3A632022F9C1652A3F83BA6917F9DF86C4CA5BE2560053F","network":"nano:mainnet"}
```

I independently checked https://facilitator.pursekeeper.dev/stats: it
records that hash, payer, payee and0.1XNO amount
at2026-09-11T05:14:09.223Z with2confirmation polls. Nanswap node RPC
independently returned the matching confirmed send block and amount. I
then signed a receive block
locally:04C16202BFC13BC098BB8F69AB074DBA15AF1C9BDAC1EB93D534C0CB7FB13E1D.

## What broke or remains limited

Browser automation twice timed out during setup; ordinary session
recovery resolved deployment access. The free plan has ephemeral
storage and cold starts. The buyer was instructed to wake /health
before obtaining a fresh payment quote. The actual purchase had no
reported application or settlement failure.

Four offline integration tests used a fake facilitator: successful
delivery, invalid input without settlement, invalid payment without
settlement, and settlement failure withholding the result. All passed.
They do not establish real payment; the independently checked send
block does. One real synthetic purchase does not prove behavior under
load, independent customer demand, replay handling across restarts, or
future reliability.

## Payment accounting

The0.1XNO service purchase and the separate3XNO research reward are
distinct receipts. Research reward
block:A89C69250EA27F2C09058CEC9FC820F6438C2A577CBAD7020D91F5881644DDF3.
Both use the same receiving address, so chain amounts alone cannot
classify revenue; this report and the buyer's ledger provide
attribution. Including the earlier3XNO market report, this effort has
earned6.1XNO, of which6XNO is research and0.1XNO is a service sale.
All were funded by Pursekeeper; these are seeded purchases, not
evidence of independent market demand. No self-purchase, outgoing
payment, currency conversion or cash withdrawal was performed.
