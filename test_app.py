import importlib.util
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError

urlopen = build_opener(ProxyHandler({})).open


class AppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = None
        if Path('app.py').exists():
            spec = importlib.util.spec_from_file_location('comic_app', 'app.py')
            cls.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cls.module)

    def setUp(self):
        self.assertIsNotNone(self.module, 'Local comic server has not been implemented')
        self.temp = tempfile.TemporaryDirectory()
        self.server = self.module.make_server(Path(self.temp.name), port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        if hasattr(self, 'server'):
            self.server.shutdown()
            self.server.server_close()
            self.temp.cleanup()

    def call(self, path, data=None, content_type='application/json'):
        body = json.dumps(data).encode() if data is not None else None
        return urlopen(Request(self.base + path, data=body, headers={'Content-Type': content_type}))

    def test_saved_page_reopens_with_images_and_dialogue(self):
        project = {'id': 'chapter-one', 'name': 'Chapter one', 'panels': [
            {'image': '/images/hero.png', 'bubbles': [{'text': 'Hello!', 'x': 40, 'y': 50}]}]
            + [{'image': None, 'bubbles': []} for _ in range(5)]}
        self.call('/api/projects', project).close()
        with self.call('/api/projects/chapter-one') as response:
            self.assertEqual(json.load(response), project)
        with self.call('/api/projects') as response:
            self.assertEqual(json.load(response)[0]['name'], 'Chapter one')

    def test_invalid_project_does_not_replace_saved_page(self):
        project = {'id': 'safe', 'name': 'Keep me', 'panels': [{'image': None, 'bubbles': []} for _ in range(6)]}
        self.call('/api/projects', project).close()
        with self.assertRaises(HTTPError) as error:
            self.call('/api/projects', {**project, 'panels': []})
        self.assertEqual(error.exception.code, 400)
        with self.call('/api/projects/safe') as response:
            self.assertEqual(json.load(response)['name'], 'Keep me')

    def test_uploaded_image_appears_in_folder_and_library(self):
        import base64
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
        request = Request(self.base + '/api/images?name=hero.png', data=png, headers={'Content-Type': 'image/png'})
        with urlopen(request) as response:
            asset = json.load(response)
        with self.call('/api/images') as response:
            self.assertIn(asset, json.load(response))
        with self.call(asset['url']) as response:
            self.assertEqual(response.read(), png)
        self.assertEqual((Path(self.temp.name) / 'images' / asset['name']).read_bytes(), png)

    def test_project_id_cannot_escape_project_folder(self):
        with self.assertRaises(HTTPError) as error:
            self.call('/api/projects', {'id': '../escape', 'name': 'bad', 'panels': [{}] * 6})
        self.assertEqual(error.exception.code, 400)

    def test_https_forwarded_origin_can_save_without_allowing_foreign_origins(self):
        project = {'id': 'cloud-page', 'name': 'Cloud page',
                   'panels': [{'image': None, 'bubbles': []} for _ in range(6)]}
        body = json.dumps(project).encode()
        same_host = Request(self.base + '/api/projects', data=body,
                            headers={'Content-Type': 'application/json',
                                     'Origin': self.base.replace('http:', 'https:')})
        with urlopen(same_host) as response:
            self.assertTrue(json.load(response)['saved'])
        foreign = Request(self.base + '/api/projects', data=body,
                          headers={'Content-Type': 'application/json',
                                   'Origin': 'https://foreign.example'})
        with self.assertRaises(HTTPError) as error:
            urlopen(foreign)
        self.assertEqual(error.exception.code, 403)


if __name__ == '__main__':
    unittest.main()
