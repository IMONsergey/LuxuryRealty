import os
import collections
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs

ROOT = Path(os.environ.get('LUXURY_SOURCE_DIR', Path(__file__).resolve().parent)).resolve()
sys.path.insert(0, str(ROOT / '_deps'))
from bs4 import BeautifulSoup

BASE = 'https://www.luxuryresidences.com'

def text(node):
    return re.sub(r'\s+', ' ', node.get_text(' ', strip=True).replace('\u200d', '')).strip() if node else ''

def pick(node, selector):
    return text(node.select_one(selector)) if node else ''

def number(value):
    match = re.search(r'\d[\d,]*(?:\.\d+)?', value or '')
    if not match:
        return None
    result = float(match.group().replace(',', ''))
    return int(result) if result.is_integer() else result

def image(node):
    if not node:
        return None
    if node.get('src'):
        return node['src']
    match = re.search(r'url\([\"\']?(.*?)[\"\']?\)', node.get('style', ''))
    return match.group(1) if match else None

def uniq(values):
    return list(dict.fromkeys(x for x in values if x))

def safe_html(node):
    if not node:
        return ''
    fragment = BeautifulSoup(str(node), 'html.parser')
    allowed = {'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'h2', 'h3', 'h4', 'blockquote', 'br', 'a'}
    for tag in fragment.find_all(True):
        if tag.name in {'script', 'style', 'iframe', 'form', 'input', 'button', 'object', 'embed', 'svg'}:
            tag.decompose()
        elif tag.name not in allowed:
            tag.unwrap()
        else:
            attrs = {}
            if tag.name == 'a':
                href = tag.get('href', '')
                if href.startswith(('https://', 'http://', '/', 'mailto:', 'tel:')):
                    attrs['href'] = href
            tag.attrs = attrs
    for p in fragment.find_all('p'):
        if not text(p):
            p.decompose()
    return str(fragment).replace('\u200d', '').strip()

raws = sorted((ROOT / 'raw').glob('*.html'))
soups = {}
all_links = set()
cards = collections.defaultdict(list)
for path in raws:
    # Every listing page repeats 100 related cards; catalogue+home suffice for the card index.
    if path.name.startswith(('properties__', 'projects__', 'insights__')):
        continue
    soup = BeautifulSoup(path.read_text(), 'html.parser')
    soups[path.name] = soup
    for a in soup.select('a[href]'):
        href = a.get('href', '').split('?')[0].split('#')[0]
        if href.startswith(('/properties/', '/projects/', '/insights/')):
            all_links.add(BASE + href)
    for card in soup.select('.search_properties-item_wrapper,.private_property_item'):
        a = card.select_one('a[href*="/properties/"]')
        if not a:
            continue
        url = urljoin(BASE, a['href']).split('?')[0]
        badges = uniq(text(b) for b in card.select('.private_property-tag:not(.w-condition-invisible) .private_propery-tag_text'))
        cards[url].append({
            'sourcePage': BASE + ('/' if path.name == 'home.html' else '/' + path.stem),
            'title': pick(card, '[fs-cmsfilter-field="name"],.private_properties-heading'),
            'category': pick(card, '[fs-cmsfilter-field="category"]'),
            'location': pick(card, '[fs-cmsfilter-field="location"],.private_propery-location_text'),
            'address': pick(card, '[fs-cmsfilter-field="location-txt"],.private_propery-location_text'),
            'priceAEDRaw': pick(card, '.details_price-aed,.private_property-price_aed'),
            'priceUSDRaw': pick(card, '.details_price-usd,.private_property-price_usd'),
            'badges': badges,
            'image': image(card.select_one('.search_properties-image,.private_properties_image')),
        })

listings = []
issues = []
for path in raws:
    if not path.name.startswith('properties__'):
        continue
    html = path.read_text()
    soup = BeautifulSoup(html, 'html.parser')
    main = soup.select_one('.property_details_component')
    if not main:
        issues.append({'file': path.name, 'issue': 'No property_details_component'})
        continue
    source_url = BASE + '/' + path.stem.replace('__', '/')
    canonical = soup.select_one('link[rel="canonical"]')
    source_url = canonical.get('href', source_url) if canonical else source_url
    slug = source_url.rstrip('/').rsplit('/', 1)[-1]
    values = {}
    for title in main.select('.meta_details-box_title'):
        value = title.find_next_sibling(class_='meta_details-box_description')
        if value is None:
            value = title.parent.select_one('.meta_details-box_description')
        values[text(title).rstrip(':').lower()] = text(value)
    price_raw = pick(main, '.meta_details-heading')
    size_raw = values.get('size', '')
    sqft_match = re.search(r'([\d,.]+)\s*sq\.?\s*ft', size_raw, re.I)
    sqm_match = re.search(r'([\d,.]+)\s*sq\.?\s*m', size_raw, re.I)
    sqft = number(sqft_match.group(1)) if sqft_match else None
    sqm = number(sqm_match.group(1)) if sqm_match else None
    category = values.get('status', '')
    purpose = 'rent' if category.lower() == 'rent' else ('buy' if category in {'Private Residences', 'New Developments'} else 'unknown')
    price_period = 'year' if re.search(r'(?:per|a)\s*year|/\s*year', price_raw, re.I) else None
    intro = image(soup.select_one('.property_intro_image'))
    gallery = [intro] if intro else []
    videos = []
    lightboxes = []
    for script in main.select('script.w-json'):
        try:
            payload = json.loads(script.string or script.get_text())
            lightboxes.append(payload)
            for item in payload.get('items', []):
                if item.get('type') == 'image' and item.get('url'):
                    gallery.append(item['url'])
                elif item.get('url'):
                    videos.append({'url': item['url'], 'type': item.get('type', 'unknown'), 'thumbnailUrl': item.get('thumbnailUrl')})
        except (ValueError, TypeError):
            issues.append({'url': source_url, 'issue': 'Invalid lightbox JSON'})
    for img in main.select('.gallery_left-image,.gallery_right-image'):
        gallery.append(image(img))
    description_node = main.select_one('.property_details-paragraph')
    description_blocks = []
    if description_node:
        for el in description_node.find_all(['p', 'li', 'h2', 'h3', 'h4']):
            value = text(el)
            if value:
                description_blocks.append({'type': el.name, 'text': value})
    agent_node = soup.select_one('.contact_popup_component')
    agent_name = pick(main, '.author_box-detail_name')
    agent = {'name': agent_name, 'position': pick(main, '.author_box-detail_position'), 'image': image(main.select_one('.author_box-image'))}
    if agent_node:
        for group in agent_node.select('.contact_popup-meta_details'):
            key = pick(group, '.meta_details-label').lower()
            if key in {'phone', 'e-mail', 'email'}:
                value = pick(group, '.meta_details-info')
                field = 'email' if key in {'e-mail', 'email'} else 'phone'
                agent[field] = value
                link = group.select_one('a.meta_details-info')
                agent[field + 'SourceHref'] = link.get('href') if link else None
    map_node = main.select_one('iframe.g_map_component')
    coordinates = None
    if map_node:
        query = parse_qs(urlparse(map_node.get('src', '')).query).get('q', [''])[0]
        match = re.fullmatch(r'\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*', query)
        if match:
            coordinates = {'latitude': float(match.group(1)), 'longitude': float(match.group(2))}
    card_refs = cards.get(source_url, [])
    # Related-card metadata adds availability for archived pages excluded from the main catalogue.
    related_badges = []
    for a in soup.select('.similar_properties_component a[href*="/properties/"]'):
        href = urljoin(BASE, a['href']).split('?')[0]
        all_links.add(href)
        if href == source_url:
            card = a.find_parent(class_='w-dyn-item')
            if card:
                related_badges.extend(text(b) for b in card.select('.private_property-tag:not(.w-condition-invisible) .private_propery-tag_text'))
    badges = uniq([b for card in card_refs for b in card['badges']] + related_badges)
    availability = 'Sold' if 'Sold' in badges else ('Rented' if 'Rented' in badges else 'Listed')
    data_issues = []
    title_beds = re.search(r'\b(\d)\s*(?:BR\b|[ -]?bed(?:room)?s?\b)', pick(main, '.property_details-heading'), re.I)
    sidebar_beds = number(values.get('bedrooms'))
    if title_beds and sidebar_beds and int(title_beds.group(1)) != sidebar_beds:
        data_issues.append({'field': 'beds', 'reason': 'Source title and sidebar disagree about bedroom count. Keep both as evidence; do not choose a corrected count without confirmation.', 'sidebar': sidebar_beds, 'title': int(title_beds.group(1))})
    if sqft and sqm and abs(sqm - sqft * 0.09290304) > max(3, sqft * 0.09290304 * .03):
        data_issues.append({'field': 'areaSqm', 'reason': 'Source sqft and sqm values disagree by more than 3%; both preserved, no conversion applied.', 'sqft': sqft, 'sqm': sqm})
    for card in card_refs:
        source_price = number(card['priceAEDRaw'])
        if source_price and number(price_raw) and source_price != number(price_raw):
            data_issues.append({'field': 'priceAED', 'reason': 'Source catalogue price disagrees with detail page.', 'catalogue': card['priceAEDRaw'], 'detail': price_raw})
    if agent.get('email') and not str(agent.get('emailSourceHref', '')).startswith('mailto:'):
        data_issues.append({'field': 'agent.emailHref', 'reason': 'Source email href is not mailto; use visible email text only.'})
    if agent.get('phone') and agent['phone'].startswith('+971') and len(re.sub(r'\D', '', agent['phone'])) not in {11, 12}:
        data_issues.append({'field': 'agent.phone', 'reason': 'Source UAE phone has unexpected number of digits; confirm before using call link.', 'value': agent['phone']})
    if category == 'New Developments':
        data_issues.append({'field': 'unitSpecifications', 'reason': 'Source is a whole-development enquiry listing, not an individual unit. Do not present source bedroom/area/price fields as available unit inventory.'})
    record = {
        'id': slug, 'slug': slug, 'sourceUrl': source_url,
        'sourceHash': hashlib.sha256(path.read_bytes()).hexdigest(),
        'title': pick(main, '.property_details-heading'), 'building': values.get('building name', ''),
        'location': values.get('location', ''),
        'address': next((c['address'] for c in card_refs if c['address']), ''),
        'category': category, 'purpose': purpose, 'status': availability,
        'saleStatus': availability if availability != 'Listed' else None,
        'isDevelopment': category == 'New Developments',
        'propertyType': values.get('property type', ''),
        'beds': number(values.get('bedrooms')), 'bedroomsRaw': values.get('bedrooms', ''),
        'baths': None, 'areaSqft': sqft, 'areaSqm': sqm, 'sizeRaw': size_raw,
        'priceAED': number(price_raw), 'priceRaw': price_raw, 'pricePeriod': price_period,
        'sourceUSDRaw': uniq(c['priceUSDRaw'] for c in card_refs),
        'description': text(description_node), 'descriptionHtml': safe_html(description_node),
        'descriptionBlocks': description_blocks,
        'features': uniq(text(el) for el in main.select('.property_detail-features_box_heading')),
        'image': intro, 'gallery': uniq(gallery), 'videos': videos,
        'agent': agent, 'coordinates': coordinates,
        'metadata': { 'title': text(soup.find('title')), 'description': (soup.select_one('meta[name="description"]') or {}).get('content', '') },
        'sourceFields': values, 'sourceCatalogueEntries': card_refs,
        'sourceBadges': badges, 'dataIssues': data_issues,
    }
    listings.append(record)
    for issue in data_issues:
        issues.append({'url': source_url, **issue})

listings.sort(key=lambda x: x['slug'])
(ROOT / 'listings.json').write_text(json.dumps(listings, indent=2, ensure_ascii=False))
(ROOT / 'listing-data-issues.json').write_text(json.dumps(issues, indent=2, ensure_ascii=False))
(ROOT / 'catalogue-card-index.json').write_text(json.dumps(cards, indent=2, ensure_ascii=False))
(ROOT / 'discovered-urls.json').write_text(json.dumps(sorted(all_links), indent=2))
print(json.dumps({'listings': len(listings), 'purposes': dict(collections.Counter(p['purpose'] for p in listings)), 'categories': dict(collections.Counter(p['category'] for p in listings)), 'availability': dict(collections.Counter(p['status'] for p in listings)), 'galleryImages': sum(len(p['gallery']) for p in listings), 'dataIssues': len(issues), 'discoveredUrls': len(all_links)}, indent=2))
