package main

import (
	"encoding/binary"
	"errors"
	"io"
	"net"
	"os"
)

const (
	socketPath  = "/run/munjib/release-broker.sock"
	MaxFrameSize = 1 << 20
)

func main() {
	if len(os.Args) != 1 {
		os.Exit(64)
	}
	if err := relay(); err != nil {
		os.Exit(70)
	}
}

func relay() error {
	if os.Getenv("SSH_ORIGINAL_COMMAND") != "" {
		return errors.New("command-not-allowed")
	}
	conn, err := net.DialUnix("unix", nil, &net.UnixAddr{Name: socketPath, Net: "unix"})
	if err != nil {
		return err
	}
	defer conn.Close()
	if err := copyBoundedFrame(conn, os.Stdin); err != nil {
		return err
	}
	_, err = io.CopyN(os.Stdout, conn, MaxFrameSize+4)
	return err
}

func copyBoundedFrame(dst *net.UnixConn, src *os.File) error {
	var lengthBytes [4]byte
	if _, err := io.ReadFull(src, lengthBytes[:]); err != nil {
		return err
	}
	length := binary.BigEndian.Uint32(lengthBytes[:])
	if length == 0 || length > MaxFrameSize {
		return errors.New("frame-size")
	}
	frame := make([]byte, length)
	if _, err := io.ReadFull(io.LimitReader(src, int64(length)), frame); err != nil {
		return err
	}
	if _, err := dst.Write(append(lengthBytes[:], frame...)); err != nil {
		return err
	}
	return nil
}
