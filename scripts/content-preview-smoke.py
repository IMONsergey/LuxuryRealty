#!/usr/bin/env python3
"""Read-only release smoke for one Luxury Realty Vercel preview.

After build and preview deployment, from the same checkout:
  python3 scripts/content-preview-smoke.py --url https://luxury-realty-imon-PREVIEW.vercel.app

GET/HEAD only; no browser, JavaScript, cookies, forms, credentials or POST.
At most three concurrent requests, a 15-second timeout, and one retry for a
transient failure. HTML is bounded at 4 MiB; media GETs read at most 65 bytes.
The report is artifacts/content-migration/preview-smoke.json. Exit 1 means a
concrete check failed, exit 2 means required local inputs prevented completion.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
from http.client import HTTPException
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / '.vercel/output/static'
HOST = re.compile(r'luxury-realty-imon(?:-[a-z0-9]+)*\.vercel\.app')
CDNS = ('cdn.prod.website-files.com', 'assets.website-files.com', 'uploads-ssl.webflow.com')
RECEIPT_HEADERS = {'content-type', 'content-length', 'content-range', 'accept-ranges', 'location',
                   'etag', 'cache-control', 'x-vercel-id', 'x-vercel-cache', 'content-encoding', 'server', 'date'}


def preview_url(value):
    p = urlsplit(value)
    if (p.scheme != 'https' or not HOST.fullmatch(p.hostname or '') or p.port is not None
            or p.username or p.password or p.path not in ('', '/') or p.query or p.fragment):
        raise argparse.ArgumentTypeError('Use one HTTPS luxury-realty-imon[-preview].vercel.app origin without a path or credentials')
    return 'https://' + p.hostname


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, target):
        return None


def fetch(base, path, method='GET', limit=4 * 1024 * 1024, byte_range=False):
    url = urljoin(base + '/', path)
    p = urlsplit(url)
    if method not in ('GET', 'HEAD') or p.scheme != 'https' or p.netloc != urlsplit(base).netloc or p.username or p.password:
        raise ValueError('Refused request outside the explicit preview origin or allowed read-only methods')
    headers = {'User-Agent': 'LuxuryRealty-read-only-preview-smoke/1.0', 'Accept-Encoding': 'identity'}
    if byte_range:
        headers['Range'] = 'bytes=0-63'
    for attempt in range(2):
        result = {'url': url, 'method': method}
        try:
            try:
                response = build_opener(NoRedirect()).open(Request(url, method=method, headers=headers), timeout=15)
            except HTTPError as response_error:
                response = response_error
            with response:
                body = b'' if method == 'HEAD' else response.read(limit + 1)
                result.update(status=response.code, headers={k.lower(): v for k, v in response.headers.items() if k.lower() in RECEIPT_HEADERS},
                              bytesRead=len(body), truncated=len(body) > limit, attempts=attempt + 1)
            if result['status'] in (429, 500, 502, 503, 504) and attempt == 0:
                time.sleep(0.35)
                continue
            return result, body[:limit]
        except (URLError, TimeoutError, OSError, HTTPException) as exc:
            result.update(status=None, error=f'{type(exc).__name__}: {exc}', attempts=attempt + 1)
            if attempt == 0:
                time.sleep(0.35)
    return result, b''


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.head, self.capture, self.parts = False, None, []
        self.h1, self.titles, self.media, self.videos, self.posters = [], [], set(), set(), set()
        self.feed(text)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'head':
            self.head = True
        if tag == 'h1' or (tag == 'title' and self.head):
            self.capture, self.parts = tag, []
        if tag in ('img', 'source', 'video', 'audio'):
            for key in ('src', 'data-src', 'poster'):
                if attrs.get(key):
                    self.media.add(attrs[key])
                    if tag == 'video' and key != 'poster':
                        self.videos.add(attrs[key])
                    if key == 'poster':
                        self.posters.add(attrs[key])
            # The build's generated srcsets are local URL/width pairs, never data URIs.
            self.media.update(item.strip().split()[0] for item in attrs.get('srcset', '').split(',') if item.strip())

    def handle_endtag(self, tag):
        if tag == 'head':
            self.head = False
        if tag == self.capture:
            (self.h1 if tag == 'h1' else self.titles).append(' '.join(' '.join(self.parts).split()))
            self.capture, self.parts = None, []

    def handle_data(self, value):
        if self.capture:
            self.parts.append(value)


def local_media(page, origins, route):
    values = set()
    for value in page.media:
        p = urlsplit(urljoin('https://audit.invalid' + route, value))
        if p.netloc in origins or p.netloc == 'audit.invalid':
            values.add(p.path)
    return values


def target_key(value):
    p = urlsplit(value)
    return p.path or '/', sorted(parse_qsl(p.query, keep_blank_values=True))


def alias_cases(config):
    text = (ROOT / 'astro.config.mjs').read_text()
    block = text.split('redirects:', 1)[1].split('\n  },', 1)[0]
    authored = re.findall(r"['\"](/[^'\"]+)['\"]\s*:\s*['\"]([^'\"]+)['\"]", block)[:20]
    if len(authored) != 20:
        raise ValueError('Expected at least 20 authored source aliases in astro.config.mjs')
    cases = []
    for source, target in authored:
        matches = []
        for rule in config.get('routes', []):
            headers = {k.lower(): v for k, v in rule.get('headers', {}).items()}
            if not 300 <= rule.get('status', 200) < 400 or 'location' not in headers or not rule.get('src'):
                continue
            regex = re.compile(re.sub(r'\(\?<([A-Za-z_]\w*)>', r'(?P<\1>', rule['src']))
            for candidate in (source, source.rstrip('/') + '/'):
                match = regex.fullmatch(candidate)
                if match:
                    destination = re.sub(r'\$(\d+)', lambda m: match.group(int(m.group(1))) or '', headers['location'])
                    if target_key(destination) == target_key(target):
                        matches.append({'src': rule['src'], 'status': rule['status'], 'location': destination})
        if not matches:
            raise ValueError('Compiled Vercel redirect missing or wrong (including query): ' + source + ' -> ' + target)
        cases.append({'source': source, 'expected': target, 'config': matches[0]})
    return cases


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--url', required=True, type=preview_url)
    args = parser.parse_args()
    base = args.url
    report = {'baseUrl': base, 'startedAt': datetime.now(timezone.utc).isoformat(), 'complete': False,
              'limits': {'workers': 3, 'timeoutSeconds': 15, 'retries': 1, 'methods': ['GET', 'HEAD'],
                         'maxHtmlBytes': 4 * 1024 * 1024, 'maxMediaBytesReadPerGet': 65},
              'scope': '130 built pages, 20 configured source aliases at their authored paths, sampled media and an unknown-path 404; no JS, forms or external requests',
              'pages': [], 'media': [], 'redirects': [], 'errors': []}
    code = 1
    try:
        sitemap_file = STATIC / 'sitemap.xml'
        sitemap = sitemap_file.read_bytes()
        locations = [node.text.strip() for node in ET.fromstring(sitemap).iter() if node.tag.endswith('}loc') and node.text]
        routes = [urlsplit(value).path for value in locations]
        if len(routes) != 130 or len(set(routes)) != 130 or '/' not in routes:
            raise ValueError('Local compiled sitemap must contain all 130 unique canonical routes')
        origins = {urlsplit(value).netloc for value in locations} | {urlsplit(base).netloc}
        expected = {}
        for route in routes:
            path = (STATIC / route.lstrip('/') / 'index.html').resolve()
            if not path.is_relative_to(STATIC.resolve()):
                raise ValueError('Sitemap route escapes the build root')
            page = Page(path.read_text(encoding='utf-8'))
            if len(page.h1) != 1 or len(page.titles) != 1:
                raise ValueError('Local baseline lacks one H1/title: ' + route)
            expected[route] = page
        config_file = ROOT / '.vercel/output/config.json'
        cases = alias_cases(json.loads(config_file.read_text()))
        manifest_file = ROOT / 'src/data/imported-media.json'
        manifest = json.loads(manifest_file.read_text())
        hero_source = json.loads((ROOT / 'src/data/source/hero-media.json').read_text())
        hero, poster = (manifest[hero_source[key]]['src'] for key in ('mp4', 'poster'))
        report['inputs'] = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                            for path in (sitemap_file, config_file, manifest_file)}

        def check_page(route):
            result, body = fetch(base, route)
            item = {'route': route, **result, 'errors': []}
            if result['status'] != 200:
                item['errors'].append('Expected HTTP 200 for canonical page')
            elif result.get('truncated') or 'text/html' not in result['headers'].get('content-type', ''):
                item['errors'].append('HTML response has wrong content type or exceeds bounded read')
            else:
                page = Page(body.decode('utf-8', errors='replace'))
                actual_media = local_media(page, {urlsplit(base).netloc}, route)
                item.update(h1=page.h1, title=page.titles, localMediaCount=len(actual_media))
                if page.h1 != expected[route].h1 or page.titles != expected[route].titles:
                    item['errors'].append('H1/title differ from this local build')
                    item['expectedH1'], item['expectedTitle'] = expected[route].h1, expected[route].titles
                missing = local_media(expected[route], origins, route) - actual_media
                if missing:
                    item['errors'].append('Built local media references are absent from the deployed HTML')
                    item['missingMedia'] = sorted(missing)
                if any(urlsplit(url).hostname in CDNS for url in page.media):
                    item['errors'].append('Active source-CDN media hotlink remains')
                external = [url for url in page.media if urlsplit(urljoin(base + route, url)).scheme in ('http', 'https')
                            and urlsplit(urljoin(base + route, url)).netloc != urlsplit(base).netloc]
                if external:
                    item['errors'].append('Active media leaves the specified preview origin')
                    item['externalMedia'] = sorted(external)
                if route == '/' and (hero not in page.videos or poster not in page.posters):
                    item['errors'].append('Migrated hero video/poster is not wired on the deployed home page')
            return item

        with ThreadPoolExecutor(max_workers=3) as pool:
            report['pages'] = list(pool.map(check_page, routes))
        active = sorted(set().union(*(local_media(page, origins, route) for route, page in expected.items())))
        images = [path for path in active if re.search(r'\.(?:webp|avif|png|jpe?g|svg)$', path, re.I)]
        if not images:
            raise ValueError('Build contains no local media to sample')
        selected = {hero, poster, *(images[round(i * (len(images) - 1) / 11)] for i in range(12))}

        def check_media(path):
            head, _ = fetch(base, path, method='HEAD', limit=0)
            part, body = fetch(base, path, limit=64, byte_range=True)
            item = {'path': path, 'head': head, 'range': part, 'errors': []}
            local = (STATIC / path.lstrip('/')).resolve()
            if not local.is_relative_to(STATIC.resolve()) or not local.is_file():
                item['errors'].append('Sample is not a file in the current local build')
                return item
            size = local.stat().st_size
            with local.open('rb') as stream:
                prefix = stream.read(64)
            item.update(expectedBytes=size, prefixSha256=hashlib.sha256(prefix).hexdigest())
            if head['status'] != 200:
                item['errors'].append('HEAD expected HTTP 200')
            elif head.get('headers', {}).get('content-length') != str(size):
                item['errors'].append('HEAD Content-Length differs from built file')
            expected_type = 'video/mp4' if path == hero else 'image/'
            if not head.get('headers', {}).get('content-type', '').startswith(expected_type):
                item['errors'].append('HEAD media content type is wrong')
            if part['status'] not in (200, 206) or body != prefix:
                item['errors'].append('Bounded media GET differs from built file prefix or has wrong status')
            if part['status'] == 206:
                wanted = f'bytes 0-{len(prefix)-1}/{size}'
                if part.get('headers', {}).get('content-range') != wanted:
                    item['errors'].append('Partial-response Content-Range is wrong')
            elif path == hero:
                item['errors'].append('Hero video server did not honour the byte-range request')
            return item

        with ThreadPoolExecutor(max_workers=3) as pool:
            report['media'] = list(pool.map(check_media, sorted(selected)))

        def check_alias(case):
            item = {**case, 'hops': [], 'errors': []}
            target, seen = case['source'], set()
            for _ in range(8):
                absolute = urljoin(base + '/', target)
                if absolute in seen:
                    item['errors'].append('Redirect loop')
                    break
                seen.add(absolute)
                result, _ = fetch(base, absolute, limit=4096)
                item['hops'].append(result)
                if result['status'] in (301, 302, 303, 307, 308):
                    location = result.get('headers', {}).get('location')
                    if not location:
                        item['errors'].append('Redirect has no Location')
                        break
                    target = urljoin(absolute, location)
                    p = urlsplit(target)
                    if p.scheme != 'https' or p.netloc != urlsplit(base).netloc:
                        item['errors'].append('Redirect leaves the specified preview origin; not followed')
                        break
                    continue
                if result['status'] != 200 or len(item['hops']) < 2:
                    item['errors'].append('Alias did not redirect to a successful page')
                if target_key(absolute) != target_key(case['expected']):
                    item['errors'].append('Final path/query differs from the configured source alias target')
                item['finalUrl'] = absolute
                break
            else:
                item['errors'].append('Redirect chain exceeded eight requests')
            return item

        with ThreadPoolExecutor(max_workers=3) as pool:
            report['redirects'] = list(pool.map(check_alias, cases))
        unknown = '/__migration-smoke-not-a-page-20261103__/'
        result, _ = fetch(base, unknown, limit=64 * 1024)
        report['unknownPath'] = result
        if result['status'] != 404:
            report['errors'].append({'check': 'unknown_path', 'message': 'Unknown path must return HTTP 404', 'status': result['status']})
        for group in ('pages', 'media', 'redirects'):
            for item in report[group]:
                for error in item['errors']:
                    report['errors'].append({'check': group, 'path': item.get('route') or item.get('path') or item.get('source'), 'message': error})
        report['complete'] = True
        code = 1 if report['errors'] else 0
    except Exception as exc:
        report['errors'].append({'check': 'smoke_incomplete', 'message': f'{type(exc).__name__}: {exc}'})
        code = 2
    report.update(passed=code == 0, finishedAt=datetime.now(timezone.utc).isoformat(),
                  summary={'pages': len(report['pages']), 'mediaSamples': len(report['media']),
                           'sourceAliases': len(report['redirects']), 'errors': len(report['errors'])})
    destination = ROOT / 'artifacts/content-migration/preview-smoke.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    temporary.replace(destination)
    print(json.dumps({'passed': report['passed'], 'complete': report['complete'], **report['summary'], 'report': str(destination)}))
    return code


if __name__ == '__main__':
    sys.exit(main())
