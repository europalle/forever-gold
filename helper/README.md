# Forever Gold app (the helper)

A small Windows app that keeps the addon and the website in sync. Go; dependencies: `github.com/jchv/go-webview2` (the window, pure Go over Windows' WebView2) and `fyne.io/systray` (the tray icon), both without cgo, so it cross-compiles from Linux.

- Installed by `ForeverGold.msi` (built with `wixl` from `installer/ForeverGold.wxs`): Program Files\Forever Gold\ForeverGold.exe, Start menu and desktop shortcuts, listed in Windows' installed apps; a newer version replaces an older one (fixed UpgradeCode).
- Runs as a gold coin in the tray. Left click or "Open Forever Gold" shows the window; right click has Sync now and Quit. Closing the window keeps it running. Starting it again while it runs raises the window (single instance via the page's port and `/api/show`).
- The window is WebView2 showing the page the app serves on `127.0.0.1:47830` (`ui.go`, `ui.html`). The page needs the random key in its address (also in `%AppData%\ForeverGold\ui.key`) and checks the Host header, so websites in a browser cannot read or drive it. WebView2's data goes to `%AppData%\ForeverGold\WebView2` (Program Files is not writable). Without WebView2 it falls back to the browser.
- The page: pairing, the WoW folder (detected or typed), the addon's version, last uploads and advice, a live log, Sync now, Open the website, Start with Windows, Quit.
- Start with Windows adds `"<exe>" -background` under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (tray only at boot).
- Every 10 seconds: uploads `ForeverGold.lua` and `TradeSkillMaster.lua` from each `WTF\Account\<account>\SavedVariables` when changed and quiet for 3 seconds. Every 5 minutes or on Sync now: fetches the advice and replaces `Interface\AddOns\ForeverGold\ForeverGold_Data.lua` (write-then-rename) when it changed. Nothing else is touched, and never the game process.
- Icon and Windows resources: `winres/` (go-winres) produce `rsrc_windows_amd64.syso`; regenerate with `go-winres make --in winres/winres.json --arch amd64` after changing the icon or version.

Flags: `-background`, `-no-browser`, `-once` (one sync, no window, for tests), `-server URL`, `-wow PATH`. `FG_TOKEN` and `FG_HOME` override the code and the settings folder, for tests. On Linux there is no tray or window; the page opens in the browser.

Build what members download: `scripts/build-downloads.sh` (needs Go and wixl).
