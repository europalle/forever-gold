//go:build !windows

package main

import "os"

// Elsewhere (tests on Linux): no tray or window, the page opens in the browser.
func runApp(app *App, url string, showNow bool) {
	app.showFn = func() { openBrowser(url) }
	app.quitFn = func() { os.Exit(0) }
	if showNow {
		app.showFn()
	}
	select {}
}
