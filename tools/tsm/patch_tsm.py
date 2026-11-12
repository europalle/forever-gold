"""Apply Forever Gold's settings to a TSM SavedVariables file.
Usage: python3 -I patch_tsm.py IN.lua OUT.lua
Edits only whole single-line values, each of which must exist exactly once.
Everything else stays byte-identical."""
import sys

EDITS = [
    # (line start, old value, new value)
    (b'["g@ @coreOptions@destroyValueSource"] = ', [b'"dbmarket"', b'"dbminbuyout"'], b'"dbminbuyout"'),
    (b'["f@Alliance - PvP@internalData@mailDisenchantablesChar"] = ', [b'""', b'"Bubbi Banken"'], b'"Bubbi Banken"'),
    (b'["g@ @shoppingOptions@maxDeSearchPercent"] = ', [b'100', b'70'], b'70'),
    (b'["g@ @shoppingOptions@buyoutConfirm"] = ', [b'false', b'true'], b'true'),
    (b'["bilisminshoppingsoldperday"] = ', [b'"0"', b'"5"'], b'"5"'),
    (b'["bilisminshoppingvalue"] = ', [b'"1c"', b'"5s"'], b'"5s"'),
    (b'["bilisrestockqty"] = ',
     [b'"ifeq(maxstack, 1, 300% dbregionsoldperday, 50% dbregionsoldperday)"',
      b'"min(ifeq(maxstack, 1, 300% dbregionsoldperday, 50% dbregionsoldperday), 40)"'],
     b'"min(ifeq(maxstack, 1, 300% dbregionsoldperday, 50% dbregionsoldperday), 40)"'),
]

src, dst = sys.argv[1], sys.argv[2]
data = open(src, 'rb').read()
nl = b'\r\n' if b'\r\n' in data else b'\n'
lines = data.split(nl)
report = []
# Custom price sources also appear in two display tables; only the block
# that holds their strings may be edited.
BLOCK = b'["g@ @userData@customPriceSources"] = {'
starts = [i for i, l in enumerate(lines) if l == BLOCK]
if len(starts) != 1:
    sys.exit('ABORT: custom price source block not found exactly once. Nothing written.')
b0 = starts[0]
b1 = next(i for i in range(b0, len(lines)) if lines[i] == b'},')
for prefix, accepted, new in EDITS:
    custom = prefix.startswith(b'["bilis')
    hits = [i for i, l in enumerate(lines) if l.startswith(prefix) and (not custom or b0 < i < b1)]
    if len(hits) != 1:
        sys.exit(f'ABORT: {prefix.decode()} found {len(hits)} times, expected 1. Nothing written.')
    i = hits[0]
    old = lines[i][len(prefix):].rstrip(b',')
    if old not in accepted:
        sys.exit(f'ABORT: {prefix.decode()} has unexpected value {old.decode()}. Nothing written.')
    lines[i] = prefix + new + b','
    report.append((i + 1, prefix.decode().rstrip(' ='), old.decode(), new.decode()))
out = nl.join(lines)
open(dst, 'wb').write(out)
for ln, k, o, n in report:
    print(f'line {ln}: {k}\n   {o}\n-> {n}' if o != n else f'line {ln}: {k} already {n}')
print(f'{len(data)} bytes in, {len(out)} bytes out')
