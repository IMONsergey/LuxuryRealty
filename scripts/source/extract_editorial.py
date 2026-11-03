import os
"""Extract source editorial content; no invented property facts or publication side effects."""
from pathlib import Path
import hashlib
import json
import re
from urllib.parse import urljoin, urlparse, parse_qs
from bs4 import BeautifulSoup, Comment

ROOT = Path(os.environ.get('LUXURY_SOURCE_DIR', Path(__file__).resolve().parent)).resolve()
RAW = ROOT / 'raw'
ORIGIN = 'https://www.luxuryresidences.com'

def text(node):
    return re.sub(r'\s+', ' ', node.get_text(' ', strip=True).replace('\u200d', '').replace('\xa0',' ')).strip() if node else ''

def unique(items):
    out, keys = [], set()
    for item in items:
        key = json.dumps(item,sort_keys=True) if isinstance(item,dict) else item
        if key and key not in keys: out.append(item); keys.add(key)
    return out

def load(path):
    data=path.read_bytes()
    return BeautifulSoup(data,'html.parser'), hashlib.sha256(data).hexdigest()

def safe_html(node):
    if not node: return ''
    copy=BeautifulSoup(str(node),'html.parser')
    for e in copy.select('script,style,iframe,form,svg,input,button,select,textarea,noscript,.w-form-done,.w-form-fail,.w-dyn-empty,.w-condition-invisible,.member-popup_component'):
        e.decompose()
    for c in copy.find_all(string=lambda x:isinstance(x,Comment)):c.extract()
    allowed={'h1','h2','h3','h4','h5','h6','p','br','strong','em','b','i','ul','ol','li','a','img','figure','figcaption','blockquote','div','span','table','tbody','thead','tr','td','th'}
    for e in list(copy.find_all()):
        if e.name not in allowed: e.unwrap(); continue
        attrs={}
        if e.name=='a':
            href=e.get('href','')
            if href.startswith(('https://','http://','mailto:','tel:','/')):attrs['href']=urljoin(ORIGIN,href) if href.startswith('/') else href
            else:e.unwrap();continue
        if e.name=='img':
            src=e.get('src','')
            if not src.startswith(('https://','http://','/')):e.decompose();continue
            attrs={'src':urljoin(ORIGIN,src),'alt':e.get('alt','')}
        e.attrs=attrs
    return ''.join(str(e) for e in copy.contents).strip()

def images(node):
    return unique([{'url':urljoin(ORIGIN,e.get('src','')),'alt':e.get('alt',''),'srcset':e.get('srcset','')} for e in node.select('img[src]') if e.get('src')])

def videos(node):
    out=[]
    for e in node.select('video,iframe'):
        if e.name=='video':
            for src in e.select('source[src]'):out.append({'url':urljoin(ORIGIN,src['src']),'kind':'video','poster':e.get('poster')})
            if e.get('src'):out.append({'url':urljoin(ORIGIN,e['src']),'kind':'video','poster':e.get('poster')})
        else:
            src=urljoin(ORIGIN,e.get('src',''));qs=parse_qs(urlparse(src).query)
            resolved=qs.get('src',[src])[0]
            if 'vimeo.com' in resolved or 'youtube' in resolved:out.append({'url':resolved,'kind':'embed','sourceEmbedUrl':src})
    for e in node.select('script.w-json'):
        try:
            data=json.loads(e.string or '{}')
            for item in data.get('items',[]):
                if item.get('type')=='video':out.append({'url':item.get('url') or item.get('originalUrl'),'kind':'lightbox','raw':item})
        except (ValueError,TypeError):pass
    return unique(out)

def links(node):
    return unique([{'text':text(a),'url':urljoin(ORIGIN,a['href']) if a['href']!='#' else '#'} for a in node.select('a[href]') if text(a)])

def section(node, index=0):
    headings=[{'level':int(e.name[1]),'text':text(e)} for e in node.select('h1,h2,h3,h4,h5,h6') if text(e)]
    paragraphs=unique([text(e) for e in node.select('p,[class*="paragraph"],[class*="_description"],[class*="_paragraph"]') if text(e) and not e.find('p')])
    if not paragraphs:
        paragraphs=unique([text(e) for e in node.select('[class*="text-size"],[class*="_p"]') if text(e) and not e.select_one('p,h1,h2,h3,h4,input,a')])
    issue=[]
    if node.select_one('.w-dyn-empty'):issue.append('empty-cms-section')
    if any('Placeholder' in i['url'] for i in images(node)):issue.append('placeholder-media')
    if re.search(r'Goes Here|Lorem ipsum',text(node),re.I):issue.append('placeholder-copy')
    return {'id':(node.get('class') or [f'section-{index+1}'])[0], 'heading':headings[0]['text'] if headings else '',
        'headings':headings,'paragraphs':paragraphs,'listItems':unique([text(e) for e in node.select('li') if text(e)]),
        'bodyHtml':safe_html(node),'text':text(node),'images':images(node),'videos':videos(node),'links':links(node),
        'publicationEligible':not ('empty-cms-section' in issue or 'placeholder-copy' in issue),'issues':issue}

def base(s,sha,path,slug,prefix=''):
    meta=s.select_one('meta[name="description"]')
    return {'slug':slug,'sourceUrl':ORIGIN+('/'+prefix if prefix else '')+('' if slug=='home' else '/'+slug),
        'sourceHash':sha,'sourceFile':str(path),'title':text(s.title),'metaDescription':meta.get('content','') if meta else ''}

projects=[]
for path in sorted(RAW.glob('projects__*.html')):
    s,sha=load(path);slug=path.stem.split('__',1)[1];main=s.find('main') or s.select_one('.main-wrapper')
    entry=base(s,sha,path,slug,'projects');entry['name']=re.sub(r'^Explore\s+|\s*\|.*$','',entry['title']).strip()
    sections=[section(e,i) for i,e in enumerate(main.find_all(recursive=False))]
    entry['sections']=sections
    first=sections[0];imgs=first['images'];logo=next((i['url'] for i in imgs if 'logo' in i['url'].lower()),None)
    visual=[i['url'] for i in imgs if i['url']!=logo and 'Placeholder' not in i['url']]
    entry['hero']={'title':first['heading'],'description':' '.join(first['paragraphs']),'logo':logo,'image':visual[0] if visual else None,'images':visual}
    entry['gallery']=unique([i['url'] for sec in sections for i in sec['images'] if i['url']!=logo and 'Placeholder' not in i['url']])
    all_links=links(main);entry['mapUrl']=next((l['url'] for l in all_links if 'maps.' in l['url']),None)
    entry['brochureUrl']=next((l['url'] for l in all_links if 'brochure' in l['text'].lower() and l['url']!='#'),None)
    entry['floorplansUrl']=next((l['url'] for l in all_links if 'floorplan' in l['text'].lower() and l['url']!='#'),None)
    entry['videos']=videos(main)
    entry['publicationEligible']=slug!='template'
    entry['issues']=unique([issue for sec in sections for issue in sec['issues']]+(['placeholder-project-do-not-publish'] if slug=='template' else [])+(['brochure-control-has-no-download-url'] if entry['brochureUrl'] is None else [])+(['floorplan-control-has-no-download-url'] if entry['floorplansUrl'] is None else []))
    projects.append(entry)

articles=[]
for path in sorted(RAW.glob('insights__*.html')):
    s,sha=load(path);slug=path.stem.split('__',1)[1];body=s.select_one('.insights_description-rich_texta')
    entry=base(s,sha,path,slug,'insights');entry['title']=text(s.select_one('.insights_intro-title'))
    entry['date']=text(s.select_one('.insights_intro-details_date'));entry['author']=text(s.select_one('.insights_intro-author_name'))
    entry['bodyHtml']=safe_html(body);entry['bodyText']=text(body);entry['bodyHash']=hashlib.sha256(entry['bodyText'].encode()).hexdigest()
    entry['paragraphs']=unique([text(p) for p in body.select('p') if text(p)]) if body else []
    entry['images']=images(body) if body else []
    intro=s.select_one('.insights_intro-component') or s.select_one('.insights_intro_component')
    entry['heroImages']=images(intro) if intro else []
    entry['publicationEligible']=False
    entry['issues']=['body-does-not-match-title','duplicated-unrelated-ohana-abu-dhabi-body','source-copy-needs-correction-before-publication']
    entry['duplicateGroup']='ohana-by-the-sea-abu-dhabi-mansion-98m'
    articles.append(entry)

agents=[]
about_path=RAW/'about.html'
if about_path.exists():
    s,sha=load(about_path)
    card_by_name={text(e.select_one('.members_name')):e for e in s.select('.member_component.w-dyn-item')}
    for popup in s.select('.member-popup_component.w-dyn-item'):
        name=text(popup.select_one('.member-popup_name'));bio=popup.select_one('.member-popup_rte')
        if not name or not text(bio):continue
        slug=re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-');card=card_by_name.get(name)
        pic=card.select_one('img') if card else None
        if not pic and name=='Matthew Cooke':pic=s.select_one('.member-highlight_img')
        phone=popup.select_one('a.phone[href^="tel:"]');email=popup.select_one('a.email[href^="mailto:"]');whatsapp=popup.select_one('a.whatsapp[href]')
        phone_value=phone['href'][4:] if phone else None;issues=[]
        if phone_value and phone_value.startswith('+971') and len(re.sub(r'\D','',phone_value))!=12:issues.append('source-uae-phone-has-unexpected-digit-count-confirm-before-use')
        agents.append({'slug':slug,'name':name,'role':text(popup.select_one('.member-popup_designation')),'photo':pic.get('src') if pic else None,
            'bio':text(bio),'bioParagraphs':[text(p) for p in bio.select('p') if text(p)],'bioHtml':safe_html(bio),
            'phone':phone_value,'email':email['href'][7:] if email else None,'whatsapp':whatsapp['href'] if whatsapp else None,
            'videoUrls':unique([v['url'] for v in videos(popup)]),'sourceUrl':ORIGIN+'/about','sourceHash':sha,'issues':issues})

selectors={
 'home':['.hero_component','.our_services_component','.about_component'],
 'about':['.story-infocus-wrapper','.section_team-intro','.section_member-highlight','.section_bottom-content'],
 'sell':['.page_header_component','.quote_component','.services_component','.before_footer_component'],
 'services':['.page_header_component','.quote_component','.about_services_component','.before_footer_component'],
 'contact':['.page_header_component','.contact_info-contact_details'],
 'privacy-policy-luxury-residence':['.page_header_component','.privacy_component'],
 'insights':['.page_header_component'],
 'buy':['.page_header_component'],
 'rent':['.page_header_component'],
}
static=[]
for slug,sels in selectors.items():
    path=RAW/(slug+'.html')
    if not path.exists():continue
    s,sha=load(path);entry=base(s,sha,path,slug)
    entry['sections']=[section(e,i) for i,sel in enumerate(sels) if (e:=s.select_one(sel))]
    entry['issues']=[];entry['publicationEligible']=True
    if slug in ('buy','rent'):entry['kind']='catalog';entry['issues']=['catalog-listings-extracted-separately']
    if slug=='home':
        entry['kind']='home';entry['issues']=['catalog-and-development-cards-extracted-separately','source-insights-teaser-is-hidden']
        entry['heroVideo']=videos(s.select_one('.hero_component'))
    if slug=='services':
        entry['services']=[]
        for h in s.select('.about_services-box_heading'):
            entry['services'].append({'title':text(h),'body':text(h.parent).removeprefix(text(h)).strip(),'bodyHtml':safe_html(h.parent)})
    if slug=='sell':
        entry['steps']=[text(h) for h in s.select('.services-box_heading')]
        entry['valuationHeading']=text(s.select_one('.property_inquiry-heading'))
        entry['issues'].append('recently-sold-widget-may-list-available-items-do-not-infer-status')
    if slug=='about':
        entry['agentIds']=[a['slug'] for a in agents]
        entry['metrics']=[{'value':text(e.select_one('.infocus-counter_title')),'label':text(e.select_one('.infocus-counter_description'))} for e in s.select('.infocus-counter_component')]
    if slug=='contact':
        entry['contact']={}
        for e in s.select('.contact_details-meta'):
            k=text(e.select_one('.contact_details-meta_heading'));v=text(e.select_one('.contact_details-meta_text'))
            if k and v:entry['contact'][k]=v
        entry['legalName']=text(s.select_one('.contact_details-heading'))
        entry['socialLinks']=unique([a.get('href') for a in s.select('.contact_info-contact_details .social-icons1_link[href]')])
        entry['mapUrl']=next((e.get('src') for e in s.select('.map_component iframe[src]') if re.search(r'https?://(?:www\.)?(?:google\.com/maps|maps\.google\.)',e.get('src',''))),None)
        entry['issues']=['navigation-and-footer-email-anchor-uses-tel-scheme','linkedin-source-url-targets-admin-feed-confirm-public-url','legal-name-remains-source-entity-until-confirmed']
    if slug=='privacy-policy-luxury-residence':
        entry['bodyHtml']=safe_html(s.select_one('.privacy_component'))
        entry['bodyText']=text(s.select_one('.privacy_component'))
        entry['issues']=['source-legal-entity-and-data-processing-practices-require-review-for-new-platform']
    if slug=='insights':entry['articleSlugs']=[a['slug'] for a in articles];entry['issues']=['all-four-source-article-bodies-mismatch-titles']
    static.append(entry)

for name,data in [('projects',projects),('articles',articles),('agents',agents),('static-pages',static)]:
    (ROOT/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2))
    print(name,len(data), 'bytes',(ROOT/(name+'.json')).stat().st_size)

report={
 'projects':len(projects),'publicProjects':sum(p['publicationEligible'] for p in projects),'articles':len(articles),'publicSourceArticles':sum(a['publicationEligible'] for a in articles),'agents':len(agents),'staticPages':len(static),
 'articleBodyHashes':{a['slug']:a['bodyHash'] for a in articles},
 'projectIssues':{p['slug']:p['issues'] for p in projects},'agentIssues':{a['slug']:a['issues'] for a in agents if a['issues']},
 'notes':['All source text preserved under source brand. Rebrand rendering separately; do not modify source evidence.',
          'Eight projects include one explicit Template placeholder. Seven real project pages have no real brochure or floorplan download URL.',
          'Four article bodies all describe the unrelated Ohana Abu Dhabi mansion and are not safe to publish under current titles.',
          'Seven agents are extracted from CMS popup records with actual bios. Repeated static Sabeeha placeholders are excluded.',
          'Home/buy/rent listing content is owned by separate listings extractor.']}
(ROOT/'editorial-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
