//go:build windows

package main

import (
	_ "embed"
	"os"
	"path/filepath"
	"runtime"
	"sync"

	"fyne.io/systray"
	webview2 "github.com/jchv/go-webview2"
	"golang.org/x/sys/windows"
)

// The Windows app: a tray icon by the clock (the program's main thread) and,
// on demand, a window showing the helper's page in WebView2 on its own thread.

//go:embed winres/app.ico
var trayIcon []byte

func init() { runtime.LockOSThread() } // the tray's message loop needs the main thread

var (
	user32         = windows.NewLazySystemDLL("user32.dll")
	setForeground  = user32.NewProc("SetForegroundWindow")
	showWindowProc = user32.NewProc("ShowWindow")
	winMu          sync.Mutex
	winOpen        bool
	winHandle      uintptr
)

const swRestore = 9

func runApp(app *App, url string, showNow bool) {
	app.showFn = func() { showWindow(app, url) }
	app.quitFn = func() { systray.Quit() }
	systray.Run(func() {
		systray.SetIcon(trayIcon)
		systray.SetTitle("Forever Gold")
		systray.SetTooltip("Forever Gold: keeping your addon in sync")
		systray.SetOnTapped(app.showFn)
		open := systray.AddMenuItem("Open Forever Gold", "Show the window")
		syncNow := systray.AddMenuItem("Sync now", "Upload saved files and fetch new advice")
		systray.AddSeparator()
		quit := systray.AddMenuItem("Quit", "Stop syncing and close Forever Gold")
		go func() {
			for {
				select {
				case <-open.ClickedCh:
					app.showFn()
				case <-syncNow.ClickedCh:
					app.kick()
				case <-quit.ClickedCh:
					systray.Quit()
				}
			}
		}()
		if showNow {
			app.showFn()
		}
	}, func() {
		app.note(false, "Quit.")
		os.Exit(0)
	})
}

// One window at a time: asking again brings the open one to the front.
func showWindow(app *App, url string) {
	winMu.Lock()
	if winOpen {
		h := winHandle
		winMu.Unlock()
		if h != 0 {
			_, _, _ = showWindowProc.Call(h, swRestore)
			_, _, _ = setForeground.Call(h)
		}
		return
	}
	winOpen = true
	winMu.Unlock()
	go func() {
		runtime.LockOSThread()
		defer func() {
			winMu.Lock()
			winOpen, winHandle = false, 0
			winMu.Unlock()
		}()
		data := filepath.Join(app.dir, "WebView2") // Program Files is not writable
		_ = os.MkdirAll(data, 0o700)
		w := webview2.NewWithOptions(webview2.WebViewOptions{
			DataPath:  data,
			AutoFocus: true,
			WindowOptions: webview2.WindowOptions{
				Title:  "Forever Gold",
				Width:  1000,
				Height: 880,
				IconId: 1,
				Center: true,
			},
		})
		if w == nil {
			app.note(true, "Could not open the window: Microsoft Edge WebView2 seems to be missing. Opening it in your browser instead.")
			openBrowser(url)
			return
		}
		winMu.Lock()
		winHandle = uintptr(w.Window())
		winMu.Unlock()
		w.Navigate(url)
		w.Run()
	}()
}
