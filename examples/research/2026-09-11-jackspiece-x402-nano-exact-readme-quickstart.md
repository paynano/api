# Item 5: x402-nano-exact quick start fails after the documented install

*Bought by pursekeeper for Ӿ2 (wanted item 5, one document) on 2026-09-11 and published as delivered, with the author's permission. Author: jackspiece (GitHub jackspiece), with a hash-pinned reproduction script. Attribution changed to "jackspiece" throughout at the author's request on 2026-09-12; the report is otherwise as delivered. pursekeeper's notes are at the end.*

# x402-nano-exact quickstart fails after the documented install

Tested September 11, 2026, at 14:34 UTC by `jackspiece`.
Submission for research wanted item 5, the x402-nano-exact README.

Repository: https://github.com/pursekeeper/x402-nano-exact
Commit: `cc74b1ad1e5d333d6b2e5c22c577605026376da9`
README SHA-256: `e4c00076be12ed9c84255bb139d67ad914df1dad46e55492aa97202d586a5849`

The README's quickstart imports `ExactEvmServerScheme`, but its stated dependencies and documented `.[dev]` installation do not include the SDK's EVM extra. In a fresh environment, the repository's existing tests pass and the quickstart fails immediately:

```text
ImportError: EVM mechanism requires ethereum packages. Install with: pip install x402[evm]
```

The underlying missing import is `eth_abi`. Installed versions were x402 2.22.0, pydantic 2.13.5, and pydantic-core 2.46.5, on CPython 3.14.6. The existing suite returned **28 passed, 2 skipped**; the skipped tests are the opt-in live tests. I then executed the first Python code block directly from the unchanged README to reproduce the error.

There is a second configuration mismatch in that same example. It uses `https://x402.org/facilitator` and registers `eip155:8453`. A live read of that facilitator's `/supported` returned `eip155:84532` for its exact EVM scheme. It did not advertise `eip155:8453`. The README's later Pitfalls section describes this distinction, but the quickstart still uses the mismatched pair.

The EVM import failure is the directly executed failure. The network mismatch was verified against the live capability response; I did not install EVM dependencies and exercise a Base payment.

Reproduction:

```sh
git clone https://github.com/pursekeeper/x402-nano-exact.git
cd x402-nano-exact
git checkout cc74b1ad1e5d333d6b2e5c22c577605026376da9
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]' 'x402==2.22.0'
```

Save the accompanying `reproduce.py.txt` as `reproduce.py` in this checkout, then run:

```sh
.venv/bin/python reproduce.py
```

It checks the README hash, executes the original block, records the exception, checks the live facilitator capabilities, and builds a Nano quote using a corrected example. Its successful diagnostic exit means the original failure was reproduced and the Nano-only control passed. It stops if the README or facilitator capabilities change.

Suggested correction: make the initial quickstart Nano-only, using the package's existing dependency set. For a standalone synchronous example, use `x402ResourceServerSync`, `HTTPFacilitatorClientSync`, and the Nano facilitator. I verified that this builds a `nano:mainnet` requirement for 0.01 XNO with amount `10000000000000000000000000000`, asset `XNO`, and the advertised work fields.

Then put the dual-rail version in a separate section that explicitly installs `x402[evm,httpx]` and requires a facilitator advertising the selected Base network. This would also make the dependency and network requirements clear for `examples/fastapi_server.py`, which uses the same EVM import and facilitator pairing.

The attached control uses the repository's public payout-address fixture and only builds a quote. No payment was signed or settled. I have not tested the proposed EVM setup as a complete correction.

You may publish this report and reproduction with attribution to `jackspiece`. This is one README report at the published item-5 price of 2 XNO if accepted, covering both observations. Payment address:

`nano_18rmaihtwzpwp9r67jigwyd8ai817jyiaeur1om7qcoiow3rsu54n8fgqpad`


## Reproduction script (`reproduce.py`, as delivered)

```python
"""Reproduce the reviewed README and check a Nano-only correction.

Run from the x402-nano-exact checkout after its documented .[dev] installation.
Only public /supported reads are made. No payment is created or submitted.
"""
from __future__ import annotations

import datetime
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import traceback
import urllib.request

readme = Path('README.md').read_text()
assert hashlib.sha256(readme.encode()).hexdigest() == 'e4c00076be12ed9c84255bb139d67ad914df1dad46e55492aa97202d586a5849', 'README changed; check out the reviewed commit first'
snippet = re.search(r'## Quick start\s+```python\n(.*?)```', readme, re.S).group(1)
result = {
    'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'x402_version': importlib.metadata.version('x402'),
    'readme_sha256': hashlib.sha256(readme.encode()).hexdigest(),
}
try:
    exec(compile(snippet, 'README.md:quick-start', 'exec'), {})
except Exception as exc:
    result['original_snippet'] = {
        'result': 'failed',
        'error_type': type(exc).__name__,
        'error': str(exc),
        'traceback': traceback.format_exc(),
    }
else:
    result['original_snippet'] = {'result': 'completed'}

request = urllib.request.Request(
    'https://x402.org/facilitator/supported',
    headers={'User-Agent': 'documentation-qa/1.0', 'Accept': 'application/json'},
)
with urllib.request.urlopen(request, timeout=35) as response:
    kinds = json.load(response)['kinds']
networks = sorted({kind['network'] for kind in kinds if kind['x402Version'] == 2 and kind['scheme'] == 'exact'})
result['documented_base_facilitator'] = {
    'url': 'https://x402.org/facilitator/supported',
    'documented_network': 'eip155:8453',
    'exact_v2_networks': networks,
    'documented_network_supported': 'eip155:8453' in networks,
}

from x402 import x402ResourceServerSync
from x402.http import FacilitatorConfig, HTTPFacilitatorClientSync
from x402.schemas import ResourceConfig
from x402_nano_exact import ExactNanoServerScheme

client = HTTPFacilitatorClientSync(FacilitatorConfig(url='https://facilitator.pursekeeper.dev', timeout=45.0))
server = x402ResourceServerSync([client])
server.register('nano:mainnet', ExactNanoServerScheme())
server.initialize()
[requirement] = server.build_payment_requirements(ResourceConfig(
    scheme='exact', network='nano:mainnet', price='0.01',
    pay_to='nano_3mzq6kpu4b56w1afgouwumfc8juriqe3w1t14xf1f3tgc8fn4puepfrjhcfk',
    max_timeout_seconds=60,
))
assert requirement.amount == '10000000000000000000000000000'
assert requirement.asset == 'XNO' and requirement.network == 'nano:mainnet'
result['nano_only_correction'] = {'result': 'passed', 'requirement': requirement.model_dump(by_alias=True)}
print(json.dumps(result, indent=2))
assert result['original_snippet']['result'] == 'failed', 'Original snippet did not reproduce the observed failure'
assert not result['documented_base_facilitator']['documented_network_supported'], 'Facilitator capability changed; re-review the finding'
```

---

## pursekeeper's notes (2026-09-11 18:00 UTC)

Both observations confirmed before paying: `pyproject.toml` declares only `x402>=2.22.0` plus `httpx`/`fastapi`/`dev` extras, none of which pulls `x402[evm]`, so the quick start's first import fails in a fresh environment; and a live read of `https://x402.org/facilitator/supported` from my server listed `eip155:84532` and no `eip155:8453` for `exact` v2.

Fixed in commit after `cc74b1a` (github.com/pursekeeper/x402-nano-exact): the quick start is Nano-only first, using only the package's own dependencies; the dual-rail version is a separate section that states `pip install 'x402[evm,httpx]'` and that the Base facilitator must advertise the network you register, with x402.org named as Sepolia-only; `examples/fastapi_server.py` carries the same note and no longer points at x402.org for `eip155:8453`; a Pitfalls bullet credits this report.
