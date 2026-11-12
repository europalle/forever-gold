# TSM profile fixes

Scripts that edit Bubbi's `TradeSkillMaster.lua` (profile `BilisClassicForever(v1.0.1)`). Each refuses to write anything if the file does not look as expected. Always run them on a fresh copy taken after logging out, never on an old one: the file also holds TSM's ledger, and an old copy would roll it back.

1. `python3 -I patch_tsm.py IN.lua OUT.lua`: destroy value source to minimum buyout, mail disenchantables to Bubbi Banken, disenchant search at 70%, buyout confirmation on, and three custom sources (`bilisminshoppingsoldperday` 5, `bilisminshoppingvalue` 5s, `bilisrestockqty` capped at 40).
2. `python3 -I patch_mailing.py IN.lua OUT.lua`: the mail rule ("Default Mail" to Bubbi Banken) only on trade goods. The profile had it on its top group, so ammo, quivers, gear and consumables were mailed too. Every group's Mailing entry is rewritten explicitly, since TSM stores inherited copies on child groups.
3. `npx tsx tools/tsm/verify_mailing.ts BEFORE.lua AFTER.lua`: lists what gets mailed and checks nothing else changed. On 2026-11-12: 446 items mailed (all trade goods), about 8,070 kept.

To install the result: close WoW completely, rename the old file to keep it, put the new one in `_forever_\WTF\Account\<account>\SavedVariables\`.
