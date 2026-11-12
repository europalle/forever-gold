// Forever Gold helper: keeps the addon and the website in sync.
//
// It uploads ForeverGold.lua and TradeSkillMaster.lua from WoW's SavedVariables
// when the game writes them (logout or /reload), and writes the advice file
// into the addon folder every few minutes. It reads and writes only those
// files and never touches the game process.
package main

import (
	"bufio"
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
	"runtime"
	"strings"
	"time"
)

const version = "0.1.0"

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

var (
	flagPair   = flag.Bool("pair", false, "enter a new pairing code")
	flagOnce   = flag.Bool("once", false, "sync once and exit")
	flagServer = flag.String("server", "", "server address (default "+defaultServer+")")
	flagWow    = flag.String("wow", "", "path to World of Warcraft or its _forever_ folder")
)

func main() {
	flag.Parse()
	dir := appDir()
	_ = os.MkdirAll(dir, 0o700)
	logFile, _ := os.OpenFile(filepath.Join(dir, "helper.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if logFile != nil {
		log.SetOutput(io.MultiWriter(os.Stdout, logFile))
	}
	log.SetFlags(log.Ldate | log.Ltime)
	fmt.Printf("Forever Gold helper %s. Close this window to stop.\n\n", version)

	cfg := loadConfig(dir)
	if *flagServer != "" {
		cfg.Server = strings.TrimRight(*flagServer, "/")
	}
	if cfg.Server == "" {
		cfg.Server = defaultServer
	}
	in := bufio.NewReader(os.Stdin)

	if t := os.Getenv("FG_TOKEN"); t != "" {
		cfg.Token = t
	}
	if cfg.Token == "" || *flagPair {
		cfg.Token = ask(in, "Paste your pairing code (Account page on the website, \"Make a pairing code\"): ")
	}
	for {
		user, err := hello(cfg)
		if err == nil {
			log.Printf("Paired as %s with %s.", user, cfg.Server)
			break
		}
		log.Printf("Could not pair: %v", err)
		if os.Getenv("FG_TOKEN") != "" || *flagOnce {
			os.Exit(1)
		}
		cfg.Token = ask(in, "Paste a new pairing code: ")
	}

	if *flagWow != "" {
		cfg.WowDir = foreverDir(*flagWow)
	}
	if cfg.WowDir == "" || !isDir(cfg.WowDir) {
		cfg.WowDir = findWow()
	}
	for cfg.WowDir == "" {
		p := ask(in, "Where is World of Warcraft installed? (the folder that holds _forever_): ")
		cfg.WowDir = foreverDir(p)
		if cfg.WowDir == "" {
			fmt.Println("No _forever_ folder there. Try again.")
		}
	}
	log.Printf("WoW Forever folder: %s", cfg.WowDir)
	saveConfig(dir, cfg)

	addonDir := filepath.Join(cfg.WowDir, "Interface", "AddOns", "ForeverGold")
	if !isDir(addonDir) {
		log.Printf("The Forever Gold addon is not installed yet: put the ForeverGold folder in %s", filepath.Dir(addonDir))
	}

	st := loadState(dir)
	syncOnce(cfg, st, addonDir, true)
	saveState(dir, st)
	if *flagOnce {
		return
	}
	log.Printf("Watching for saves. Advice refreshes every 5 minutes.")
	lastAdvice := time.Now()
	for {
		time.Sleep(10 * time.Second)
		due := time.Since(lastAdvice) >= 5*time.Minute
		syncOnce(cfg, st, addonDir, due)
		if due {
			lastAdvice = time.Now()
		}
		saveState(dir, st)
	}
}

func syncOnce(cfg Config, st *State, addonDir string, fetchAdvice bool) {
	for _, f := range savedFiles(cfg.WowDir) {
		uploadIfChanged(cfg, st, f.path, f.kind)
	}
	if fetchAdvice && isDir(addonDir) {
		if err := fetchAdviceFile(cfg, st, addonDir); err != nil {
			log.Printf("Advice: %v", err)
		}
	}
}

type savedFile struct{ path, kind string }

// Every WoW account folder's SavedVariables: one Battle.net login can hold
// several (WoW1, WoW2).
func savedFiles(wowDir string) []savedFile {
	var out []savedFile
	accounts, _ := os.ReadDir(filepath.Join(wowDir, "WTF", "Account"))
	for _, a := range accounts {
		if !a.IsDir() {
			continue
		}
		sv := filepath.Join(wowDir, "WTF", "Account", a.Name(), "SavedVariables")
		for name, kind := range map[string]string{"ForeverGold.lua": "addon", "TradeSkillMaster.lua": "tsm"} {
			p := filepath.Join(sv, name)
			if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
				out = append(out, savedFile{p, kind})
			}
		}
	}
	return out
}

func uploadIfChanged(cfg Config, st *State, path, kind string) {
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
	if st.Uploaded[path] == h {
		return
	}
	var gz bytes.Buffer
	w := gzip.NewWriter(&gz)
	_, _ = w.Write(data)
	_ = w.Close()
	req, _ := http.NewRequest("POST", cfg.Server+"/api/sync/upload?file="+kind, &gz)
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("X-FG-Encoding", "gzip")
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("User-Agent", "forevergold-helper/"+version)
	body, status, _, err := do(req)
	if err != nil {
		log.Printf("Upload of %s failed, will retry: %v", filepath.Base(path), err)
		return
	}
	if status != 200 {
		log.Printf("Upload of %s refused (%d): %s", filepath.Base(path), status, msg(body))
		if status == 400 {
			st.Uploaded[path] = h // a file the server cannot read: do not resend it every 10 seconds
		}
		return
	}
	st.Uploaded[path] = h
	log.Printf("Uploaded %s (%s): %s", filepath.Base(path), account(path), summary(kind, body))
}

func fetchAdviceFile(cfg Config, st *State, addonDir string) error {
	req, _ := http.NewRequest("GET", cfg.Server+"/api/sync/advice", nil)
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("User-Agent", "forevergold-helper/"+version)
	target := filepath.Join(addonDir, "ForeverGold_Data.lua")
	if st.AdviceETag != "" && exists(target) {
		req.Header.Set("If-None-Match", st.AdviceETag)
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
	st.AdviceETag = hdr.Get("ETag")
	log.Printf("New advice written (%d KB). It shows in game after /reload or your next login.", len(body)/1024)
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
	}
	_ = json.Unmarshal(body, &r)
	return fmt.Sprintf("%s; %d new item details, %d new sale mails", strings.Join(r.Characters, ", "), r.NewItems, r.NewInvoices)
}

func account(path string) string {
	return filepath.Base(filepath.Dir(filepath.Dir(path)))
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
		for _, drive := range []string{"C", "D", "E", "F", "G"} {
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

func ask(in *bufio.Reader, prompt string) string {
	fmt.Print(prompt)
	line, _ := in.ReadString('\n')
	return strings.TrimSpace(line)
}

func isDir(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && fi.IsDir()
}

func exists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
