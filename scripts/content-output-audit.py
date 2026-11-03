#!/usr/bin/env python3
"""Audit the *built* Luxury Realty migration and write one evidence report.

Run after the production build, on the same checkout as the media manifest:
    python3 scripts/content-output-audit.py
    python3 scripts/content-output-audit.py --output dist

The default output is .vercel/output/static, then dist/client, then dist.
This script performs no network requests, builds, JavaScript execution or writes
to the site. It writes only its JSON report. A file in public/ never substitutes
for a missing build artifact. Exit 0 means all enforced checks passed; warnings
and untested runtime behaviour remain explicit in the report. Exit 1 means a
confirmed audit failure; exit 2 means the audit could not complete.

Python 3.10+ and its standard library suffice. Pillow, if installed, broadens
image header support; WebP/PNG/GIF/JPEG dimensions also work without it.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import struct
import sys
import unicodedata
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DATE = '2026-11-03'
STATIC_ROUTES = {'/', '/properties/', '/developments/', '/about/', '/services/',
                 '/sell/', '/contacts/', '/privacy/', '/insights/'}
EXPECTED_COUNTS = {'properties': 110, 'projects': 7, 'insights': 4, 'static': 9}
SOURCE_CDNS = {'cdn.prod.website-files.com', 'assets.website-files.com',
               'uploads-ssl.webflow.com'}
IMAGE_EXT = re.compile(r'\.(?:avif|webp|png|jpe?g|gif|svg|ico|bmp)(?:$|[?#])', re.I)
ASSET_EXT = re.compile(r'\.(?:m?js|css|woff2?|ttf|otf|eot|avif|webp|png|jpe?g|gif|svg|ico|mp4|webm)(?:$|[?#])', re.I)
TRACKER = re.compile(r'googletagmanager\.com|google-analytics\.com|\bGTM-[A-Z0-9]+\b', re.I)
HEX256 = re.compile(r'^[a-f0-9]{64}$')
CSS_URL = re.compile(r'url\(\s*(?:"([^"]*)"|\'([^\']*)\'|([^)]*))\s*\)', re.I)
CSS_IMPORT = re.compile(r'@import\s+["\']([^"\']+)["\']', re.I)
JS_REFERENCE = re.compile(
    r'\b(?:import|export)\s*(?:\{[^}]*\}|\*\s*(?:as\s+\w+)?|[$\w]+(?:\s*,\s*(?:\{[^}]*\}|\*\s*as\s+\w+))?)\s*from\s*["\']([^"\']+)["\']'
    r'|\bimport\s*["\']([^"\']+)["\']'
    r'|\bimport\s*\(\s*["\']([^"\']+)["\']\s*\)'
    r'|\bnew\s+URL\s*\(\s*["\']([^"\']+)["\']\s*,\s*import\.meta\.url\s*\)')


def compact(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', value or '')).strip()


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def canonical_path(path):
    path = '/' + unquote(path or '/').lstrip('/')
    if not Path(path).suffix and not path.endswith('/'):
        path += '/'
    return path


def srcset_urls(value):
    """Parse URL/descriptor candidates, retaining commas inside a data URL."""
    candidates, offset = [], 0
    while offset < len(value):
        while offset < len(value) and (value[offset].isspace() or value[offset] == ','):
            offset += 1
        start = offset
        while offset < len(value) and not value[offset].isspace():
            offset += 1
        token = value[start:offset]
        if not token:
            break
        if token.endswith(','):
            candidates.append((token.rstrip(','), ''))
            continue
        start = offset
        depth = 0
        while offset < len(value):
            char = value[offset]
            if char == '(':
                depth += 1
            elif char == ')':
                depth = max(0, depth - 1)
            elif char == ',' and depth == 0:
                break
            offset += 1
        candidates.append((token, value[start:offset].strip()))
        offset += 1
    return candidates


def image_dimensions(path):
    try:
        from PIL import Image
    except ImportError:
        Image = None
    if Image is not None:
        with Image.open(path) as image:
            return image.size
    with path.open('rb') as stream:
        header = stream.read(32)
        if header.startswith(b'\x89PNG\r\n\x1a\n') and len(header) >= 24:
            return struct.unpack('>II', header[16:24])
        if header[:6] in (b'GIF87a', b'GIF89a'):
            return struct.unpack('<HH', header[6:10])
        if header[:4] == b'RIFF' and header[8:12] == b'WEBP':
            stream.seek(12)
            while True:
                chunk = stream.read(8)
                if len(chunk) < 8:
                    break
                kind, size = struct.unpack('<4sI', chunk)
                start = stream.tell()
                payload = stream.read(min(size, 16))
                if kind == b'VP8X' and len(payload) >= 10:
                    return (1 + int.from_bytes(payload[4:7], 'little'),
                            1 + int.from_bytes(payload[7:10], 'little'))
                if kind == b'VP8L' and len(payload) >= 5 and payload[0] == 0x2f:
                    bits = int.from_bytes(payload[1:5], 'little')
                    return (1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff))
                if kind == b'VP8 ' and len(payload) >= 10 and payload[3:6] == b'\x9d\x01\x2a':
                    width, height = struct.unpack('<HH', payload[6:10])
                    return width & 0x3fff, height & 0x3fff
                stream.seek(start + size + size % 2)
        if header[:2] == b'\xff\xd8':
            stream.seek(2)
            while True:
                marker = stream.read(1)
                if not marker:
                    break
                if marker != b'\xff':
                    continue
                marker = stream.read(1)
                while marker == b'\xff':
                    marker = stream.read(1)
                if marker in (b'\xd9', b'\xda', b''):
                    break
                if marker == b'\x01' or b'\xd0' <= marker <= b'\xd7':
                    continue
                size_bytes = stream.read(2)
                if len(size_bytes) != 2:
                    break
                size = int.from_bytes(size_bytes, 'big')
                if marker[0] in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
                                 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf):
                    payload = stream.read(5)
                    if len(payload) == 5:
                        height, width = struct.unpack('>HH', payload[1:5])
                        return width, height
                    break
                if size < 2:
                    break
                stream.seek(size - 2, 1)
    raise ValueError('Unsupported or invalid image header; install Pillow for this format')


class Document(HTMLParser):
    def __init__(self, path, route, content):
        super().__init__(convert_charrefs=True)
        self.path, self.route, self.content = path, route, content
        self.h1_count = 0
        self.titles, self.descriptions, self.canonicals = [], [], []
        self.ids, self.refs, self.links, self.styles, self.scripts, self.galleries = set(), [], [], [], [], []
        self.visible, self.accessible = [], []
        self.redirect = None
        self._head = False
        self._capture = None
        self._buffer = []
        self._script_attrs = {}
        self.feed(content)
        self.close()

    def ref(self, url, kind, attribute):
        if url and url.strip():
            self.refs.append({'url': url.strip(), 'kind': kind, 'attribute': attribute})

    def handle_starttag(self, tag, attributes):
        attrs = dict((key.lower(), value or '') for key, value in attributes)
        if tag == 'head':
            self._head = True
        if tag == 'h1':
            self.h1_count += 1
        if attrs.get('id'):
            self.ids.add(attrs['id'])
        if tag == 'a' and attrs.get('name'):
            self.ids.add(attrs['name'])
        for name in ('alt', 'aria-label', 'title'):
            if attrs.get(name):
                self.accessible.append(attrs[name])
        if tag in ('script', 'style') or (tag == 'title' and self._head):
            self._capture, self._buffer = tag, []
            self._script_attrs = attrs
        if tag == 'meta':
            key = (attrs.get('name') or attrs.get('property') or attrs.get('itemprop', '')).lower()
            if key == 'description':
                self.descriptions.append(attrs.get('content', ''))
            if key in ('og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src', 'image'):
                self.ref(attrs.get('content'), 'image', 'meta:' + key)
            if attrs.get('http-equiv', '').lower() == 'refresh':
                match = re.search(r'\burl\s*=\s*(.+)$', attrs.get('content', ''), re.I)
                if match:
                    self.redirect = match.group(1).strip(' \t\"\'')
        if tag == 'link':
            rel = set(attrs.get('rel', '').lower().split())
            if 'canonical' in rel:
                self.canonicals.append(attrs.get('href', ''))
            if rel & {'stylesheet', 'modulepreload', 'preload', 'icon', 'apple-touch-icon', 'manifest'}:
                kind = ('style' if 'stylesheet' in rel else 'image' if rel & {'icon', 'apple-touch-icon'}
                        else attrs.get('as', 'script' if 'modulepreload' in rel else 'asset'))
                self.ref(attrs.get('href'), kind, 'link:href')
            for value, _ in srcset_urls(attrs.get('imagesrcset', '')):
                self.ref(value, 'image', 'link:imagesrcset')
        if tag in ('a', 'area') and 'href' in attrs:
            self.links.append(attrs['href'])
        if tag == 'iframe' and attrs.get('src'):
            self.links.append(attrs['src'])
        if tag in ('img', 'image') or (tag == 'input' and attrs.get('type') == 'image'):
            for name in ('src', 'href', 'xlink:href'):
                self.ref(attrs.get(name), 'image', tag + ':' + name)
        elif tag in ('script', 'video', 'audio', 'track', 'source', 'embed'):
            kind = ('image' if tag == 'source' and (attrs.get('srcset') or attrs.get('type', '').startswith('image/'))
                    else 'script' if tag == 'script' else 'media')
            self.ref(attrs.get('src'), kind, tag + ':src')
        elif tag == 'object':
            self.ref(attrs.get('data'), 'asset', 'object:data')
        elif tag == 'use':
            self.ref(attrs.get('href') or attrs.get('xlink:href'), 'asset', 'use:href')
        self.ref(attrs.get('poster'), 'image', tag + ':poster')
        self.ref(attrs.get('data-poster'), 'image', tag + ':data-poster')
        self.ref(attrs.get('data-src'), 'media' if tag in ('video', 'audio') else 'image', tag + ':data-src')
        for name in ('srcset', 'data-srcset'):
            for value, descriptor in srcset_urls(attrs.get(name, '')):
                self.refs.append({'url': value, 'kind': 'image', 'attribute': tag + ':' + name,
                                  'descriptor': descriptor})
        if attrs.get('style'):
            self.styles.append(attrs['style'])
        if 'data-gallery' in attrs:
            self.galleries.append(attrs['data-gallery'])

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag in ('script', 'style', 'title'):
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag == 'head':
            self._head = False
        if tag == self._capture:
            value = ''.join(self._buffer)
            if tag == 'title':
                self.titles.append(compact(value))
            elif tag == 'style':
                self.styles.append(value)
            else:
                self.scripts.append((self._script_attrs, value))
            self._capture, self._buffer = None, []

    def handle_data(self, value):
        if self._capture:
            self._buffer.append(value)
        elif not self._head and value.strip():
            self.visible.append(value)


class Audit:
    def __init__(self, args):
        self.root, self.output = args.root.resolve(), args.output.resolve()
        self.args = args
        self.issues = {'errors': {}, 'warnings': {}}
        self.counts = Counter()
        self.origins = {'https://audit.invalid'}
        for origin in args.same_origin:
            parsed = urlsplit(origin)
            self.origins.add(f'{parsed.scheme.lower()}://{parsed.netloc.lower()}')
        self.docs, self.file_cache, self.route_cache = {}, {}, {}
        self.routes, self.functions, self.manifest = [], set(), {}
        self.redirects_used, self.dynamic_links, self.external_links = {}, set(), set()
        self.input_receipts, self.page_receipts, self.media_receipts = [], [], []
        self.gallery_sources = defaultdict(set)
        self.active_images = defaultdict(set)
        self.checked_assets, self.sitemap_routes = set(), set()
        self.report = {
            'audit': 'Luxury Realty built content and media audit', 'version': 1,
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'sourceDate': args.source_date, 'repository': str(self.root), 'output': str(self.output),
            'scope': {
                'networkRequests': 0, 'javascriptExecuted': False, 'publicFallbackAllowed': False,
                'expectedCanonicalRoutes': EXPECTED_COUNTS,
                'notVerified': [
                    'HTTP deployment behaviour, external links, film playback, forms and enquiries',
                    'Responsive visual quality, interactions, accessibility beyond structural checks',
                    'Pixel-by-pixel media fidelity or original source binaries absent from the output',
                    'Dynamically constructed JavaScript URLs; only literal imports/assets are inspected',
                    'Fragment targets and query-parameter behaviour; URL resolution proves the destination pathname only',
                    'Fresh market availability; sourceDate identifies the migrated snapshot',
                ],
            },
        }

    def issue(self, severity, code, message, **context):
        entry = {'code': code, 'message': message, **context}
        key = json.dumps(entry, sort_keys=True, ensure_ascii=False)
        self.issues[severity][key] = entry

    def error(self, code, message, **context):
        self.issue('errors', code, message, **context)

    def warn(self, code, message, **context):
        self.issue('warnings', code, message, **context)

    def relative(self, path):
        try:
            return str(path.relative_to(self.root))
        except ValueError:
            return str(path)

    def json_input(self, relative, required=True):
        path = self.root / relative
        if not path.is_file():
            if required:
                self.error('missing_input', 'Required audit input is missing', file=relative)
            return None
        try:
            result = json.loads(path.read_text(encoding='utf-8'))
            self.input_receipts.append({'file': relative, 'sha256': digest(path), 'bytes': path.stat().st_size})
            return result
        except (OSError, ValueError) as exc:
            self.error('invalid_input', str(exc), file=relative)
            return None

    def local_url(self, value, base='/'):
        value = (value or '').strip()
        if not value or value.startswith('#'):
            return None
        parsed = urlsplit(urljoin('https://audit.invalid' + base, value))
        if parsed.scheme not in ('http', 'https'):
            return None
        origin = f'{parsed.scheme.lower()}://{parsed.netloc.lower()}'
        if origin not in self.origins:
            return None
        path = unquote(parsed.path or '/')
        if '\x00' in path or '\\' in path or '..' in Path(path).parts:
            raise ValueError('Unsafe or ambiguous local asset path: ' + value)
        return urlunsplit(('', '', path, parsed.query, parsed.fragment))

    def physical(self, path, navigation=False):
        path = unquote(urlsplit(path).path)
        candidate = (self.output / path.lstrip('/')).resolve()
        if not candidate.is_relative_to(self.output):
            return None
        candidates = [candidate]
        if navigation:
            candidates.extend([candidate / 'index.html', Path(str(candidate).rstrip('/') + '.html')])
        for item in candidates:
            if item.is_file() and item.is_relative_to(self.output):
                return item
        return None

    def read_routes(self):
        path = self.args.config
        if path is None:
            candidate = self.output.parent / 'config.json'
            path = candidate if candidate.is_file() else None
        if path is None:
            self.warn('routing_config_absent', 'No Vercel routing config; only physical files and HTML redirects can be resolved')
            return
        path = path.resolve()
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
            self.input_receipts.append({'file': self.relative(path), 'sha256': digest(path), 'bytes': path.stat().st_size})
            for index, rule in enumerate(data.get('routes', [])):
                if rule.get('handle'):
                    self.routes.append({'handle': rule['handle']})
                    continue
                if not rule.get('src'):
                    continue
                if rule.get('has') or rule.get('missing') or rule.get('methods'):
                    self.warn('conditional_route_unchecked', 'Conditional route cannot be proven by an offline path audit', rule=index, src=rule['src'])
                    continue
                try:
                    regex = re.compile(re.sub(r'\(\?<([A-Za-z_]\w*)>', r'(?P<\1>', rule['src']))
                except re.error as exc:
                    self.warn('unsupported_route_regex', str(exc), rule=index, src=rule['src'])
                    continue
                self.routes.append({**rule, '_regex': regex, '_index': index})
            functions = path.parent / 'functions'
            if functions.is_dir():
                self.functions = {'/' + str(item.relative_to(functions))[:-5]
                                  for item in functions.rglob('*.func') if item.is_dir()}
            self.report['routingConfig'] = {'file': self.relative(path), 'rules': len(self.routes),
                                            'functions': sorted(self.functions)}
        except (OSError, ValueError, TypeError) as exc:
            self.error('invalid_routing_config', str(exc), file=self.relative(path))

    @staticmethod
    def substitute(target, match):
        def replace(token):
            name = token.group(1)
            try:
                return match.group(int(name) if name.isdigit() else name) or ''
            except (IndexError, KeyError):
                return token.group(0)
        return re.sub(r'\$(\d+|[A-Za-z_]\w*)', replace, target)

    def resolve(self, value, base='/', seen=()):
        local = self.local_url(value, base)
        if local is None:
            return {'kind': 'external', 'url': value}
        path = urlsplit(local).path or '/'
        if path in seen or len(seen) > 12:
            return {'kind': 'loop', 'path': path, 'chain': list(seen)}
        if not seen and path in self.route_cache:
            return self.route_cache[path]

        def follow(target, rule):
            target = self.substitute(target, rule['_match']) if '_match' in rule else target
            self.redirects_used[path] = target
            return self.resolve(target, path, (*seen, path))

        physical = self.physical(path, navigation=True)
        result = None
        for rule in self.routes:
            if rule.get('handle') == 'filesystem':
                if physical:
                    break
                continue
            if '_regex' not in rule:
                continue
            match = rule['_regex'].fullmatch(path)
            if not match:
                continue
            headers = {str(key).lower(): str(value) for key, value in rule.get('headers', {}).items()}
            status = rule.get('status', 200)
            target = headers.get('location')
            if target and 300 <= status < 400:
                result = follow(target, {**rule, '_match': match})
                break
            destination = rule.get('dest')
            if status >= 400:
                # A catch-all 404 after the filesystem handler must not validate a missing URL.
                if not physical:
                    result = {'kind': 'missing', 'path': path, 'status': status}
                    break
                continue
            if not destination:
                continue
            destination = self.substitute(destination, match)
            destination_local = self.local_url(destination, path)
            if destination_local is None:
                result = {'kind': 'external_rewrite', 'url': destination}
                break
            destination_path = urlsplit(destination_local).path
            target_file = self.physical(destination_path, navigation=True)
            if target_file and destination_path not in ('/404', '/404.html', '/404/'):
                result = {'kind': 'file', 'path': destination_path, 'file': target_file,
                          'rewriteFrom': path}
                break
            if destination_path.rstrip('/') in self.functions:
                result = {'kind': 'dynamic', 'path': path, 'function': destination_path}
                break
        if result is None and physical:
            document = self.docs.get(physical)
            if document and document.redirect:
                result = follow(document.redirect, {})
            else:
                result = {'kind': 'file', 'path': path, 'file': physical}
        if result is None:
            result = {'kind': 'missing', 'path': path}
        if not seen:
            self.route_cache[path] = result
        return result

    def inspect_file(self, path):
        if path not in self.file_cache:
            entry = {'file': self.relative(path), 'bytes': path.stat().st_size, 'sha256': digest(path)}
            if IMAGE_EXT.search(path.name) and path.suffix.lower() != '.svg':
                try:
                    entry['width'], entry['height'] = image_dimensions(path)
                except (OSError, ValueError, struct.error) as exc:
                    entry['dimensionError'] = str(exc)
            self.file_cache[path] = entry
        return self.file_cache[path]

    def asset(self, value, kind, base, context, descriptor=''):
        self.counts['assetReferences'] += 1
        if not value or value.startswith(('#', 'data:', 'blob:')):
            return
        try:
            local = self.local_url(value, base)
        except ValueError as exc:
            self.error('invalid_asset_url', str(exc), at=context, url=value)
            return
        if local is None:
            parsed = urlsplit(value if not value.startswith('//') else 'https:' + value)
            if parsed.scheme in ('http', 'https') and (kind == 'image' or parsed.hostname in SOURCE_CDNS):
                self.error('external_image_hotlink', 'Active image or source-CDN asset bypasses the local media store', at=context, url=value)
            return
        path = self.physical(local)
        if path is None:
            resolved = self.resolve(local, base)
            if resolved.get('kind') == 'file' and resolved['file'].suffix.lower() not in ('.html', '.htm'):
                path = resolved['file']
        if path is None:
            public = self.root / 'public' / urlsplit(local).path.lstrip('/')
            self.error('missing_built_asset', 'Referenced local asset is absent from the compiled output',
                       at=context, url=value, publicFileExists=public.is_file())
            return
        self.checked_assets.add(path)
        if path.stat().st_size == 0:
            self.error('empty_asset', 'Built asset is empty', file=self.relative(path), at=context)
        if kind == 'image':
            self.active_images[canonical_path(base)].add(urlsplit(local).path)
            if descriptor.endswith('w') and descriptor[:-1].isdigit():
                info = self.inspect_file(path)
                if 'width' in info and info['width'] != int(descriptor[:-1]):
                    self.error('srcset_width_mismatch', 'srcset descriptor does not equal the encoded image width',
                               at=context, url=value, descriptor=descriptor, actualWidth=info['width'])

    def check_brand(self, value, context):
        # The legal operator and retained contact addresses are intentional exceptions.
        value = compact(value)
        value = re.sub(r'Luxury\s+Residences\s+Real\s+Estate\s+L\.?L\.?C\.?', '', value, flags=re.I)
        value = re.sub(r'\b[\w.+-]+@(?:[\w-]+\.)*luxuryresidences\.com\b', '', value, flags=re.I)
        value = re.sub(r'(?:https?://)?(?:www\.)?luxuryresidences\.com\b', '', value, flags=re.I)
        # Lowercase "luxury residences" describes the product in several project
        # paragraphs; it is not the former agency's capitalised proper name.
        match = re.search(r'\bLuxury[\s\u200d]*Residences\b', value)
        if match:
            self.error('legacy_public_brand', 'Old agency branding remains outside the legal/contact exception',
                       at=context, excerpt=value[max(0, match.start()-70):match.end()+100])

    def check_tracker(self, value, context):
        match = TRACKER.search(value)
        if match:
            self.error('legacy_tracking_code', 'Legacy Google tracking or tag-manager reference remains in the public output',
                       at=context, match=match.group(0))

    def css(self, value, base, context):
        value = re.sub(r'/\*.*?\*/', '', value, flags=re.S)
        for match in CSS_URL.finditer(value):
            url = next((part for part in match.groups() if part is not None), '').strip()
            self.asset(url, 'image' if IMAGE_EXT.search(url) else 'asset', base, context)
        for match in CSS_IMPORT.finditer(value):
            self.asset(match.group(1), 'style', base, context)

    def javascript(self, value, base, context):
        self.check_tracker(value, context)
        for match in JS_REFERENCE.finditer(value):
            url = next(part for part in match.groups() if part)
            if url.startswith(('.', '/')) or ASSET_EXT.search(url):
                self.asset(url, 'image' if IMAGE_EXT.search(url) else 'script', base, context)
        # A literal old-CDN URL in executable code needs review even when its use
        # cannot be established without running JavaScript; it is not a false pass.
        if any(host in value for host in SOURCE_CDNS):
            self.warn('source_cdn_in_executable_script', 'A source-CDN literal remains in executable JavaScript; runtime use needs review', at=context)

    def json_images(self, value, base, context, image_context=False):
        if isinstance(value, list):
            for index, child in enumerate(value):
                self.json_images(child, base, f'{context}[{index}]', image_context)
            return
        if isinstance(value, str) and image_context:
            self.asset(value, 'image', base, context)
            return
        if not isinstance(value, dict):
            return
        paired_source = value.get('image') or value.get('sourceUrl')
        paired_local = value.get('src')
        if isinstance(paired_source, str) and isinstance(paired_local, str) and paired_source in self.manifest:
            expected = self.manifest[paired_source].get('src')
            if paired_local != expected:
                self.error('json_media_mapping_mismatch', 'Source image and local src do not match the media manifest',
                           at=context, sourceUrl=paired_source, expected=expected, actual=paired_local)
        for key, child in value.items():
            if (key in ('image', 'thumbnailUrl', 'logo', 'poster', 'src', 'contentUrl') or
                    (image_context and key == 'url')) and isinstance(child, str):
                if key == 'image' and paired_local and child in self.manifest:
                    continue  # Exact source provenance paired with a checked local src.
                if key in ('image', 'thumbnailUrl', 'logo', 'poster') or image_context or IMAGE_EXT.search(child):
                    self.asset(child, 'image', base, context + '.' + key)
                elif key == 'src' and child.startswith(('/', 'http', '.')):
                    self.asset(child, 'asset', base, context + '.src')
            if key in ('alt', 'title', 'description', 'name') and isinstance(child, str):
                self.check_brand(child, context + '.' + key)
            if isinstance(child, (list, dict)):
                self.json_images(child, base, context + '.' + key,
                                 key in ('image', 'images', 'photos', 'gallery', 'logo', 'thumbnailUrl', 'poster'))

    def check_gallery(self, raw, document):
        context = document.route + ' data-gallery'
        try:
            gallery = json.loads(raw)
        except ValueError as exc:
            self.error('invalid_gallery_json', str(exc), at=context)
            return
        if not isinstance(gallery, list) or not gallery:
            self.error('invalid_gallery_shape', 'Gallery must be a nonempty JSON array', at=context)
            return
        self.counts['uniqueGalleryArrays'] += 1
        self.counts['galleryItems'] += len(gallery)
        for index, photo in enumerate(gallery):
            at = context + f'[{index}]'
            if not isinstance(photo, dict) or not isinstance(photo.get('src'), str):
                self.error('gallery_local_src_missing', 'Gallery item lacks its mapped local src', at=at)
                continue
            self.asset(photo['src'], 'image', document.route, at)
            source = photo.get('image')
            if source:
                self.gallery_sources[document.route].add(source)
                if source not in self.manifest:
                    self.error('gallery_source_unmapped', 'Gallery source image has no imported-media entry', at=at, sourceUrl=source)
                elif self.manifest[source].get('src') != photo['src']:
                    self.error('gallery_mapping_mismatch', 'Gallery source image resolves to a different local file', at=at,
                               sourceUrl=source, actual=photo['src'], expected=self.manifest[source].get('src'))
            self.check_brand(str(photo.get('alt', '')), at + '.alt')

    def read_sitemap(self):
        pending, visited, urls = [self.output / 'sitemap.xml'], set(), []
        while pending:
            path = pending.pop()
            if path in visited:
                self.error('sitemap_cycle', 'Sitemap index repeats a file', file=self.relative(path))
                continue
            visited.add(path)
            if not path.is_file():
                self.error('sitemap_missing', 'Compiled sitemap is missing', file=self.relative(path))
                continue
            try:
                tree = ET.fromstring(path.read_bytes())
                locations = [node.text.strip() for node in tree.iter() if node.tag.rsplit('}', 1)[-1] == 'loc' and node.text]
                if tree.tag.rsplit('}', 1)[-1] == 'sitemapindex':
                    for value in locations:
                        candidate = (self.output / unquote(urlsplit(value).path).lstrip('/')).resolve()
                        if candidate.is_relative_to(self.output):
                            pending.append(candidate)
                        else:
                            self.error('sitemap_path_escape', 'Sitemap index points outside build output', url=value)
                else:
                    urls.extend(locations)
            except (OSError, ET.ParseError) as exc:
                self.error('invalid_sitemap', str(exc), file=self.relative(path))
        origins = set()
        for value in urls:
            parsed = urlsplit(value)
            if parsed.scheme not in ('https', 'http') or not parsed.netloc or parsed.query or parsed.fragment:
                self.error('invalid_sitemap_url', 'Sitemap URL must be absolute and canonical without query or fragment', url=value)
            origins.add(f'{parsed.scheme.lower()}://{parsed.netloc.lower()}')
            path = canonical_path(parsed.path)
            if path in self.sitemap_routes:
                self.error('duplicate_sitemap_route', 'Canonical URL occurs more than once in the sitemap', route=path)
            self.sitemap_routes.add(path)
            if path != parsed.path:
                self.error('noncanonical_sitemap_path', 'Sitemap path differs from the trailing-slash route convention', url=value, expected=path)
        self.origins.update(origins)
        if len(origins) != 1:
            self.error('sitemap_origin_count', 'Sitemap must have one canonical origin', origins=sorted(origins))
        if any(urlsplit(origin).hostname in ('luxuryresidences.com', 'www.luxuryresidences.com') for origin in origins):
            self.error('legacy_sitemap_origin', 'Sitemap still points to the previous agency website', origins=sorted(origins))
        self.report['sitemap'] = {'files': [self.relative(path) for path in sorted(visited)],
                                  'urlCount': len(urls), 'uniqueRoutes': len(self.sitemap_routes), 'origins': sorted(origins)}

    def load_documents(self):
        for path in sorted(self.output.rglob('*.html')):
            relative = '/' + path.relative_to(self.output).as_posix()
            route = relative[:-10] if relative.endswith('index.html') else relative
            try:
                self.docs[path.resolve()] = Document(path.resolve(), route, path.read_text(encoding='utf-8'))
            except (OSError, ValueError) as exc:
                self.error('unreadable_built_html', str(exc), file=self.relative(path))
        self.counts['htmlFiles'] = len(self.docs)

    def check_manifest(self, source_media, hero):
        required = {item.get('url') for item in source_media if isinstance(item, dict) and item.get('url')}
        required.update(hero[key] for key in ('mp4', 'poster') if hero.get(key))
        missing = required - set(self.manifest)
        if missing:
            self.error('media_manifest_incomplete', 'Required source media have not all been copied into the local media store',
                       count=len(missing), sourceUrls=sorted(missing))
        self.report['mediaCoverage'] = {'requestedSourceImages': len(source_media), 'requiredIncludingHero': len(required),
                                       'manifestEntries': len(self.manifest), 'missingEntries': len(missing)}
        for source, entry in self.manifest.items():
            if not isinstance(entry, dict):
                self.error('invalid_media_entry', 'Manifest entry must be an object', sourceUrl=source)
                continue
            if entry.get('sourceUrl') != source:
                self.error('media_source_url_mismatch', 'Manifest key and sourceUrl differ', sourceUrl=source)
            video = entry.get('type', '').startswith('video/')
            if not video and not HEX256.fullmatch(str(entry.get('sourceSha256', ''))):
                self.error('source_hash_missing', 'Imported image needs an original-binary SHA-256 receipt', sourceUrl=source)
            variants = entry.get('variants', [])
            if not video and (not isinstance(variants, list) or not variants):
                self.error('media_variants_missing', 'Imported image has no recorded variants', sourceUrl=source)
                variants = []
            declared = [entry, *variants]
            variant_sources = {item.get('src') for item in variants if isinstance(item, dict)}
            if variants and entry.get('src') not in variant_sources:
                self.error('media_main_variant_missing', 'Main image is not one of the recorded variants', sourceUrl=source)
            for item in declared:
                if not isinstance(item, dict):
                    self.error('invalid_media_variant', 'Media variant must be an object', sourceUrl=source)
                    continue
                src = item.get('src', '')
                if not isinstance(src, str) or not src.startswith('/') or src.startswith('//'):
                    self.error('media_src_not_local', 'Manifest media src must be an absolute local path', sourceUrl=source, src=src)
                    continue
                path = self.physical(src)
                if path is None:
                    public = self.root / 'public' / src.lstrip('/')
                    self.error('manifest_file_missing_from_build', 'Manifest file is absent from the compiled output',
                               src=src, publicFileExists=public.is_file())
                    continue
                actual = self.inspect_file(path)
                for key in ('bytes', 'sha256'):
                    if item.get(key) != actual[key]:
                        self.error('media_' + key + '_mismatch', 'Built file does not match its media manifest',
                                   src=src, expected=item.get(key), actual=actual[key])
                if not video:
                    for key in ('width', 'height'):
                        if not isinstance(item.get(key), int) or item[key] <= 0 or item[key] != actual.get(key):
                            self.error('media_dimension_mismatch', 'Encoded dimensions do not match the media manifest',
                                       src=src, dimension=key, expected=item.get(key), actual=actual.get(key),
                                       detail=actual.get('dimensionError'))
                elif entry.get('type') == 'video/mp4':
                    with path.open('rb') as stream:
                        if b'ftyp' not in stream.read(64):
                            self.error('hero_mp4_header_invalid', 'Hero media does not have an MP4 container header', src=src)
                self.checked_assets.add(path)
            if not video:
                for src, descriptor in srcset_urls(entry.get('srcset', '')):
                    if src not in variant_sources:
                        self.error('manifest_srcset_variant_missing', 'Manifest srcset points outside its variants', sourceUrl=source, src=src)
                    self.asset(src, 'image', '/', 'imported-media manifest', descriptor)
                if not entry.get('srcset'):
                    self.error('manifest_srcset_missing', 'Imported image lacks its responsive srcset', sourceUrl=source)
        self.media_receipts = [value for path, value in sorted(self.file_cache.items())
                               if path in self.checked_assets]

    def check_data(self, properties, projects, summary, hero):
        dates = Counter(str(item.get('sourceDate')) for item in properties)
        if summary.get('sourceDate') != self.args.source_date or set(dates) != {self.args.source_date}:
            self.error('source_date_mismatch', 'Source snapshot dates differ between records and the expected migration date',
                       expected=self.args.source_date, summary=summary.get('sourceDate'), propertyDates=dict(dates))
        try:
            date.fromisoformat(self.args.source_date)
        except ValueError:
            self.error('invalid_source_date', 'Expected sourceDate is not an ISO calendar date', value=self.args.source_date)
        site = self.root / 'src/data/site.ts'
        match = re.search(r"export\s+const\s+sourceDate\s*=\s*['\"]([^'\"]+)", site.read_text(encoding='utf-8')) if site.is_file() else None
        if not match or match.group(1) != self.args.source_date:
            self.error('site_source_date_mismatch', 'Public data module does not identify the expected source snapshot date')
        for group, records in (('properties', properties), ('projects', projects)):
            ids = [record.get('id') for record in records]
            if len(ids) != EXPECTED_COUNTS[group] or len(set(ids)) != len(ids):
                self.error('record_count_or_id_mismatch', 'Migrated records are missing, duplicated, or unexpectedly added',
                           group=group, expected=EXPECTED_COUNTS[group], actual=len(ids), unique=len(set(ids)))
            for record in records:
                images = [record.get('image'), *[photo.get('image') for photo in record.get('photos', [])]]
                if group == 'properties' and record.get('agent', {}).get('image'):
                    images.append(record['agent']['image'])
                for source in set(filter(None, images)):
                    if source not in self.manifest:
                        self.error('record_image_unmapped', 'Published data image has no local media mapping', group=group, id=record['id'], sourceUrl=source)
                if not HEX256.fullmatch(str(record.get('sourceHash', ''))):
                    self.error('record_provenance_missing', 'Published record has no source HTML SHA-256', group=group, id=record.get('id'))
        article_path = self.root / 'src/data/articles.ts'
        articles = re.findall(r"\bid\s*:\s*['\"]([^'\"]+)['\"]", article_path.read_text(encoding='utf-8')) if article_path.is_file() else []
        if len(articles) != EXPECTED_COUNTS['insights'] or len(set(articles)) != len(articles):
            self.error('insight_count_mismatch', 'Expected four unique local insight pages', ids=articles)
        expected = STATIC_ROUTES | {'/properties/' + item['id'] + '/' for item in properties}
        expected |= {'/developments/' + item['id'] + '/' for item in projects}
        expected |= {'/insights/' + item + '/' for item in articles}
        if expected != self.sitemap_routes:
            self.error('sitemap_coverage_mismatch', 'Sitemap and migrated canonical routes differ',
                       missing=sorted(expected - self.sitemap_routes), unexpected=sorted(self.sitemap_routes - expected))
        self.report['dataCoverage'] = {'properties': len(properties), 'projects': len(projects), 'insights': len(articles),
                                       'static': len(STATIC_ROUTES), 'expectedRoutes': len(expected),
                                       'recordSourceDates': dict(dates), 'heroSource': hero.get('mp4')}
        return expected

    def inspect_documents(self, expected):
        titles, descriptions = defaultdict(list), defaultdict(list)
        for path, document in self.docs.items():
            at = self.relative(path)
            self.check_tracker(document.content, at)
            self.check_brand(' '.join(document.visible + document.accessible), document.route)
            for value in document.titles + document.descriptions:
                self.check_brand(value, document.route + ' metadata')
            for ref in document.refs:
                self.asset(ref['url'], ref['kind'], document.route, at + ' ' + ref['attribute'], ref.get('descriptor', ''))
            for value in document.styles:
                self.css(value, document.route, at + ' inline CSS')
            for attrs, value in document.scripts:
                if attrs.get('type', '').lower() in ('application/json', 'application/ld+json'):
                    try:
                        self.json_images(json.loads(value), document.route, at + ' JSON script')
                    except ValueError as exc:
                        self.error('invalid_public_json', str(exc), at=at)
                else:
                    self.javascript(value, document.route, at + ' inline script')
            for raw in dict.fromkeys(document.galleries):
                self.check_gallery(raw, document)
            for href in dict.fromkeys(document.links):
                if not href or href.startswith(('#', 'mailto:', 'tel:', 'sms:', 'javascript:', 'data:')):
                    continue
                self.counts['linkReferencesFound'] += 1
                try:
                    result = self.resolve(href, document.route)
                except ValueError as exc:
                    self.error('invalid_internal_link', str(exc), at=document.route, href=href)
                    continue
                if result['kind'] in ('missing', 'loop'):
                    self.error('broken_internal_link', 'Internal link has no compiled page, file, or valid redirect target',
                               at=document.route, href=href, resolution={key: value for key, value in result.items() if key != 'file'})
                elif result['kind'] == 'dynamic':
                    self.dynamic_links.add(result['path'])
                elif result['kind'].startswith('external'):
                    self.external_links.add(href)
                else:
                    self.counts['resolvedInternalLinks'] += 1
            if document.redirect:
                self.counts['htmlRedirectStubs'] += 1
                continue
            if document.h1_count != 1:
                self.error('h1_count', 'Rendered content page must have exactly one h1', route=document.route, count=document.h1_count)
            if len(document.titles) != 1 or not document.titles[0]:
                self.error('page_title_count', 'Rendered page needs exactly one nonempty title', route=document.route, values=document.titles)
            if len(document.descriptions) != 1 or not compact(document.descriptions[0]):
                self.error('meta_description_count', 'Rendered page needs exactly one nonempty meta description', route=document.route, values=document.descriptions)
        for route in sorted(expected):
            result = self.resolve(route)
            path = result.get('file')
            document = self.docs.get(path)
            if result['kind'] != 'file' or not document or document.redirect:
                self.error('canonical_page_not_built', 'Canonical sitemap route has no real compiled HTML page', route=route, resolution=result['kind'])
                continue
            if canonical_path(document.route) != route:
                self.error('canonical_route_redirected', 'Canonical route resolves to another page instead of its own content', route=route, actual=document.route)
            if len(document.canonicals) != 1:
                self.error('canonical_tag_count', 'Canonical page needs exactly one canonical link', route=route, values=document.canonicals)
            elif self.local_url(document.canonicals[0], route) != route:
                self.error('canonical_tag_mismatch', 'Canonical link does not match the sitemap route', route=route, actual=document.canonicals[0])
            if document.titles:
                titles[compact(document.titles[0]).casefold()].append(route)
            if document.descriptions:
                descriptions[compact(document.descriptions[0]).casefold()].append(route)
            self.page_receipts.append({'route': route, 'file': self.relative(path), 'sha256': digest(path),
                                       'h1Count': document.h1_count,
                                       'title': document.titles[0] if document.titles else None,
                                       'description': document.descriptions[0] if document.descriptions else None,
                                       'gallerySourceImages': len(self.gallery_sources[document.route])})
        for group, values in (('title', titles), ('description', descriptions)):
            for value, routes in values.items():
                if len(routes) > 1:
                    self.error('duplicate_' + group, 'Canonical pages share the same ' + group, value=value, routes=routes)

    def check_gallery_coverage(self, properties, source_projects):
        for item in properties:
            route = '/properties/' + item['id'] + '/'
            expected = {photo['image'] for photo in item.get('photos', []) if photo.get('image')}
            actual = self.gallery_sources[route]
            if expected != actual:
                self.error('property_gallery_coverage', 'Built property gallery differs from the published source image set',
                           route=route, expectedCount=len(expected), actualCount=len(actual),
                           missing=sorted(expected - actual), unexpected=sorted(actual - expected))
        aliases = {'atlantis-the-royal': 'atlantis', 'ava': 'ava-at-palm'}
        excluded = re.compile(r'logo|placeholder|white@2x|atrr-colour', re.I)
        location_map = re.compile(r'(?:^|[\s_-])map(?:[\s_.()-]|$)', re.I)

        def image_filename(image):
            return unquote(urlsplit(image.get('url', '')).path.rsplit('/', 1)[-1])

        def is_location_map(image):
            return (image.get('url') == 'https://cdn.prod.website-files.com/66a8e4e8bd6f32dc468081cf/6708c7af4363d574b654f03e_20.png'
                    or bool(location_map.search(image_filename(image))))

        location_receipts = []
        for project in source_projects:
            if not project.get('publicationEligible'):
                continue
            sections = project.get('sections', [])
            sources = []
            for index, section in enumerate(sections):
                images = section.get('images', [])
                # The first image in each original project hero is its wordmark.
                sources.extend(images[1:] if index == 0 else images)
            expected = {image['url'] for image in sources if re.search(r'\.(?:jpe?g|png|webp|avif)(?:\?|$)', image.get('url', ''), re.I)
                        and not excluded.search(image_filename(image))
                        and not is_location_map(image)}
            expected_maps = {image['url'] for section in sections for image in section.get('images', [])
                             if is_location_map(image)}
            route = '/developments/' + aliases.get(project['slug'], project['slug']) + '/'
            actual = self.gallery_sources[route]
            if expected != actual:
                self.error('project_gallery_coverage', 'Built project gallery differs from its source photographs (wordmarks/maps excluded)',
                           route=route, expectedCount=len(expected), actualCount=len(actual),
                           missing=sorted(expected - actual), unexpected=sorted(actual - expected))


            if expected_maps:
                # A location map must be an actual rendered <img>, not only an
                # og:image, srcset candidate, link or unused media-manifest entry.
                document = self.docs.get(self.physical(route, navigation=True))
                image_paths = set()
                if document:
                    for ref in document.refs:
                        if ref['attribute'] != 'img:src':
                            continue
                        local = self.local_url(ref['url'], route)
                        if local:
                            image_paths.add(urlsplit(local).path)
                if not document or 'project-location' not in document.ids:
                    self.error('project_location_section_missing', 'Source location maps need a rendered project location section', route=route)
                mapped = []
                for source in sorted(expected_maps):
                    entry = self.manifest.get(source)
                    src = entry.get('src') if isinstance(entry, dict) else None
                    if not src or src not in image_paths:
                        self.error('project_location_map_coverage', 'Source location map is absent as its mapped img on the built project page',
                                   route=route, sourceUrl=source, expectedSrc=src)
                    else:
                        mapped.append({'sourceUrl': source, 'src': src})
                self.counts['projectLocationMapsChecked'] += len(expected_maps)
                location_receipts.append({'route': route, 'expectedCount': len(expected_maps),
                                          'actualMappedImgCount': len(mapped), 'images': mapped})
        self.report['projectLocationMaps'] = location_receipts

    def inspect_static_code(self):
        for path in sorted(self.output.rglob('*')):
            if not path.is_file() or path.suffix.lower() not in ('.css', '.js', '.mjs', '.json'):
                continue
            base = '/' + path.relative_to(self.output).as_posix()
            try:
                content = path.read_text(encoding='utf-8')
            except (OSError, UnicodeError) as exc:
                self.error('unreadable_public_code', str(exc), file=self.relative(path))
                continue
            if path.suffix == '.css':
                self.css(content, base, self.relative(path))
                self.counts['cssFiles'] += 1
            elif path.suffix in ('.js', '.mjs'):
                self.javascript(content, base, self.relative(path))
                self.counts['javascriptFiles'] += 1
            else:
                try:
                    self.json_images(json.loads(content), base, self.relative(path))
                except ValueError as exc:
                    self.error('invalid_public_json', str(exc), file=self.relative(path))
                self.counts['publicJsonFiles'] += 1

    def run(self):
        if not self.output.is_dir():
            self.error('build_output_missing', 'Build first: the selected compiled output directory does not exist', output=str(self.output))
            return False
        properties = self.json_input('src/data/properties.json') or []
        projects = self.json_input('src/data/catalogue-projects.json') or []
        source_projects = self.json_input('src/data/source/projects.json') or []
        summary = self.json_input('src/data/import-summary.json') or {}
        source_media = self.json_input('src/data/source/media-urls.json') or []
        hero = self.json_input('src/data/source/hero-media.json') or {}
        self.manifest = self.json_input('src/data/imported-media.json') or {}
        if not isinstance(self.manifest, dict):
            self.error('invalid_manifest', 'Imported media must be a JSON object keyed by source URL')
            self.manifest = {}
        self.read_sitemap()
        self.read_routes()
        self.load_documents()
        expected = self.check_data(properties, projects, summary, hero)
        self.check_manifest(source_media, hero)
        self.inspect_documents(expected)
        self.check_gallery_coverage(properties, source_projects)
        self.inspect_static_code()
        home = self.docs.get(self.physical('/', navigation=True))
        if home and hero.get('mp4') in self.manifest:
            src = self.manifest[hero['mp4']].get('src')
            if not any(ref['url'] == src and ref['kind'] == 'media' for ref in home.refs):
                self.error('hero_video_not_wired', 'Home page does not reference the migrated hero video', expected=src)
            poster = self.manifest.get(hero.get('poster'), {}).get('src')
            if poster and not any(ref['url'] == poster and 'poster' in ref['attribute'] for ref in home.refs):
                self.error('hero_poster_not_wired', 'Home video does not use the migrated hero poster', expected=poster)
        if self.dynamic_links:
            self.warn('dynamic_links_not_http_tested', 'Configured function destinations exist, but their HTTP status was not exercised', paths=sorted(self.dynamic_links))
        return True

    def write(self, incomplete=False):
        errors, warnings = [list(self.issues[key].values()) for key in ('errors', 'warnings')]
        self.report.update({
            'passed': not errors and not incomplete, 'complete': not incomplete,
            'summary': {**dict(self.counts), 'canonicalPagesChecked': len(self.page_receipts),
                        'uniqueBuiltAssetsChecked': len(self.checked_assets), 'manifestFilesHashed': len(self.media_receipts),
                        'errors': len(errors), 'warnings': len(warnings)},
            'errors': errors, 'warnings': warnings,
            'inputs': self.input_receipts, 'pages': self.page_receipts,
            'mediaFiles': self.media_receipts,
            'redirectsExercised': self.redirects_used,
            'externalLinksNotRequested': sorted(self.external_links),
        })
        destination = self.args.report.resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + '.tmp')
        temporary.write_text(json.dumps(self.report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        temporary.replace(destination)
        print(json.dumps({'passed': self.report['passed'], 'complete': not incomplete,
                          **self.report['summary'], 'report': str(destination)}, ensure_ascii=False))
        return 2 if incomplete else 1 if errors else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--root', type=Path, default=ROOT, help='Repository containing the normalized data and media manifest')
    parser.add_argument('--output', type=Path, help='Compiled static output; never the public source directory')
    parser.add_argument('--config', type=Path, help='Vercel Build Output config.json (default: sibling of selected static output)')
    parser.add_argument('--report', type=Path, help='JSON evidence artifact (default: artifacts/content-migration/content-output-audit.json)')
    parser.add_argument('--source-date', default=SOURCE_DATE, help='Expected migration snapshot date, YYYY-MM-DD')
    parser.add_argument('--same-origin', action='append', default=[], help='Additional absolute origin known to serve this same output; repeat as needed')
    args = parser.parse_args()
    args.root = args.root.resolve()
    if args.output is None:
        candidates = [args.root / '.vercel/output/static', args.root / 'dist/client', args.root / 'dist']
        args.output = next((path for path in candidates if path.is_dir()), candidates[0])
    if args.report is None:
        args.report = args.root / 'artifacts/content-migration/content-output-audit.json'
    audit = Audit(args)
    if audit.output == (args.root / 'public').resolve():
        audit.error('source_directory_selected', 'public/ is input, not a compiled build; refusing a misleading audit')
        return audit.write(incomplete=True)
    try:
        complete = audit.run()
    except Exception as exc:
        # Preserve partial evidence instead of silently omitting an unfinished check.
        audit.error('audit_incomplete', f'{type(exc).__name__}: {exc}')
        return audit.write(incomplete=True)
    return audit.write(incomplete=not complete)


if __name__ == '__main__':
    sys.exit(main())
