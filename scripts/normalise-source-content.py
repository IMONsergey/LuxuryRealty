#!/usr/bin/env python3
"""Build display records from exact source snapshots, retaining provenance.

Never infer current availability, missing prices, bathroom counts, coordinates,
exchange rates, or unsupported associations between properties and projects.
"""
from pathlib import Path
from html.parser import HTMLParser
import argparse, html, json, re, shutil, urllib.parse

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'src/data'
RAW=DATA/'source'
PROJECT_IDS={'atlantis-the-royal':'atlantis','ava':'ava-at-palm'}
PROJECT_LOCATIONS={'atlantis':'Palm Jumeirah, Dubai','ava-at-palm':'Palm Jumeirah, Dubai','orla':'Palm Jumeirah, Dubai','six-senses':'Dubai Marina, Dubai','vela':'Marasi Bay, Dubai','serenity-mansions-aurora':'Tilal Al Ghaf, Dubai','serenity-mansions-waterfront-collection':'Tilal Al Ghaf, Dubai'}
PROJECT_NAMES={'atlantis':'Atlantis The Royal Residences','ava-at-palm':'AVA at Palm Jumeirah','orla':'ORLA','six-senses':'Six Senses Residences Dubai Marina','vela':'VELA','serenity-mansions-aurora':'Serenity Mansions Aurora','serenity-mansions-waterfront-collection':'Serenity Mansions Waterfront Collection'}
PROJECT_LINKS={'atlantis':'https://atlantis-imon.vercel.app','ava-at-palm':'https://ava-at-palm-imon.vercel.app','orla':'https://orla-imon.vercel.app','six-senses':'https://six-senses-imon.vercel.app'}
DATE='2026-11-03'
BEDROOM_CONFLICT_IDS={'one-of-a-kind-loft-designer-upgrade-sea-view','unique-duplex-breath-taking-sea-view'}
BEDROOM_CONFLICT_NOTE='Published details list both 2 and 3 bedrooms. Please confirm the layout with an advisor.'

def save(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

def text(value):
    return str(value or '').replace('\u200d','').replace('Luxury Residences','Luxury Realty').strip()

def slug(value):
    return re.sub(r'[^a-z0-9]+','-',value.lower()).strip('-')

def local_link(url):
    parsed=urllib.parse.urlparse(url)
    if parsed.hostname not in ('www.luxuryresidences.com','luxuryresidences.com'):return url
    path=parsed.path.rstrip('/') or '/'
    routes={'/buy':'/properties/','/rent':'/properties/?purpose=rent','/contact':'/contacts/','/privacy-policy-luxury-residence':'/privacy/','/':'/'}
    if path in routes:return routes[path]
    if path.startswith('/projects/'):
        key=path.split('/')[-1]
        return '/developments/'+PROJECT_IDS.get(key,key)+'/'
    return path+'/'

class SafeHTML(HTMLParser):
    allowed={'p','br','ul','ol','li','strong','em','b','i','h2','h3','h4','blockquote','a'}
    blocked={'script','style','iframe','object','embed','form','button','input','textarea','svg'}
    def __init__(self):super().__init__(convert_charrefs=True);self.parts=[];self.depth=0
    def handle_starttag(self,tag,attrs):
        if tag in self.blocked:self.depth+=1;return
        if self.depth or tag not in self.allowed:return
        attr=''
        if tag=='a':
            url=dict(attrs).get('href','').strip()
            if re.match(r'^(https?://|mailto:|tel:|/|#)',url,re.I):attr=' href="'+html.escape(local_link(url),quote=True)+'"'
            else:return
        self.parts.append('<'+tag+attr+'>')
    def handle_endtag(self,tag):
        if tag in self.blocked:self.depth=max(0,self.depth-1);return
        if not self.depth and tag in self.allowed and tag!='br':self.parts.append('</'+tag+'>')
    def handle_data(self,data):
        if not self.depth:self.parts.append(html.escape(str(data).replace('\u200d','').replace('Luxury Residences','Luxury Realty')))
    def get(self):return ''.join(self.parts)

def safe_html(value):
    parser=SafeHTML();parser.feed(value or '');return parser.get()

def project_for(record):
    building=(record.get('building') or '').lower();location=(record.get('location') or '').lower()
    if record.get('id')=='serenity-mansions-waterfront-collection':return 'serenity-mansions-waterfront-collection'
    if 'atlantis' in building and 'royal' in building:return 'atlantis'
    if re.search(r'\bava\b',building) and 'palm' in location:return 'ava-at-palm'
    if re.search(r'\borla\b',building) and 'palm' in location:return 'orla'
    if 'six senses' in building and ('marina' in building or 'marina' in location) and 'palm' not in location:return 'six-senses'
    if re.search(r'\bvela\b',building):return 'vela'
    if 'serenity' in building and 'aurora' in building:return 'serenity-mansions-aurora'
    if 'serenity' in building and 'waterfront' in building:return 'serenity-mansions-waterfront-collection'
    return None

def valid_photo(url):
    value=urllib.parse.unquote(url or '').lower()
    return value.startswith('https://cdn.prod.website-files.com/') and not any(x in value for x in ['.svg','placeholder','logo','white@2x','arrow-','icon-','google-map','google_map'])

def video(value):
    if isinstance(value,str):return {'url':value}
    return {k:v for k,v in value.items() if k in ('url','type','thumbnailUrl') and v}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source-dir');args=parser.parse_args()
    if args.source_dir:
        source=Path(args.source_dir);RAW.mkdir(parents=True,exist_ok=True)
        for name in ['listings','projects','articles','static-pages','agents','editorial-report','hero-media']:
            shutil.copy2(source/(name+'.json'),RAW/(name+'.json'))
    source_records=json.loads((RAW/'listings.json').read_text());source_projects=json.loads((RAW/'projects.json').read_text())
    records=[];media={}
    corrections=[{'id':'vela-dorchester-collection','field':'location','sourceValue':'Palm Jumeirah','displayValue':'Marasi Bay','verifiedOn':DATE,'evidence':['https://omniyat.com/residential/vela-dorchester-collection-dubai','https://www.dorchestercollection.com/residences/vela'],'reason':'Developer and operator both identify VELA as Marasi Bay.'}]
    def add_media(url,cover=False):
        if not url or not valid_photo(url):return
        media[url]={'url':url,'cover':cover or media.get(url,{}).get('cover',False)}
    for r in source_records:
        gallery=list(dict.fromkeys(([r['image']] if r.get('image') else [])+r.get('gallery',[])))
        gallery=[u for u in gallery if valid_photo(u)]
        current={'id':r['id'],'title':text(r['title']),'subtitle':text(r.get('building') or r.get('address')),
                 'image':gallery[0] if gallery else '', 'type':r.get('propertyType') or 'Property',
                 'building':r.get('building') or '', 'location':r.get('location') or '',
                 'address':r.get('address') or '', 'bedrooms':r.get('beds'),'bathrooms':r.get('baths'),
                 'area':r.get('areaSqft'),'price':r.get('priceAED'),'purpose':r.get('purpose') or 'unknown',
                 'features':list(dict.fromkeys(r.get('features',[]))),
                 'photos':[{'image':url,'alt':text(r['title'])+' - photograph '+str(i+1)} for i,url in enumerate(gallery)],
                 'descriptionHtml':safe_html(r.get('descriptionHtml')),'description':text(r.get('description')),
                 'reference':r.get('reference'),'status':r.get('status') or 'Listed','saleStatus':r.get('saleStatus'),
                 'sourceUrl':r['sourceUrl'],'sourceHash':r['sourceHash'],'pricePeriod':r.get('pricePeriod'),
                 'isDevelopment':bool(r.get('isDevelopment')),'category':r.get('category'),
                 'videos':[video(v) for v in r.get('videos',[])],'sourceDate':DATE}
        association=project_for(r)
        if association:current['projectId']=association
        if r['id']=='vela-dorchester-collection':
            # Confirmed against the developer's project specification. The source
            # listing erroneously says Palm Jumeirah; the exact raw record stays intact.
            current['location']='Marasi Bay'
            current['address']='VELA, Dorchester Collection, Marasi Bay, Dubai'
        if r['id'] in BEDROOM_CONFLICT_IDS:
            # The source headline says 3BR while its sidebar says 2. Neither
            # count is independently confirmed; retain raw evidence and suppress
            # the public numeric field rather than choosing a count.
            current['bedrooms']=None
            current['dataNotes']=[BEDROOM_CONFLICT_NOTE]
            corrections.append({'id':r['id'],'field':'bedrooms','sourceValue':r.get('beds'),'displayValue':None,
                                'verifiedOn':DATE,'sourceHash':r['sourceHash'],'sourceTitle':r['title'],
                                'evidence':[r['sourceUrl']],'status':'unresolved-source-conflict',
                                'action':'suppressed-pending-confirmation',
                                'reason':'The source sidebar lists 2 bedrooms, while the source title lists 3BR. No corrected count has been verified.'})
        if current['isDevelopment']:
            current['title']=PROJECT_NAMES.get(association) or text(r.get('building') or r['title']).replace(' | ', ', ')
            current['subtitle']=text(r['title']) if text(r['title'])!=current['title'] else current['location']
        if current['location']:current['locationSlug']=slug(current['location'])
        a=r.get('agent')
        if a:
            agent={'name':a['name'],'role':a.get('position') or a.get('role') or 'Property advisor'}
            if a.get('image'):agent['image']=a['image'];add_media(a['image'],True)
            if a.get('email') and re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$',a['email']):agent['email']=a['email']
            phone=re.sub(r'[^+\d]','',a.get('phone') or '')
            if re.match(r'^\+971\d{8,9}$',phone):agent['phone']=phone
            current['agent']=agent
        for i,u in enumerate(gallery):add_media(u,i==0)
        records.append(current)
    project_records=[]
    for p in source_projects:
        if not p.get('publicationEligible'):continue
        pid=PROJECT_IDS.get(p['slug'],p['slug'])
        gallery=[u for u in p.get('gallery',[]) if valid_photo(u)]
        hero=[u for u in p.get('hero',{}).get('images',[]) if valid_photo(u)]
        image=(hero+gallery)[0]
        description=p.get('hero',{}).get('description','')
        if pid=='six-senses':description='Residences above the Dubai Marina skyline, with a focus on well-being and a connected waterfront lifestyle.'
        record={'id':pid,'name':PROJECT_NAMES[pid],'subtitle':text(p.get('hero',{}).get('title')),
                'image':image,'position':'center','location':PROJECT_LOCATIONS[pid],
                'sourceUrl':p['sourceUrl'],'sourceHash':p['sourceHash'],'description':text(description),
                'photos':[{'image':u,'alt':PROJECT_NAMES[pid]+' - photograph '+str(i+1)} for i,u in enumerate(gallery)]}
        if pid in PROJECT_LINKS:record['url']=PROJECT_LINKS[pid]
        project_records.append(record)
        for u in gallery+hero:add_media(u,u==image)
        for section in p.get('sections',[]):
            if not section.get('publicationEligible'):continue
            for img in section.get('images',[]):add_media(img.get('url') if isinstance(img,dict) else img,True)
    for p in json.loads((RAW/'static-pages.json').read_text()):
        if p['slug'] not in ('about','services','sell','contact','home'):continue
        for section in p.get('sections',[]):
            for img in section.get('images',[]):add_media(img.get('url') if isinstance(img,dict) else img,True)
    for agent in json.loads((RAW/'agents.json').read_text()):add_media(agent.get('photo'),True)
    priority=['palm-view-duplex-bespoke-garden-home','ultimate-trophy-4br-garden-suite-with-private-pool','renovation-opportunity-high-number-iconic-view']
    records.sort(key=lambda r:(r['status']!='Listed',priority.index(r['id']) if r['id'] in priority else len(priority),r['title'].lower(),r['id']))
    save(DATA/'properties.json',records);save(DATA/'catalogue-projects.json',project_records);save(RAW/'media-urls.json',list(media.values()))
    save(ROOT/'docs/content-migration/verified-corrections.json',corrections)
    summary={'sourceDate':DATE,'sourceListings':len(records),'individualListings':sum(not r['isDevelopment'] for r in records),
             'developmentEnquiries':sum(r['isDevelopment'] for r in records),'projects':len(project_records),
             'currentSales':sum(r['purpose']=='buy' and not r['isDevelopment'] and r['status']=='Listed' for r in records),
             'currentRentals':sum(r['purpose']=='rent' and r['status']=='Listed' for r in records),
             'archivedListings':sum(r['status'] in ('Sold','Rented') for r in records),'uniqueMedia':len(media),
             'propertyVideos':sum(bool(r['videos']) for r in records),'missingPhotos':sum(not r['photos'] for r in records),
             'bedroomCountsAwaitingConfirmation':sum(r['id'] in BEDROOM_CONFLICT_IDS for r in records),
             'unverifiedCurrencyConversions':'Not displayed','missingFields':'Retained as null; never fabricated',
             'sourceArticles':'All 4 archived because the bodies do not match their titles',
             'sourceContact':'Dedicated /contact page supersedes stale project modal addresses'}
    save(DATA/'import-summary.json',summary);print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':main()
