/**
 * Browser terminal for Boat sandboxes.
 *
 * Vercel hosts the PTY WebSocket itself (`openInteractive`); Boat does not, so
 * a small bridge runs inside the VM and speaks the same JSON framing the web
 * `TerminalPanel` already uses with Vercel (`start` / `resize` text frames,
 * binary keystrokes in, output out, `control` / `exit` status frames). The
 * client therefore needs no Boat branch.
 *
 * The bridge only listens on loopback. The public URL is Eva's in-sandbox auth
 * proxy (previewProxy.ts) on its own Boat port, which checks the short-lived
 * preview grant on the upgrade — the same gate the desktop websocket uses.
 *
 * Python stdlib only (pty, select, a minimal RFC 6455): Boat's Ubuntu image
 * ships python3, and node has no built-in PTY.
 */

/** Loopback port the bridge listens on. */
export const BOAT_PTY_BRIDGE_PORT = 17681;
/** Boat-exposed port of the auth proxy that fronts the bridge. */
export const BOAT_PTY_PUBLIC_PORT = 7681;
export const BOAT_PTY_BRIDGE_PATH = "/tmp/eva-pty-bridge.py";
/** Bumped when the script changes so a running old bridge is replaced. */
export const BOAT_PTY_BRIDGE_VERSION = "eva-pty-bridge-v1";

export const BOAT_PTY_BRIDGE_SCRIPT = String.raw`#!/usr/bin/env python3
"""Eva PTY bridge: one WebSocket per terminal, JSON control frames (see boatBridge.ts)."""
import base64, fcntl, hashlib, json, os, pty, select, signal, socket, socketserver, struct, sys, termios

VERSION = "${BOAT_PTY_BRIDGE_VERSION}"
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def read_exact(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise EOFError()
        buf += chunk
    return buf


def read_frame(sock):
    b1, b2 = read_exact(sock, 2)
    fin, opcode = b1 & 0x80, b1 & 0x0F
    length = b2 & 0x7F
    if length == 126:
        length = struct.unpack("!H", read_exact(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", read_exact(sock, 8))[0]
    mask = read_exact(sock, 4) if b2 & 0x80 else b"\0\0\0\0"
    data = bytearray(read_exact(sock, length))
    for i in range(length):
        data[i] ^= mask[i % 4]
    return bool(fin), opcode, bytes(data)


def send_frame(sock, opcode, data):
    header = bytes([0x80 | opcode])
    n = len(data)
    if n < 126:
        header += bytes([n])
    elif n < 65536:
        header += bytes([126]) + struct.pack("!H", n)
    else:
        header += bytes([127]) + struct.pack("!Q", n)
    sock.sendall(header + data)


def send_json(sock, obj):
    send_frame(sock, 1, json.dumps(obj).encode())


def set_size(fd, cols, rows):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", int(rows), int(cols), 0, 0))


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        sock = self.request
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = sock.recv(4096)
            if not chunk:
                return
            head += chunk
            if len(head) > 65536:
                return
        lines = head.split(b"\r\n\r\n", 1)[0].decode("latin-1").split("\r\n")
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        key = headers.get("sec-websocket-key")
        if not key:
            body = VERSION.encode()
            sock.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: " + str(len(body)).encode() + b"\r\nConnection: close\r\n\r\n" + body)
            return
        accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
        sock.sendall(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n").encode())
        self.session(sock)

    def session(self, sock):
        pid, fd = None, None
        partial, partial_op = b"", 0
        try:
            while True:
                readers = [sock] + ([fd] if fd is not None else [])
                ready, _, _ = select.select(readers, [], [], 30)
                if fd is not None and fd in ready:
                    try:
                        out = os.read(fd, 65536)
                    except OSError:
                        out = b""
                    if not out:
                        _, status = os.waitpid(pid, 0)
                        pid = None
                        code = os.waitstatus_to_exitcode(status)
                        send_json(sock, {"type": "exit", "code": code})
                        send_frame(sock, 8, b"")
                        return
                    send_frame(sock, 2, out)
                if sock not in ready:
                    continue
                fin, opcode, data = read_frame(sock)
                if opcode == 8:
                    return
                if opcode == 9:
                    send_frame(sock, 10, data)
                    continue
                if opcode == 0:
                    partial += data
                    if not fin:
                        continue
                    opcode, data, partial = partial_op, partial, b""
                elif not fin:
                    partial, partial_op = data, opcode
                    continue
                if opcode == 1:
                    try:
                        msg = json.loads(data.decode("utf-8", "replace"))
                    except ValueError:
                        msg = None
                    if isinstance(msg, dict) and msg.get("type") == "start" and pid is None:
                        pid, fd = self.spawn(msg)
                        send_json(sock, {"type": "control", "status": "connected"})
                        continue
                    if isinstance(msg, dict) and msg.get("type") == "resize":
                        if fd is not None:
                            set_size(fd, msg.get("cols", 80), msg.get("rows", 24))
                        continue
                if fd is not None and opcode in (1, 2):
                    os.write(fd, data)
        except (EOFError, ConnectionError, OSError):
            return
        finally:
            if pid is not None:
                try:
                    os.kill(pid, signal.SIGHUP)
                    os.waitpid(pid, 0)
                except OSError:
                    pass
            if fd is not None:
                try:
                    os.close(fd)
                except OSError:
                    pass

    def spawn(self, msg):
        command = str(msg.get("command") or "bash")
        args = [str(a) for a in (msg.get("args") or [])]
        env = dict(os.environ)
        for pair in msg.get("env") or []:
            if isinstance(pair, str) and "=" in pair:
                k, v = pair.split("=", 1)
                env[k] = v
        env.setdefault("TERM", "xterm-256color")
        cwd = str(msg.get("cwd") or os.environ.get("HOME", "/"))
        pid, fd = pty.fork()
        if pid == 0:
            try:
                os.chdir(cwd)
            except OSError:
                os.chdir(os.environ.get("HOME", "/"))
            os.execvpe(command, [command] + args, env)
        set_size(fd, msg.get("cols", 80), msg.get("rows", 24))
        return pid, fd


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else ${BOAT_PTY_BRIDGE_PORT}
    Server(("127.0.0.1", port), Handler).serve_forever()
`;

/** Shell probe: exits 0 when the current bridge version answers on loopback. */
export const BOAT_PTY_BRIDGE_HEALTH = `curl -fsS --max-time 2 http://127.0.0.1:${BOAT_PTY_BRIDGE_PORT}/ 2>/dev/null | grep -qx ${BOAT_PTY_BRIDGE_VERSION}`;
