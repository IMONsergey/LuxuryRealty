import projectSource from './source/projects.json';
import pageSource from './source/static-pages.json';
import agentSource from './source/agents.json';
import {normaliseAgentContact} from './agent-contact';

interface SourceImage {url:string;alt:string;srcset?:string;}
interface SourceSection {
 id:string;heading:string;headings:{level:number;text:string}[];paragraphs:string[];
 listItems:string[];images:SourceImage[];videos:{url:string;kind:string}[];
 publicationEligible:boolean;issues:string[];
}
interface SourceProject {
 slug:string;name:string;sourceUrl:string;sourceHash:string;publicationEligible:boolean;
 hero:{title:string;description:string;logo:string|null;image:string|null;images:string[]};
 sections:SourceSection[];gallery:string[];mapUrl:string|null;brochureUrl:string|null;floorplansUrl:string|null;
}
interface SourcePage {
 slug:string;sections:SourceSection[];sourceUrl:string;sourceHash:string;
 services?:{title:string;body:string}[];steps?:string[];valuationHeading?:string;
 metrics?:{value:string;label:string}[];contact?:Record<string,string>;legalName?:string;socialLinks?:string[];
}
interface SourceAgent {
 slug:string;name:string;role:string;photo:string|null;bio:string;bioParagraphs:string[];
 phone:string|null;email:string|null;whatsapp:string|null;videoUrls:string[];issues:string[];
}

/** Render escaped text and structured fields; never insert raw source HTML. */
export function brandText(value:string):string {
 return value.replace(/\u200d/g,'').replace(/\s+/g,' ').trim()
  .replace(/\bLuxury Residences\b(?!\s+Real Estate)/g,'Luxury Realty')
  .replace(/\banicon\b/g,'an icon').replace(/\bOasisat\b/g,'Oasis at').replace(/\bHugh Art\b/g,'High Art');
}
const sourceProjects=projectSource as unknown as SourceProject[];
const sourcePages=pageSource as unknown as SourcePage[];
const sourceAgents=agentSource as unknown as SourceAgent[];
const projectAliases:Record<string,string>={'atlantis':'atlantis-the-royal','ava-at-palm':'ava'};

export function pageContent(slug:string):SourcePage {
 const page=sourcePages.find(item=>item.slug===slug);
 if(!page)throw new Error('Missing migrated content page: '+slug);
 return page;
}
export function pageParagraphs(slug:string,sectionId?:string):string[] {
 const source=pageContent(slug).sections.filter(section=>!sectionId||section.id===sectionId);
 return [...new Set(source.flatMap(section=>section.paragraphs).map(brandText).filter(Boolean))];
}
function imageFilename(image:SourceImage):string {
 const filename=image.url.split('/').pop()?.split('?')[0]||'';
 try{return decodeURIComponent(filename);}catch{return filename;}
}
function isLocationMap(image:SourceImage):boolean {
 return /(?:^|[\s_-])map(?:[\s_.()-]|$)/i.test(imageFilename(image));
}
function isPhotograph(image:SourceImage):boolean {
 return /\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(image.url)
  &&!/logo|placeholder|white@2x|atrr-colour/i.test(imageFilename(image))
  &&!isLocationMap(image);
}

// Match these complete source paragraphs only; keep the first wording and all linked photographs.
const waterfrontParagraph="The Serenity Mansions Waterfront Collection offers luxurious and thoughtfully designed residences. Each home features expansive living spaces with floor-to-ceiling windows that frame stunning water views. The interiors are customisable, allowing you to create a space that reflects your unique style and preferences. Enjoy the serenity of living by the water, with private outdoor areas perfect for relaxation or entertaining.";
const waterfrontFramingParagraph=waterfrontParagraph.replace('windows that frame','windows framing');
function projectParagraphKey(slug:string,paragraph:string):string {
 return slug==='serenity-mansions-waterfront-collection'&&paragraph===waterfrontFramingParagraph?waterfrontParagraph:paragraph;
}

/** Render-only source cleanup; preserve the archived data and every retained paragraph's wording. */
export function propertyDescriptionHtml(id:string,html:string):string {
 let previousParagraph='',previousEnd=0;
 html=html.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi,(paragraph:string,offset:number,source:string)=>{
  const repeated=paragraph===previousParagraph&&source.slice(previousEnd,offset).trim()==='';
  previousParagraph=paragraph;
  previousEnd=offset+paragraph.length;
  return repeated?'':paragraph;
 }).replace(/<li\b[^>]*>\s*<\/li>/gi,'');
 if(id==='serenity-mansions-waterfront-collection'){
  const first=waterfrontFramingParagraph.replace('customisable','customizable');
  const second=waterfrontParagraph.replace('customisable','customizable');
  html=html.replace(`<p>${first}</p><p>${second}</p>`,`<p>${first}</p>`);
 }
 if(id==='the-chedi-private-residences'){
  html=html.replace('Redefining </p><p>grandeur','Redefining grandeur')
   .replace('elegant arrival \u00a0</p><p>experience','elegant arrival experience')
   .replace('serene atmosphere </p><p>for personal reflection.','serene atmosphere for personal reflection.');
 }
 if(id!=='orla-dorchester-collection')return html;
 const spacing:Record<string,string>={
  'Situatedon':'Situated on','Jumeriah':'Jumeirah','ORLAoccupies':'ORLA occupies',
  'Dubai’sarchipelago':'Dubai’s archipelago','Yourresidence':'Your residence',
  'outdoorblend':'outdoor blend','streamsthrough':'streams through','thesun':'the sun',
  'offthe':'off the','Offeringthe':'Offering the','ofresidents':'of residents',
  'luxurymansion':'luxury mansion','servicefrom':'service from','ORLAimmerses':'ORLA immerses',
  'withyour':'with your','conceptualisedthrough':'conceptualised through',
  'waterfeatures':'water features','positiveenergy':'positive energy','Organicby':'Organic by',
  'windflow':'wind flow','residencesand':'residences and','sunsetexperiences':'sunset experiences',
  'EachORLA':'Each ORLA','homewith':'home with','experience,stepping':'experience, stepping',
  'moments,for':'moments, for','entrancesare':'entrances are','howguests':'how guests',
  'ORLA’s85':'ORLA’s 85','andfour-bedroom':'and four-bedroom','Eachhave':'Each have',
  'thebest':'the best','suitevery':'suit every','Aniconic':'An iconic','PalmJumeirah':'Palm Jumeirah',
  'finestrestaurants':'finest restaurants','therest':'the rest','Palm’screscent':'Palm’s crescent',
  'uninterrupted270-degree':'uninterrupted 270-degree','turquoisewaters':'turquoise waters',
 };
 return Object.entries(spacing).reduce((text,[from,to])=>text.replaceAll(from,to),html)
  .replace(/(?:<br\s*\/?>(?:\s*)){1,2}/gi,'</p><p>');
}
export interface ProjectStory {id:string;heading:string;paragraphs:string[];images:SourceImage[];}
export interface ProjectFeature {heading:string;body:string;image?:SourceImage;}
export interface ProjectContent {
 sourceUrl:string;sourceHash:string;title:string;intro:string;heroImage:string;
 story:ProjectStory[];features:ProjectFeature[];featureTitle:string;
 photos:SourceImage[];locationImages:SourceImage[];mapUrl:string|null;brochureUrl:string|null;floorplansUrl:string|null;
 filmUrl?:string;
}
export function getProjectContent(projectId:string):ProjectContent {
 const slug=projectAliases[projectId]||projectId;
 const source=sourceProjects.find(project=>project.slug===slug&&project.publicationEligible);
 if(!source)throw new Error('Missing migrated development: '+projectId);
 const first=source.sections[0];
 // Every source hero starts with a project logo, including unnamed white PNG wordmarks.
 const heroPhotos=first.images.slice(1).filter(isPhotograph);
 const photographs=[...heroPhotos,...source.sections.slice(1).flatMap(section=>section.images).filter(isPhotograph)];
 const photos=photographs.filter((photo,index)=>photographs.findIndex(other=>other.url===photo.url)===index);
 const locationImages=source.sections.flatMap(section=>section.images).filter(isLocationMap)
  .filter((image,index,all)=>all.findIndex(other=>other.url===image.url)===index);
 if(!photos.length)throw new Error('Missing development photographs: '+projectId);
 const story:ProjectStory[]=[];
 const features:ProjectFeature[]=[];
 let featureTitle='Life at '+source.name;
 const paragraphIndex=new Map<string,ProjectStory>();
 for(const section of source.sections.slice(1)){
  if(!section.publicationEligible)continue;
  const sectionPhotos=section.images.filter(isPhotograph);
  const featureHeadings=section.headings.filter(heading=>heading.level===3);
  if(featureHeadings.length){
   featureTitle=brandText(section.heading);
   featureHeadings.forEach((heading,index)=>{
    const body=section.paragraphs[index];
    if(body)features.push({heading:brandText(heading.text),body:brandText(body),image:sectionPhotos[index]});
   });
   continue;
  }
  const headings=section.headings.filter(heading=>heading.level===2);
  const paragraphs=section.paragraphs.map(brandText).filter(Boolean);
  if(headings.length>1){
   paragraphs.forEach((paragraph,index)=>{
    const duplicate=paragraphIndex.get(projectParagraphKey(slug,paragraph));
    if(duplicate){duplicate.images.push(...sectionPhotos);return;}
    const block={id:`${section.id}-${index+1}`,heading:brandText(headings[Math.min(index,headings.length-1)].text),paragraphs:[paragraph],images:[...sectionPhotos]};
    story.push(block);paragraphIndex.set(projectParagraphKey(slug,paragraph),block);
   });
  }else if(paragraphs.length){
   const existing=paragraphIndex.get(projectParagraphKey(slug,paragraphs[0]));
   if(existing){existing.images.push(...sectionPhotos);continue;}
   const block={id:section.id,heading:brandText(section.heading),paragraphs,images:[...sectionPhotos]};
   story.push(block);paragraphs.forEach(paragraph=>paragraphIndex.set(projectParagraphKey(slug,paragraph),block));
  }
 }
 story.forEach(block=>{block.images=block.images.filter((photo,index,all)=>all.findIndex(other=>other.url===photo.url)===index);});
 const intro=slug==='six-senses'?'Residences above the Dubai Marina skyline.':brandText(source.hero.description);
 const filmUrl=source.sections.flatMap(section=>section.videos).find(video=>/^https:\/\/dl\.dropboxusercontent\.com\/.+\.mp4(?:\?|$)/i.test(video.url))?.url;
 return {sourceUrl:source.sourceUrl,sourceHash:source.sourceHash,title:brandText(source.hero.title),intro,heroImage:heroPhotos[0]?.url||photos[0].url,filmUrl,
  story,features,featureTitle,photos,locationImages,mapUrl:source.mapUrl,brochureUrl:source.brochureUrl,floorplansUrl:source.floorplansUrl};
}

export const agencyServices=(pageContent('services').services||[]).map(service=>({title:brandText(service.title),body:brandText(service.body)}));
export const sellingSteps=(pageContent('sell').steps||[]).map(brandText);
export const contactContent=pageContent('contact');
export const officeMapUrl='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(contactContent.contact?.address||'Magnum Opus Tower, Barsha Heights, Dubai, UAE');
export const agencySocialLinks=(contactContent.socialLinks||[]).filter(url=>/^https:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|twitter\.com|linkedin\.com|youtube\.com|tiktok\.com)\//.test(url)).map(url=>({
 url:url.replace(/\/admin\/feed\/posts\/?$/,'/'),
 label:url.includes('instagram')?'Instagram':url.includes('facebook')?'Facebook':url.includes('linkedin')?'LinkedIn':url.includes('youtube')?'YouTube':url.includes('tiktok')?'TikTok':'X',
}));
export const team=sourceAgents.map(person=>({
 ...person,bio:brandText(person.bio),bioParagraphs:person.bioParagraphs.map(brandText),
 ...normaliseAgentContact(person),
 videoUrl:person.videoUrls.find(url=>/^https:\/\/player\.vimeo\.com\/video\/\d+/.test(url))?.replace('player.vimeo.com/video/','vimeo.com/').split('?')[0]||null,
}));

