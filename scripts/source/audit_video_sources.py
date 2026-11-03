"""Read-only source-video audit. Does not download or execute provider embed HTML."""
import concurrent.futures
import datetime
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ.get('LUXURY_SOURCE_DIR', ROOT / 'src/data/source'))
OUTPUT = ROOT / 'docs/content-migration/video-source-audit.json'
listings = json.loads((SOURCE / 'listings.json').read_text())
projects = json.loads((SOURCE / 'projects.json').read_text())

def request(url, head=False):
    try:
        req = urllib.request.Request(url, method='HEAD' if head else 'GET', headers={'User-Agent': 'Mozilla/5.0 (compatible; ContentMigrationAudit/1.0)'})
        with urllib.request.urlopen(req, timeout=18) as response:
            result = {'requestUrl': url, 'status': response.status, 'resolvedUrl': response.url,
                      'contentType': response.headers.get('Content-Type'), 'contentLength': response.headers.get('Content-Length')}
            if not head:
                body = response.read(128 * 1024)
                result['metadata'] = json.loads(body)
                # Provider embed code is untrusted and unnecessary to this audit.
                result['metadata'].pop('html', None)
            return result
    except Exception as exc:
        return {'requestUrl': url, 'status': exc.code if isinstance(exc, urllib.error.HTTPError) else 'error', 'error': str(exc)}

def oembed_url(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.hostname == 'vimeo.com':
        base = 'https://vimeo.com/api/oembed.json?url='
        clean = 'https://vimeo.com/' + parsed.path.strip('/')
    else:
        base = 'https://www.youtube.com/oembed?format=json&url='
        video_id = parsed.path.strip('/') if parsed.hostname == 'youtu.be' else parsed.path.rsplit('/', 1)[-1]
        clean = 'https://www.youtube.com/watch?v=' + video_id
    return base + urllib.parse.quote(clean, safe='')

project_videos = []
for project in projects:
    if not project.get('publicationEligible'):
        continue
    for video in project.get('videos', []):
        entry = {'project': project['slug'], 'sourcePage': project['sourceUrl'], 'url': video['url'], 'kind': video['kind']}
        entry['filename'] = urllib.parse.unquote(urllib.parse.urlparse(video['url']).path.rsplit('/', 1)[-1])
        if project['slug'] == 'ava' and re.search(r'\bORLA\b', entry['filename'], re.I):
            entry['associationIssue'] = 'The AVA source page points to a file explicitly named ORLA. Identity requires visual verification; do not present as confirmed AVA footage.'
        project_videos.append(entry)

property_videos = {}
for listing in listings:
    for video in listing.get('videos', []):
        item = property_videos.setdefault(video['url'], {'url': video['url'], 'type': video.get('type'), 'listings': []})
        item['listings'].append({'id': listing['id'], 'title': listing['title'], 'purpose': listing['purpose'], 'sourceUrl': listing['sourceUrl']})

requests = {}
for entry in project_videos:
    url = entry['url'] if entry['kind'] == 'video' else oembed_url(entry['url'])
    requests[url] = entry['kind'] == 'video'
# Check every distinct source video once (50 URLs in this dated snapshot).
# A denied provider is recorded; no alternate credentials or endpoints are tried.
for url in list(property_videos):
    requests[oembed_url(url)] = False

checks = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    tasks = {pool.submit(request, url, head): url for url, head in requests.items()}
    for task in concurrent.futures.as_completed(tasks):
        url = tasks[task]
        checks[url] = task.result()
        print(json.dumps({'completed': len(checks), 'total': len(requests), 'status': checks[url]['status']}), flush=True)

for entry in project_videos:
    key = entry['url'] if entry['kind'] == 'video' else oembed_url(entry['url'])
    entry['httpCheck'] = checks[key]
for entry in property_videos.values():
    key = oembed_url(entry['url'])
    entry['httpCheck'] = checks.get(key, {'status': 'not-requested', 'reason': 'Source mapping and URL shape verified; provider metadata sampling is bounded.'})

result = {
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Source assignment, URL uniqueness, all source property-video provider metadata and direct-project video HEAD checks. Does not prove playback in every client or validate every frame.',
    'realProjectPages': 7,
    'distinctProjectDirectVideoUrls': len({entry['url'] for entry in project_videos if entry['kind'] == 'video'}),
    'propertyVideoEntries': sum(len(listing['videos']) for listing in listings),
    'uniquePropertyVideoUrls': len(property_videos),
    'projectVideos': project_videos,
    'propertyVideos': list(property_videos.values()),
}
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False))
print(json.dumps({'output': str(OUTPUT), 'httpChecks': len(checks), 'projectDirectUrls': result['distinctProjectDirectVideoUrls'], 'uniquePropertyVideos': len(property_videos)}), flush=True)
