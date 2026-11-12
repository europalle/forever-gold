"""Limit TSM's mail rule to trade goods in the BilisClassicForever profile.

Usage: python3 -I patch_mailing.py IN.lua OUT.lua

Every group's Mailing entry is rewritten explicitly:
- the top group: no mail rule (override on), so nothing inherits one;
- the shallowest groups whose last part is "Trade Goods": "Default Mail", override on;
- groups below those: "Default Mail" (inherited copy, as TSM stores it);
- every other group: no mail rule, keeping its override flag.
Only lines inside Mailing entries of this profile's groups change.
"""
import re
import sys

PROFILE = "BilisClassicForever(v1.0.1)"
OP = "Default Mail"

src, dst = sys.argv[1], sys.argv[2]
data = open(src, "rb").read()
nl = b"\r\n" if b"\r\n" in data else b"\n"
lines = data.decode("utf-8").split(nl.decode())

start = f'["p@{PROFILE}@userData@groups"] = {{'
starts = [i for i, l in enumerate(lines) if l == start]
if len(starts) != 1:
    sys.exit(f"ABORT: groups table found {len(starts)} times, expected 1. Nothing written.")
i = starts[0] + 1
header_re = re.compile(r'^\["([^"]*)"\] = \{$')
out = lines[:i]
stats = {"tradeRoot": 0, "tradeChild": 0, "off": 0, "groups": 0}


def wanted(path):
    parts = path.split("`")[1:]
    if "Trade Goods" not in parts:
        return "off"
    return "tradeRoot" if parts[-1] == "Trade Goods" and parts.count("Trade Goods") == 1 else "tradeChild"


def mailing_block(path, had_override):
    kind = wanted(path)
    stats[kind] += 1
    block = ['["Mailing"] = {']
    if kind != "off":
        block.append(f'"{OP}",')
    if path == PROFILE or kind == "tradeRoot" or (kind == "off" and had_override):
        block.append('["override"] = true,')
    block.append("},")
    return block


# Walk the groups table one group at a time, by bracket depth.
while True:
    line = lines[i]
    if line == "},":  # end of the groups table (depth back to 0)
        out.extend(lines[i:])
        break
    m = header_re.match(line)
    if not m:
        sys.exit(f"ABORT: unexpected line {i + 1} in groups: {line!r}. Nothing written.")
    path = m.group(1)
    ours = path == PROFILE or path.startswith(PROFILE + "`")
    out.append(line)
    i += 1
    depth = 1
    saw_mailing = False
    while depth > 0:
        l = lines[i]
        if ours and depth == 1 and l == '["Mailing"] = {':
            j = i + 1
            had_override = False
            while lines[j] != "},":
                if lines[j] == '["override"] = true,':
                    had_override = True
                elif lines[j].startswith("[") or lines[j].endswith("{"):
                    sys.exit(f"ABORT: unexpected line in Mailing of {path}: {lines[j]!r}. Nothing written.")
                j += 1
            out.extend(mailing_block(path, had_override))
            saw_mailing = True
            i = j + 1
            continue
        if l.endswith("{"):
            depth += 1
        elif l in ("},", "}"):
            depth -= 1
            if depth == 0:
                if ours and not saw_mailing:
                    out.extend(mailing_block(path, False))
                out.append(l)
                i += 1
                break
        out.append(l)
        i += 1
    if ours:
        stats["groups"] += 1

open(dst, "wb").write(nl.join(s.encode("utf-8") for s in out))
print(stats)
