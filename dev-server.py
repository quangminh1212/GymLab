"""GymLab Dev Server — auto-reload on file change."""
import http.server
import os
import sys
import time
import hashlib
import threading

PORT = 8080
SRC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")

# Live-reload script injected into every HTML response
RELOAD_SCRIPT = """
<script>
(function(){
  var _hashes = {};
  var _lastHash = '';
  function checkReload() {
    fetch('/__hot__').then(r => r.text()).then(h => {
      if (_lastHash && h !== _lastHash) { location.reload(); }
      _lastHash = h;
    }).catch(()=>{});
  }
  setInterval(checkReload, 800);
})();
</script>
"""

_file_hashes = {}

def compute_hash():
    h = hashlib.md5()
    for root, dirs, files in os.walk(SRC_DIR):
        for f in files:
            if f.endswith(('.html', '.css', '.js')):
                fp = os.path.join(root, f)
                try:
                    with open(fp, 'rb') as fh:
                        h.update(fh.read())
                except Exception:
                    pass
    return h.hexdigest()

class ReloadHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SRC_DIR, **kwargs)

    def do_GET(self):
        if self.path == '/__hot__':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(compute_hash().encode())
            return
        super().do_GET()

    def do_GET_with_reload(self):
        if self.path.endswith('.html') or self.path == '/' or self.path == '':
            # Read the original file and inject reload script
            super().do_GET()
            return
        super().do_GET()

    def end_headers(self):
        # Inject reload script into HTML responses
        if hasattr(self, '_content_buffer'):
            pass
        super().end_headers()

    def log_message(self, format, *args):
        ts = time.strftime('%H:%M:%S')
        msg = format % args
        # Color the output
        if '200' in msg:
            print(f"  \033[32m[{ts}]\033[0m {msg}")
        elif '304' in msg or '204' in msg:
            print(f"  \033[90m[{ts}]\033[0m {msg}")
        else:
            print(f"  [{ts}] {msg}")


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """Minimal handler with hot-reload injection."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SRC_DIR, **kwargs)

    def do_GET(self):
        if self.path == '/__hot__':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(compute_hash().encode())
            return

        # Serve the file
        path = self.path.lstrip('/')
        if path == '' or path == '/':
            path = 'index.html'

        file_path = os.path.join(SRC_DIR, path)

        if not os.path.isfile(file_path):
            self.send_error(404)
            return

        with open(file_path, 'rb') as f:
            content = f.read()

        # Inject reload into HTML files
        if path.endswith('.html'):
            html = content.decode('utf-8', errors='replace')
            html = html.replace('</body>', RELOAD_SCRIPT + '\n</body>')
            content = html.encode('utf-8')

        self.send_response(200)
        if path.endswith('.html'):
            self.send_header('Content-Type', 'text/html; charset=utf-8')
        elif path.endswith('.css'):
            self.send_header('Content-Type', 'text/css')
        elif path.endswith('.js'):
            self.send_header('Content-Type', 'application/javascript')
        else:
            self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        ts = time.strftime('%H:%M:%S')
        msg = format % args
        if '200' in msg:
            print(f"  \033[32m[{ts}]\033[0m {msg}")
        elif '304' in msg:
            print(f"  \033[90m[{ts}]\033[0m {msg}")
        else:
            print(f"  [{ts}] {msg}")

    def do_POST(self):
        self.do_GET()


def main():
    os.chdir(SRC_DIR)
    server = http.server.HTTPServer(('127.0.0.1', PORT), QuietHandler)

    print()
    print("  \033[32m╔══════════════════════════════════════╗\033[0m")
    print("  \033[32m║       🏋️  GymLab Dev Server          ║\033[0m")
    print("  \033[32m╠══════════════════════════════════════╣\033[0m")
    print(f"  \033[32m║\033[0m  URL:     http://localhost:\033[1;33m{PORT}\033[0m       \033[32m║\033[0m")
    print("  \033[32m║\033[0m  Mode:    \033[1;36mHot Reload\033[0m (800ms)       \033[32m║\033[0m")
    print("  \033[32m║\033[0m  Source:  src/                     \033[32m║\033[0m")
    print("  \033[32m╚══════════════════════════════════════╝\033[0m")
    print()
    print("  Edit HTML/CSS/JS → browser auto-reloads")
    print("  Press Ctrl+C to stop.")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
        server.server_close()


if __name__ == '__main__':
    main()
