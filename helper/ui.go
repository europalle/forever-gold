package main

import (
	"crypto/rand"
	"crypto/subtle"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// The helper's window: a page on 127.0.0.1 only. Every request must carry the
// random key from the page's address, and the Host header must be ours, so
// other websites open in the browser cannot read or drive it.

//go:embed ui.html
var uiPage []byte

const uiAddr = "127.0.0.1:47830"

var uiKey string

func uiURL() string {
	if b, err := os.ReadFile(filepath.Join(appDir(), "ui.key")); err == nil {
		return "http://" + uiAddr + "/?k=" + strings.TrimSpace(string(b))
	}
	return "http://" + uiAddr + "/"
}

func startUI(app *App) (string, error) {
	ln, err := net.Listen("tcp", uiAddr)
	if err != nil {
		return "", err
	}
	buf := make([]byte, 16)
	_, _ = rand.Read(buf)
	uiKey = hex.EncodeToString(buf)
	_ = os.WriteFile(filepath.Join(app.dir, "ui.key"), []byte(uiKey), 0o600)

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" || !hostOK(r) {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'")
		w.Header().Set("Cache-Control", "no-store")
		if !keyOK(r.URL.Query().Get("k")) {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte("Open this page from the Forever Gold helper: start ForeverGoldHelper.exe again."))
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(uiPage)
	})
	api := func(path string, fn func(w http.ResponseWriter, r *http.Request) any) {
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			if !hostOK(r) || !keyOK(r.Header.Get("X-FG-Key")) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			if path != "/api/state" && r.Method != http.MethodPost {
				http.Error(w, "POST only", http.StatusMethodNotAllowed)
				return
			}
			out := fn(w, r)
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Cache-Control", "no-store")
			_ = json.NewEncoder(w).Encode(out)
		})
	}

	api("/api/state", func(w http.ResponseWriter, r *http.Request) any { return app.state() })
	api("/api/pair", func(w http.ResponseWriter, r *http.Request) any {
		var in struct{ Code string }
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in)
		code := strings.TrimSpace(in.Code)
		if !strings.HasPrefix(code, "fg_") {
			return map[string]string{"error": "That is not a pairing code. Make one on the website: Account, Helper program."}
		}
		app.mu.Lock()
		old := app.cfg.Token
		app.cfg.Token = code
		app.mu.Unlock()
		if err := app.checkPairing(); err != nil {
			app.mu.Lock()
			app.cfg.Token = old
			app.mu.Unlock()
			return map[string]string{"error": err.Error()}
		}
		app.save()
		app.kick()
		return map[string]string{"ok": "Paired."}
	})
	api("/api/wow", func(w http.ResponseWriter, r *http.Request) any {
		var in struct {
			Path   string
			Detect bool
		}
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in)
		dir := ""
		if in.Detect {
			dir = findWow()
		} else {
			dir = foreverDir(in.Path)
		}
		if dir == "" {
			if in.Detect {
				return map[string]string{"error": "Could not find World of Warcraft in the usual places. Type its folder instead."}
			}
			return map[string]string{"error": "No _forever_ folder there. Give the World of Warcraft folder, or its _forever_ folder."}
		}
		app.mu.Lock()
		app.cfg.WowDir = dir
		app.mu.Unlock()
		app.save()
		app.note(false, "WoW Forever folder: %s", dir)
		app.kick()
		return map[string]string{"ok": dir}
	})
	api("/api/sync", func(w http.ResponseWriter, r *http.Request) any {
		app.kick()
		return map[string]string{"ok": "Syncing."}
	})
	api("/api/startup", func(w http.ResponseWriter, r *http.Request) any {
		var in struct{ On bool }
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&in)
		if err := setStartup(in.On); err != nil {
			return map[string]string{"error": err.Error()}
		}
		return map[string]bool{"on": isStartup()}
	})
	api("/api/quit", func(w http.ResponseWriter, r *http.Request) any {
		app.note(false, "Quit from the window.")
		go func() {
			time.Sleep(300 * time.Millisecond)
			if app.quitFn != nil {
				app.quitFn()
			}
			os.Exit(0)
		}()
		return map[string]string{"ok": "Stopped."}
	})
	api("/api/show", func(w http.ResponseWriter, r *http.Request) any {
		if app.showFn != nil {
			app.showFn()
		}
		return map[string]string{"ok": "Shown."}
	})
	api("/api/open-site", func(w http.ResponseWriter, r *http.Request) any {
		cfg, _ := app.snapshot()
		openBrowser(cfg.Server + "/account")
		return map[string]string{"ok": "Opened."}
	})

	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = srv.Serve(ln) }()
	return "http://" + uiAddr + "/?k=" + uiKey, nil
}

func hostOK(r *http.Request) bool {
	return r.Host == uiAddr || r.Host == "localhost:47830"
}

func keyOK(k string) bool {
	return uiKey != "" && subtle.ConstantTimeCompare([]byte(k), []byte(uiKey)) == 1
}

func (a *App) kick() {
	select {
	case a.syncNow <- struct{}{}:
	default:
	}
}

type uiState struct {
	Version          string              `json:"version"`
	Server           string              `json:"server"`
	User             string              `json:"user"`
	PairError        string              `json:"pairError"`
	HasCode          bool                `json:"hasCode"`
	WowDir           string              `json:"wowDir"`
	AddonVersion     string              `json:"addonVersion"`
	Accounts         []string            `json:"accounts"`
	LastSync         *time.Time          `json:"lastSync"`
	Recent           map[string]Activity `json:"recent"`
	Log              []Activity          `json:"log"`
	Startup          bool                `json:"startup"`
	StartupSupported bool                `json:"startupSupported"`
}

func (a *App) state() uiState {
	a.mu.Lock()
	defer a.mu.Unlock()
	s := uiState{
		Version:          version,
		Server:           a.cfg.Server,
		User:             a.user,
		PairError:        a.pairErr,
		HasCode:          a.cfg.Token != "",
		WowDir:           a.cfg.WowDir,
		Recent:           map[string]Activity{},
		StartupSupported: startupSupported(),
	}
	if a.cfg.WowDir != "" {
		s.AddonVersion = addonVersion(a.cfg.WowDir)
		seen := map[string]bool{}
		for _, f := range savedFiles(a.cfg.WowDir) {
			acc := account(f.path)
			if !seen[acc] {
				seen[acc] = true
				s.Accounts = append(s.Accounts, acc)
			}
		}
	}
	if !a.lastSync.IsZero() {
		t := a.lastSync
		s.LastSync = &t
	}
	for k, v := range a.uploads {
		s.Recent[k] = v
	}
	n := len(a.log)
	start := 0
	if n > 60 {
		start = n - 60
	}
	for i := n - 1; i >= start; i-- {
		s.Log = append(s.Log, a.log[i])
	}
	if s.StartupSupported {
		s.Startup = isStartup()
	}
	return s
}

var errNotWindows = errors.New("starting with the computer is only set up on Windows")
