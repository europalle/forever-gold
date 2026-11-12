// Forever Gold helper: keeps the addon and the website in sync.
//
// It uploads ForeverGold.lua and TradeSkillMaster.lua from WoW's SavedVariables
// when the game writes them (logout or /reload), and writes the advice file
// into the addon folder every few minutes. It reads and writes only those
// files and never touches the game process. Its window is a small page served
// on 127.0.0.1 and opened in the browser (see ui.go).
package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

const version = "0.2.0"

const defaultServer = "https://forevergold.paro.fyi"

type Config struct {
	Server string `json:"server"`
	Token  string `json:"token"`
	WowDir string `json:"wowDir"` // the _forever_ folder
}

type State struct {
	Uploaded   map[string]string `json:"uploaded"` // file path -> sha256 last uploaded
	AdviceETag string            `json:"adviceETag"`
}

// Activity is one line of the log shown on the page.
type Activity struct {
	At   time.Time `json:"at"`
	Text string    `json:"text"`
	Bad  bool      `json:"bad"`
}

// App holds everything the sync loop and the page share.
type App struct {
	mu        sync.Mutex
	dir       string
	cfg       Config
	st        *State
	user      string // who the pairing code belongs to, once checked
	pairErr   string
	log       []Activity
	lastSync  time.Time
	lastAdv   time.Time
	uploads   map[string]Activity // file kind -> last upload
	syncNow   chan struct{}
	logWriter io.Writer
}

var (
	flagOnce       = flag.Bool("once", false, "sync once and exit (no window)")
	flagServer     = flag.String("server", "", "server address (default "+defaultServer+")")
	flagWow        = flag.String("wow", "", "path to World of Warcraft or its _forever_ folder")
	flagBackground = flag.Bool("background", false, "start without opening the window (used when starting with Windows)")
	flagNoBrowser  = flag.Bool("no-browser", false, "never open the browser")
)

func main() {
	flag.Parse()
	dir := appDir()
	_ = os.MkdirAll(dir, 0o700)
	logFile, _ := os.OpenFile(filepath.Join(dir, "helper.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	var w io.Writer = os.Stdout
	if logFile != nil {
		w = io.MultiWriter(os.Stdout, logFile)
	}
	log.SetOutput(w)
	log.SetFlags(log.Ldate | log.Ltime)

	app := &App{dir: dir, cfg: loadConfig(dir), st: loadState(dir), uploads: map[string]Activity{}, syncNow: make(chan struct{}, 1), logWriter: w}
	if *flagServer != "" {
		app.cfg.Server = strings.TrimRight(*flagServer, "/")
	}
	if app.cfg.Server == "" {
		app.cfg.Server = defaultServer
	}
	if t := os.Getenv("FG_TOKEN"); t != "" {
		app.cfg.Token = t
	}
	if *flagWow != "" {
		app.cfg.WowDir = foreverDir(*flagWow)
	}
	if app.cfg.WowDir == "" || !isDir(app.cfg.WowDir) {
		app.cfg.WowDir = findWow()
	}
	app.note(false, "Forever Gold helper %s started.", version)

	if *flagOnce {
		if err := app.checkPairing(); err != nil {
			log.Printf("Could not pair: %v", err)
			os.Exit(1)
		}
		app.syncOnce(true)
		return
	}

	// One copy at a time: if the page's port is taken, the helper is already
	// running, so just show its window.
	ui, err := startUI(app)
	if err != nil {
		openBrowser(uiURL())
		return
	}
	if !*flagBackground && !*flagNoBrowser {
		openBrowser(ui)
	}
	if app.cfg.Token != "" {
		_ = app.checkPairing()
	}
	app.save()
	app.loop()
}

func (a *App) loop() {
	tick := time.NewTicker(10 * time.Second)
	defer tick.Stop()
	for {
		a.mu.Lock()
		due := time.Since(a.lastAdv) >= 5*time.Minute
		a.mu.Unlock()
		a.syncOnce(due)
		select {
		case <-tick.C:
		case <-a.syncNow:
			a.mu.Lock()
			a.lastAdv = time.Time{} // a manual sync also refreshes the advice
			a.mu.Unlock()
		}
	}
}

func (a *App) note(bad bool, format string, args ...any) {
	text := fmt.Sprintf(format, args...)
	log.Print(text)
	a.mu.Lock()
	a.log = append(a.log, Activity{At: time.Now(), Text: text, Bad: bad})
	if len(a.log) > 200 {
		a.log = a.log[len(a.log)-200:]
	}
	a.mu.Unlock()
}

func (a *App) snapshot() (Config, string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.cfg, a.user
}

func (a *App) save() {
	a.mu.Lock()
	defer a.mu.Unlock()
	saveConfig(a.dir, a.cfg)
	saveState(a.dir, a.st)
}

func (a *App) checkPairing() error {
	cfg, _ := a.snapshot()
	if cfg.Token == "" {
		return errors.New("no pairing code yet")
	}
	user, err := hello(cfg)
	a.mu.Lock()
	if err != nil {
		a.user, a.pairErr = "", err.Error()
	} else {
		a.user, a.pairErr = user, ""
	}
	a.mu.Unlock()
	if err != nil {
		a.note(true, "Pairing failed: %v", err)
		return err
	}
	a.note(false, "Paired as %s with %s.", user, cfg.Server)
	return nil
}

func (a *App) syncOnce(fetchAdvice bool) {
	cfg, user := a.snapshot()
	if user == "" || cfg.WowDir == "" {
		return
	}
	for _, f := range savedFiles(cfg.WowDir) {
		a.uploadIfChanged(cfg, f.path, f.kind)
	}
	addonDir := filepath.Join(cfg.WowDir, "Interface", "AddOns", "ForeverGold")
	if fetchAdvice && isDir(addonDir) {
		if err := a.fetchAdviceFile(cfg, addonDir); err != nil {
			a.note(true, "Advice: %v", err)
		}
		a.mu.Lock()
		a.lastAdv = time.Now()
		a.mu.Unlock()
	}
	a.mu.Lock()
	a.lastSync = time.Now()
	a.mu.Unlock()
	a.save()
}

type savedFile struct{ path, kind string }

// Every WoW account folder's SavedVariables: one Battle.net login can hold
// several (WoW1, WoW2).
func savedFiles(wowDir string) []savedFile {
	var out []savedFile
	accounts, _ := os.ReadDir(filepath.Join(wowDir, "WTF", "Account"))
	for _, acc := range accounts {
		if !acc.IsDir() {
			continue
		}
		sv := filepath.Join(wowDir, "WTF", "Account", acc.Name(), "SavedVariables")
		for _, f := range []savedFile{{filepath.Join(sv, "ForeverGold.lua"), "addon"}, {filepath.Join(sv, "TradeSkillMaster.lua"), "tsm"}} {
			if fi, err := os.Stat(f.path); err == nil && !fi.IsDir() {
				out = append(out, f)
			}
		}
	}
	return out
}

func (a *App) uploadIfChanged(cfg Config, path, kind string) {
	fi, err := os.Stat(path)
	if err != nil {
		return
	}
	// The game writes the file at logout and /reload; wait until it has been
	// quiet for a few seconds so a half-written file is never sent.
	if time.Since(fi.ModTime()) < 3*time.Second {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return
	}
	sum := sha256.Sum256(data)
	h := hex.EncodeToString(sum[:])
	a.mu.Lock()
	same := a.st.Uploaded[path] == h
	a.mu.Unlock()
	if same {
		return
	}
	var gz bytes.Buffer
	zw := gzip.NewWriter(&gz)
	_, _ = zw.Write(data)
	_ = zw.Close()
	req, _ := http.NewRequest("POST", cfg.Server+"/api/sync/upload?file="+kind, &gz)
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("X-FG-Encoding", "gzip")
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("User-Agent", "forevergold-helper/"+version)
	body, status, _, err := do(req)
	if err != nil {
		a.note(true, "Upload of %s failed, will retry: %v", filepath.Base(path), err)
		return
	}
	if status != 200 {
		a.note(true, "Upload of %s refused (%d): %s", filepath.Base(path), status, msg(body))
		if status == 400 {
			a.mu.Lock()
			a.st.Uploaded[path] = h // a file the server cannot read: do not resend it every 10 seconds
			a.mu.Unlock()
		}
		return
	}
	text := fmt.Sprintf("Uploaded %s (%s): %s", filepath.Base(path), account(path), summary(kind, body))
	a.note(false, "%s", text)
	a.mu.Lock()
	a.st.Uploaded[path] = h
	a.uploads[kind] = Activity{At: time.Now(), Text: summary(kind, body)}
	a.mu.Unlock()
}

func (a *App) fetchAdviceFile(cfg Config, addonDir string) error {
	req, _ := http.NewRequest("GET", cfg.Server+"/api/sync/advice", nil)
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("User-Agent", "forevergold-helper/"+version)
	target := filepath.Join(addonDir, "ForeverGold_Data.lua")
	a.mu.Lock()
	etag := a.st.AdviceETag
	a.mu.Unlock()
	if etag != "" && exists(target) {
		req.Header.Set("If-None-Match", etag)
	}
	body, status, hdr, err := do(req)
	if err != nil {
		return err
	}
	if status == 304 {
		return nil
	}
	if status != 200 {
		return fmt.Errorf("refused (%d): %s", status, msg(body))
	}
	if !bytes.Contains(body, []byte("ForeverGoldData = ")) {
		return errors.New("the server sent something that is not an advice file; keeping the old one")
	}
	// Write beside the target, then swap, so the game never reads half a file.
	tmp := target + ".tmp"
	if err := os.WriteFile(tmp, body, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, target); err != nil {
		return err
	}
	a.mu.Lock()
	a.st.AdviceETag = hdr.Get("ETag")
	a.uploads["advice"] = Activity{At: time.Now(), Text: fmt.Sprintf("%d KB", len(body)/1024)}
	a.mu.Unlock()
	a.note(false, "New advice written (%d KB). It shows in game after /reload or your next login.", len(body)/1024)
	return nil
}

func do(req *http.Request) ([]byte, int, http.Header, error) {
	client := &http.Client{Timeout: 60 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, 0, nil, err
	}
	defer res.Body.Close()
	b, err := io.ReadAll(io.LimitReader(res.Body, 20<<20))
	return b, res.StatusCode, res.Header, err
}

func hello(cfg Config) (string, error) {
	req, _ := http.NewRequest("GET", cfg.Server+"/api/sync/hello", nil)
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(cfg.Token))
	req.Header.Set("User-Agent", "forevergold-helper/"+version)
	body, status, _, err := do(req)
	if err != nil {
		return "", err
	}
	if status != 200 {
		return "", errors.New(msg(body))
	}
	var r struct{ User string }
	_ = json.Unmarshal(body, &r)
	return r.User, nil
}

func msg(body []byte) string {
	var r struct{ Error string }
	if json.Unmarshal(body, &r) == nil && r.Error != "" {
		return r.Error
	}
	s := strings.TrimSpace(string(body))
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}

func summary(kind string, body []byte) string {
	if kind == "tsm" {
		var r struct{ LedgerRows, NewLedgerRows int }
		_ = json.Unmarshal(body, &r)
		return fmt.Sprintf("%d ledger rows, %d new", r.LedgerRows, r.NewLedgerRows)
	}
	var r struct {
		Characters  []string
		NewItems    int
		NewInvoices int
		NewLoot     int
	}
	_ = json.Unmarshal(body, &r)
	return fmt.Sprintf("%s; %d new item details, %d new sale mails, %d new loot windows", strings.Join(r.Characters, ", "), r.NewItems, r.NewInvoices, r.NewLoot)
}

func account(path string) string {
	return filepath.Base(filepath.Dir(filepath.Dir(path)))
}

// The addon's version, from its TOC, or "" when it is not installed.
func addonVersion(wowDir string) string {
	b, err := os.ReadFile(filepath.Join(wowDir, "Interface", "AddOns", "ForeverGold", "ForeverGold.toc"))
	if err != nil {
		return ""
	}
	m := regexp.MustCompile(`(?m)^## Version:\s*(\S+)`).FindSubmatch(b)
	if m == nil {
		return "installed"
	}
	return string(m[1])
}

// --- WoW folder -----------------------------------------------------------

func foreverDir(p string) string {
	p = strings.Trim(strings.TrimSpace(p), `"`)
	if p == "" {
		return ""
	}
	if strings.EqualFold(filepath.Base(p), "_forever_") && isDir(p) {
		return p
	}
	if f := filepath.Join(p, "_forever_"); isDir(f) {
		return f
	}
	return ""
}

func findWow() string {
	var candidates []string
	if runtime.GOOS == "windows" {
		for _, drive := range []string{"C", "D", "E", "F", "G", "H"} {
			for _, base := range []string{
				`:\Program Files (x86)\World of Warcraft`,
				`:\Program Files\World of Warcraft`,
				`:\World of Warcraft`,
				`:\Games\World of Warcraft`,
				`:\Battle.net\World of Warcraft`,
			} {
				candidates = append(candidates, drive+base)
			}
		}
	} else {
		candidates = []string{"/Applications/World of Warcraft"}
	}
	for _, c := range candidates {
		if f := foreverDir(c); f != "" {
			return f
		}
	}
	return ""
}

// --- config and state -----------------------------------------------------

func appDir() string {
	if d := os.Getenv("FG_HOME"); d != "" {
		return d
	}
	base, err := os.UserConfigDir() // %AppData% on Windows
	if err != nil {
		base = "."
	}
	return filepath.Join(base, "ForeverGold")
}

func loadConfig(dir string) Config {
	var c Config
	if b, err := os.ReadFile(filepath.Join(dir, "config.json")); err == nil {
		_ = json.Unmarshal(b, &c)
	}
	return c
}

func saveConfig(dir string, c Config) {
	b, _ := json.MarshalIndent(c, "", "  ")
	_ = os.WriteFile(filepath.Join(dir, "config.json"), b, 0o600)
}

func loadState(dir string) *State {
	s := &State{Uploaded: map[string]string{}}
	if b, err := os.ReadFile(filepath.Join(dir, "state.json")); err == nil {
		_ = json.Unmarshal(b, s)
	}
	if s.Uploaded == nil {
		s.Uploaded = map[string]string{}
	}
	return s
}

func saveState(dir string, s *State) {
	b, _ := json.MarshalIndent(s, "", "  ")
	_ = os.WriteFile(filepath.Join(dir, "state.json"), b, 0o600)
}

func isDir(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && fi.IsDir()
}

func exists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
