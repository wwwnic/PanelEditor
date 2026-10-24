"""Panel Ink: dependency-free, local comic page editor."""
import argparse
import json
import mimetypes
import os
import re
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}


def make_server(root=ROOT, port=8765):
    root = Path(root)
    for folder in ('images', 'projects'):
        (root / folder).mkdir(parents=True, exist_ok=True)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def send(self, data, status=200, content_type='application/json'):
            payload = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):
            path = unquote(urlparse(self.path).path)
            if path == '/api/images':
                from urllib.parse import quote
                return self.send([{'name': p.name, 'url': '/images/' + quote(p.name)} for p in sorted((root / 'images').iterdir()) if p.is_file() and p.suffix.lower() in EXTENSIONS])
            if path == '/api/projects':
                result = []
                for p in sorted((root / 'projects').glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True):
                    try:
                        project = json.loads(p.read_text(encoding='utf-8'))
                        result.append({'id': project['id'], 'name': project['name']})
                    except (ValueError, KeyError):
                        continue
                return self.send(result)
            if path.startswith('/api/projects/'):
                project_id = path.rsplit('/', 1)[-1]
                if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', project_id):
                    return self.send({'error': 'Invalid project ID'}, 400)
                file = root / 'projects' / (project_id + '.json')
            elif path.startswith('/images/'):
                name = path[len('/images/'):]
                if '/' in name or '\\' in name or Path(name).suffix.lower() not in EXTENSIONS:
                    return self.send({'error': 'Invalid image'}, 400)
                file = root / 'images' / name
            elif path in ('/', '/index.html', '/app.js', '/style.css'):
                file = ROOT / 'dist' / ('index.html' if path == '/' else path[1:])
            else:
                return self.send({'error': 'Not found'}, 404)
            if not file.is_file():
                return self.send({'error': 'Not found'}, 404)
            return self.send(file.read_bytes(), content_type=mimetypes.guess_type(str(file))[0] or 'application/octet-stream')

        def do_POST(self):
            origin = self.headers.get('Origin')
            if origin:
                parsed_origin = urlparse(origin)
                host = self.headers.get('Host', '')
                if (parsed_origin.scheme not in ('http', 'https')
                        or parsed_origin.netloc.casefold() != host.casefold()
                        or parsed_origin.path or parsed_origin.query or parsed_origin.fragment):
                    return self.send({'error': 'Same-origin requests only'}, 403)
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 30 * 1024 * 1024:
                    return self.send({'error': 'File must be between 1 byte and 30 MB'}, 400)
                body = self.rfile.read(length)
                url = urlparse(self.path)
                if url.path == '/api/images':
                    name = parse_qs(url.query).get('name', ['image.png'])[0]
                    suffix = Path(name).suffix.lower()
                    if suffix not in EXTENSIONS:
                        raise ValueError('Use PNG, JPEG, WebP or GIF images')
                    stem = re.sub(r'[^a-zA-Z0-9_-]', '-', Path(name).stem)[:70] or 'image'
                    name = stem + '-' + uuid.uuid4().hex[:8] + suffix
                    (root / 'images' / name).write_bytes(body)
                    return self.send({'name': name, 'url': '/images/' + name})
                if url.path != '/api/projects':
                    return self.send({'error': 'Not found'}, 404)
                project = json.loads(body)
                if not isinstance(project, dict) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', str(project.get('id', ''))):
                    raise ValueError('Invalid project ID')
                if not isinstance(project.get('name'), str) or not project['name'].strip():
                    raise ValueError('Give your page a name')
                panels = project.get('panels')
                if not isinstance(panels, list) or len(panels) != 6 or any(not isinstance(p, dict) or not isinstance(p.get('bubbles'), list) for p in panels):
                    raise ValueError('A page needs six panels with bubble lists')
                file = root / 'projects' / (project['id'] + '.json')
                temporary = file.with_suffix('.' + uuid.uuid4().hex + '.tmp')
                temporary.write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding='utf-8')
                os.replace(temporary, file)
                return self.send({'saved': True, 'id': project['id']})
            except (ValueError, TypeError) as error:
                self.send({'error': str(error)}, 400)
            except OSError:
                self.send({'error': 'Could not write file. Check folder permissions and free space.'}, 500)

    return ThreadingHTTPServer(('127.0.0.1', port), Handler)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    server = make_server(port=args.port)
    address = f'http://127.0.0.1:{server.server_port}'
    print(f'Panel Ink running at {address}', flush=True)
    if not args.no_browser:
        webbrowser.open(address)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
