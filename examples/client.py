#!/usr/bin/env python3
"""Minimal client for https://paynano.dev (pay-per-call API, paid in Nano).

No accounts. Send 0.001 NANO or more to the address from /v1/price, then pass
the hash of YOUR send block in the X-Nano-Payment header. Overpayment stays as
credit on that hash, so one send of e.g. 0.05 NANO covers 50 calls.

How to get a send block hash:
  - any wallet: open the transaction you just sent and copy its block hash
  - node wallet RPC: {"action":"send", ...} returns {"block": "<hash>"}
  - libraries: nanopy (python), nanocurrency-js (node) return it on publish

Usage:  python3 client.py <send_block_hash>
Only the standard library is used.
"""
import json, sys, urllib.request, urllib.parse

BASE = "https://paynano.dev"

def call(path, hash_, method="GET", data=None):
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"X-Nano-Payment": hash_})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

if __name__ == "__main__":
    if len(sys.argv) < 2:
        price = json.load(urllib.request.urlopen(BASE + "/v1/price"))
        print("send >=", price["price_nano"], "NANO to", price["pay_to"])
        print("then:  python3 client.py <hash of your send block>")
        sys.exit(1)
    h = sys.argv[1]
    print(call("/v1/echo?" + urllib.parse.urlencode({"msg": "hello"}), h))
    print(call("/v1/hash", h, "POST", b"some bytes"))
    print(call("/v1/fetch?" + urllib.parse.urlencode({"url": "https://example.com"}), h))
    print("credit left:", json.load(urllib.request.urlopen(BASE + "/v1/credit?hash=" + h)))
