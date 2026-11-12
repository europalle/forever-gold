//go:build !windows

package main

import (
	"log"
	"os/exec"
	"runtime"
)

func openBrowser(url string) {
	cmd := "xdg-open"
	if runtime.GOOS == "darwin" {
		cmd = "open"
	}
	if err := exec.Command(cmd, url).Start(); err != nil {
		log.Printf("Open %s in your browser.", url)
	}
}

func startupSupported() bool { return false }

func setStartup(bool) error { return errNotWindows }

func isStartup() bool { return false }
