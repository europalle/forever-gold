# Forever Gold helper

A small Windows console program that keeps the addon and the website in sync. Go, standard library only.

- First start: asks for a pairing code (Account page, "Make a pairing code"), finds `World of Warcraft\_forever_` in the usual places or asks for it. Settings live in `%AppData%\ForeverGold\config.json`, a log in `helper.log` beside it.
- Every 10 seconds: uploads `ForeverGold.lua` and `TradeSkillMaster.lua` from each `WTF\Account\<account>\SavedVariables` when they changed and have been quiet for 3 seconds (the game writes them at logout and /reload).
- Every 5 minutes: fetches the advice and replaces `Interface\AddOns\ForeverGold\ForeverGold_Data.lua` (write-then-rename), only when it changed (ETag).
- It touches no other file and never the game process.

Flags: `-pair` (new code), `-once` (one sync, then exit), `-server URL`, `-wow PATH`. `FG_TOKEN` and `FG_HOME` override the code and the settings folder, for tests.

Build what members download: `scripts/build-downloads.sh` (Windows exe and addon zip into `downloads/`, with `SHA256SUMS`).
