import json
import os
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from lumina_agent import host

EVERY = int(os.environ.get("AGENT_EVERY_SECONDS", "900"))


def safe(fn):
    try:
        return 200, fn()
    except Exception as e:
        traceback.print_exc()
        return 500, {"error": str(e)}


again = threading.Event()


def tick_coalesced():
    if not host.lock.acquire(blocking=False):
        again.set()
        return {"queued": True}
    host.lock.release()
    result = host.tick()
    while again.is_set():
        again.clear()
        result = host.tick()
    return result


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        code, body = safe({"/tick": tick_coalesced, "/reset": host.reset}.get(self.path, lambda: {"error": "not found"}))
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"ok": true}')

    def log_message(self, *args):
        pass


def loop():
    while True:
        code, result = safe(tick_coalesced)
        print("[agent] tick", code, result, flush=True)
        time.sleep(EVERY if code == 200 else 10)


if __name__ == "__main__":
    threading.Thread(target=loop, daemon=True).start()
    port = int(os.environ.get("AGENT_PORT", "8790"))
    print(f"[agent] ActiveGraph agent on :{port}, every {EVERY}s → {host.API}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
