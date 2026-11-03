import assets from './assets.json';
import importedMedia from './imported-media.json';
import propertyData from './properties.json';
import projectData from './catalogue-projects.json';
import sourcePages from './source/static-pages.json';

export type Asset={src:string;width?:number;height?:number;renderWidth?:number;renderHeight?:number;srcset?:string;sourceUrl?:string};
const map=assets as Record<string,Asset>;
const media=importedMedia as Record<string,Asset>;
export function asset(key:string):Asset{
 const found=map[key]||media[key];
 if(found)return found;
 throw new Error('Missing source asset: '+key);
}
export const sourceDate='2026-11-03';
export const site={
 name:'Luxury Realty',
 legalName:'Luxury Residences Real Estate LLC',
 description:'A boutique Dubai real estate agency specialising in prime homes, penthouses, mansion villas and branded residences.',
 email:'contactus@luxuryresidences.com',
 phone:'+971 4 283 6681',
 phoneHref:'+97142836681',
 address:'Office 804, Magnum Opus Tower, Barsha Heights, Dubai, UAE, P.O. Box 451733',
};
export const navigation=[
 {label:'Home',href:'/'},
 {label:'Buy',href:'/properties/'},
 {label:'Rent',href:'/properties/?purpose=rent'},
 {label:'New developments',href:'/developments/'},
 {label:'Sell your property',href:'/sell/'},
 {label:'Our services',href:'/services/'},
 {label:'Our story',href:'/about/'},
 {label:'Insights',href:'/insights/'},
 {label:'Contacts',href:'/contacts/'},
];
export interface PropertyPhoto{image:string;alt:string;}
export interface PropertyVideo{url:string;type?:string;thumbnailUrl?:string;}
export interface Property{
 id:string;title:string;subtitle:string;image:string;type:string;location:string;building:string;address:string;
 bedrooms:number|null;bathrooms:number|null;area:number|null;price:number|null;purpose:'buy'|'rent'|'unknown';
 features:string[];photos:PropertyPhoto[];descriptionHtml:string;description:string;reference:string|null;
 status:string;sourceUrl:string;sourceHash:string;pricePeriod:string|null;saleStatus?:string|null;
 projectId?:string;locationSlug?:string;isDevelopment?:boolean;category?:string;videos?:PropertyVideo[];
 agent?:{name:string;role?:string;image?:string;phone?:string;email?:string};
 illustrative?:boolean;selectionImage?:string;sourceDate?:string;dataNotes?:string[];
}
export const properties=propertyData as Property[];
export const propertyPhotos=(property:Property):PropertyPhoto[]=>property.photos.filter((p,i,a)=>a.findIndex(x=>x.image===p.image)===i);
export const isArchived=(property:Property)=>/sold|rented|archived|withdrawn/i.test(property.saleStatus||property.status);
export const currentProperties=properties.filter(p=>!isArchived(p));
export interface Project{
 id:string;name:string;subtitle:string;image:string;position:string;url?:string;location:string;
 sourceUrl:string;sourceHash:string;descriptionHtml?:string;description?:string;photos?:PropertyPhoto[];
}
export const projects=projectData as Project[];
const servicePage=sourcePages.find(page=>page.slug==='services');
export const services=(servicePage?.services||[]).map(service=>({title:service.title,body:service.body.replace(/Luxury Residences/g,'Luxury Realty')}));
export const price=(value:number|null)=>value===null?'Price on request':'AED '+new Intl.NumberFormat('en-US').format(value);
export const areas=Array.from(new Set(properties.map(p=>p.location).filter(Boolean))).sort().map(name=>({
 name,slug:properties.find(p=>p.location===name)?.locationSlug||'',
 properties:properties.filter(p=>p.location===name),
}));
