//go:build windows

package main

import (
	"os"
	"os/exec"
	"strings"
	"syscall"
)

const runKey = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
const runValue = "ForeverGoldHelper"

func hidden(cmd *exec.Cmd) *exec.Cmd {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd
}

func openBrowser(url string) {
	_ = hidden(exec.Command("rundll32", "url.dll,FileProtocolHandler", url)).Start()
}

func startupSupported() bool { return true }

// Start with Windows: a value under the user's Run key, quietly (no window).
func setStartup(on bool) error {
	if !on {
		_ = hidden(exec.Command("reg", "delete", runKey, "/v", runValue, "/f")).Run()
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	return hidden(exec.Command("reg", "add", runKey, "/v", runValue, "/t", "REG_SZ", "/d", `"`+exe+`" -background`, "/f")).Run()
}

func isStartup() bool {
	out, err := hidden(exec.Command("reg", "query", runKey, "/v", runValue)).Output()
	return err == nil && strings.Contains(string(out), runValue)
}
