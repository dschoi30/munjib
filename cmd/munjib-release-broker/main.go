//go:build linux

package main

import (
	"crypto/ed25519"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"strconv"
	"syscall"
	"time"

	"github.com/dschoi30/munjib/internal/delivery"
)

const (
	socketPath = "/run/munjib/release-broker.sock"
	policyPath = "/var/lib/munjib/security/deploy-principal-v1.json"
	keyPath    = "/var/lib/munjib/security/bootstrap/release-verify.pub"
)

type policy struct {
	SubmitterUID uint32 `json:"submitterUid"`
	Generation   uint64 `json:"generation"`
}

type response struct {
	OK      bool   `json:"ok"`
	Code    string `json:"code"`
	Digest  string `json:"digest,omitempty"`
	Version uint64 `json:"version,omitempty"`
}

func main() {
	if len(os.Args) != 1 {
		os.Exit(64)
	}
	listener, err := listen()
	if err != nil {
		os.Exit(70)
	}
	defer listener.Close()
	for {
		raw, err := listener.Accept()
		if err != nil {
			continue
		}
		conn, ok := raw.(*net.UnixConn)
		if !ok {
			_ = raw.Close()
			continue
		}
		go handle(conn)
	}
}

func listen() (net.Listener, error) {
	// systemd socket activation is the production path. The fallback is useful for
	// an isolated contract test and still binds only the fixed Unix path.
	if os.Getenv("LISTEN_PID") == strconv.Itoa(os.Getpid()) && os.Getenv("LISTEN_FDS") == "1" {
		return net.FileListener(os.NewFile(3, "munjib-release-broker"))
	}
	return net.ListenUnix("unix", &net.UnixAddr{Name: socketPath, Net: "unix"})
}

func handle(conn *net.UnixConn) {
	defer conn.Close()
	policyBytes, err := os.ReadFile(policyPath)
	if err != nil {
		writeResponse(conn, response{Code: "POLICY_UNAVAILABLE"})
		return
	}
	var configured policy
	if json.Unmarshal(policyBytes, &configured) != nil || configured.SubmitterUID == 0 {
		writeResponse(conn, response{Code: "POLICY_INVALID"})
		return
	}
	if err := requirePeerUID(conn, configured.SubmitterUID); err != nil {
		writeResponse(conn, response{Code: err.Error()})
		return
	}
	publicKeyBytes, err := os.ReadFile(keyPath)
	if err != nil || len(publicKeyBytes) != ed25519.PublicKeySize {
		writeResponse(conn, response{Code: "TRUST_UNAVAILABLE"})
		return
	}
	frame, err := readFrame(conn)
	if err != nil {
		writeResponse(conn, response{Code: "FRAME_INVALID"})
		return
	}
	verified, err := delivery.VerifyEnvelope(frame, ed25519.PublicKey(publicKeyBytes), time.Now().UTC())
	if err != nil || verified.Envelope.ExpectedGeneration != configured.Generation {
		writeResponse(conn, response{Code: "ENVELOPE_REJECTED"})
		return
	}
	if verified.Envelope.Operation != "VERIFY_ONLY" {
		// 13A deliberately has no application capability or mutable runtime path.
		// INSTALL_SUBSTRATE/RECONCILE_SUBSTRATE are admitted only by the later
		// attested root helper, never by a caller-selected command.
		writeResponse(conn, response{Code: "ROOT_HELPER_NOT_INSTALLED"})
		return
	}
	writeResponse(conn, response{OK: true, Code: "VERIFY_ONLY", Version: configured.Generation})
}

func requirePeerUID(conn *net.UnixConn, expected uint32) error {
	var peerErr error
	var uid uint32
	raw, err := conn.SyscallConn()
	if err != nil {
		return errors.New("PEER_UNAVAILABLE")
	}
	if err := raw.Control(func(fd uintptr) {
		cred, getsockErr := syscall.GetsockoptUcred(int(fd), syscall.SOL_SOCKET, syscall.SO_PEERCRED)
		if getsockErr != nil {
			peerErr = getsockErr
			return
		}
		uid = cred.Uid
	}); err != nil {
		return errors.New("PEER_UNAVAILABLE")
	}
	if peerErr != nil {
		return errors.New("PEER_UNAVAILABLE")
	}
	if expected != 0 && uid != expected {
		return errors.New("PEER_UID_MISMATCH")
	}
	return nil
}

func readFrame(reader io.Reader) ([]byte, error) {
	var lengthBytes [4]byte
	if _, err := io.ReadFull(reader, lengthBytes[:]); err != nil {
		return nil, err
	}
	length := binary.BigEndian.Uint32(lengthBytes[:])
	if length == 0 || length > delivery.MaxEnvelopeBytes {
		return nil, errors.New("FRAME_SIZE")
	}
	frame := make([]byte, length)
	if _, err := io.ReadFull(reader, frame); err != nil {
		return nil, err
	}
	return frame, nil
}

func writeResponse(conn *net.UnixConn, value response) {
	bytes, _ := json.Marshal(value)
	if len(bytes) > 4096 {
		return
	}
	var length [4]byte
	binary.BigEndian.PutUint32(length[:], uint32(len(bytes)))
	_, _ = conn.Write(append(length[:], bytes...))
}
