# Forever Gold helper

A small Windows program that keeps the addon and the website in sync. Go, standard library only.

- No console window. Its window is a page on `http://127.0.0.1:47830`, opened in the browser when it starts. The page answers only this PC, and every request needs the random key in its address (also stored in `%AppData%\ForeverGold\ui.key`), so other websites cannot read or drive it. Starting the program again while it runs just reopens the page.
- The page: pairing (paste a code from the website's Account page), the WoW folder (detected in the usual places, or typed), whether the addon is installed and which version, the last uploads and advice, a live activity log, and Sync now, Open the website, Start with Windows, Stop.
- Start with Windows adds `"<exe>" -background` under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (no window at boot).
- Every 10 seconds: uploads `ForeverGold.lua` and `TradeSkillMaster.lua` from each `WTF\Account\<account>\SavedVariables` when they changed and have been quiet for 3 seconds (the game writes them at logout and /reload). Every 5 minutes, or on Sync now: fetches the advice and replaces `Interface\AddOns\ForeverGold\ForeverGold_Data.lua` (write-then-rename) when it changed (ETag).
- It touches no other file and never the game process. Settings in `%AppData%\ForeverGold\config.json`, a log in `helper.log`.

Flags: `-background`, `-no-browser`, `-once` (one sync, no window, for tests), `-server URL`, `-wow PATH`. `FG_TOKEN` and `FG_HOME` override the code and the settings folder, for tests.

Build what members download: `scripts/build-downloads.sh` (Windows exe with `-H windowsgui`, and the addon zip, into `downloads/`, with `SHA256SUMS`).
