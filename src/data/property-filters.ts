export type Purpose = 'buy' | 'rent' | 'developments' | 'all';
export type Sort = 'featured' | 'price-asc' | 'price-desc' | 'name';
export interface Filters {
 purpose:Purpose; q:string; location:string; type:string[]; bedrooms:string[]; features:string[];
 minPrice:string; maxPrice:string; status:string; sort:Sort; page:number;
}
export interface FilterProperty {
 id:string; index:number; purpose:string; development:boolean; location:string; type:string;
 bedrooms:number|null; price:number|null; features:string[]; status:string; search:string; title:string;
}
export interface FilterOptions {location:string[];type:string[];bedrooms:string[];features:string[];status:string[];}
interface PropertySource {
 id:string; title:string; subtitle?:string; address?:string; location?:string; type?:string; reference?:string|null;
 purpose:string; isDevelopment?:boolean; bedrooms?:number|null; price?:number|null; features?:string[];
 saleStatus?:string|null; status?:string;
}
export const normalizeSearch=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const numberFrom=(value:string|undefined):number|null=>value?.trim()&&Number.isFinite(Number(value))?Number(value):null;
export const validPurpose=(value:string):Purpose=>value==='rent'||value==='developments'||value==='all'?value:'buy';
export const validSort=(value:string):Sort=>value==='price-asc'||value==='price-desc'||value==='name'?value:'featured';
export function defaultFilters(purpose:Purpose='buy'):Filters {
 return {purpose,q:'',location:'',type:[],bedrooms:[],features:[],minPrice:'',maxPrice:'',status:'current',sort:'featured',page:1};
}
export function copyFilters(filters:Filters):Filters {
 return {...filters,type:[...filters.type],bedrooms:[...filters.bedrooms],features:[...filters.features]};
}
export function money(value:string):{value:number|null;valid:boolean} {
 if(!value.trim())return {value:null,valid:true};
 const cleaned=value.replace(/[,\s]/g,'');
 const parsed=Number(cleaned);
 return {value:parsed,valid:/^\d+$/.test(cleaned)&&Number.isSafeInteger(parsed)&&parsed>=0};
}
export function priceError(filters:Pick<Filters,'minPrice'|'maxPrice'>):string {
 const minimum=money(filters.minPrice),maximum=money(filters.maxPrice);
 if(!minimum.valid||!maximum.valid)return 'Enter whole, non-negative amounts in AED.';
 if(minimum.value!==null&&maximum.value!==null&&minimum.value>maximum.value)return 'The maximum price must be at least the minimum price.';
 return '';
}
export function propertyFilterRecord(property:PropertySource,index:number):FilterProperty {
 const sourceStatus=(property.saleStatus||property.status||'Listed').trim();
 const archived=/\b(sold|rented|archived|withdrawn|unavailable)\b|off[ -]market/i.test(sourceStatus);
 const bedrooms=property.isDevelopment?null:property.bedrooms??null;
 return {
  id:property.id,index,purpose:property.purpose,development:Boolean(property.isDevelopment),
  location:property.location||'',type:property.type||'',bedrooms,price:property.price??null,
  features:property.features||[],status:archived?sourceStatus.toLowerCase():'current',title:property.title,
  search:normalizeSearch([property.title,property.subtitle,property.address,property.location,property.type,property.reference,
   bedrooms!==null?bedrooms+' beds '+bedrooms+' bedroom '+bedrooms+' bedrooms':''].filter(Boolean).join(' ')),
 };
}
const unique=(values:string[])=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
export function filterOptions(properties:FilterProperty[]):FilterOptions {
 const bedrooms=[...new Set(properties.filter(property=>!property.development).map(property=>property.bedrooms)
  .filter((value):value is number=>value!==null&&Number.isFinite(value)&&value>=0).map(value=>Math.min(8,value)))].sort((a,b)=>a-b);
 const archived=unique(properties.filter(property=>property.status!=='current').map(property=>property.status));
 return {location:unique(properties.map(property=>property.location)),type:unique(properties.map(property=>property.type)),
  bedrooms:bedrooms.map(value=>value===8?'8+':String(value)),features:unique(properties.flatMap(property=>property.features)),
  status:['current','all',...(archived.length?['archived']:[]),...archived.filter(value=>value!=='archived')]};
}
export function matchingProperties<T extends FilterProperty>(properties:T[],filters:Filters):T[] {
 if(priceError(filters))return [];
 const terms=normalizeSearch(filters.q).split(' ').filter(Boolean);
 const minimum=money(filters.minPrice).value,maximum=money(filters.maxPrice).value;
 const requestedFeatures=filters.features.map(normalizeSearch);
 const matches=properties.filter(property=>{
  if(filters.purpose==='developments'&&!property.development)return false;
  if((filters.purpose==='buy'||filters.purpose==='rent')&&(property.development||property.purpose!==filters.purpose))return false;
  if(filters.status==='archived'&&property.status==='current')return false;
  if(filters.status!=='all'&&filters.status!=='archived'&&property.status!==filters.status)return false;
  if(terms.some(term=>!property.search.includes(term)))return false;
  if(filters.location&&property.location!==filters.location)return false;
  if(filters.type.length&&!filters.type.includes(property.type))return false;
  if(filters.bedrooms.length&&(property.bedrooms===null||!filters.bedrooms.some(value=>value==='8+'?property.bedrooms!>=8:property.bedrooms===Number(value))))return false;
  const availableFeatures=property.features.map(normalizeSearch);
  if(requestedFeatures.some(feature=>!availableFeatures.includes(feature)))return false;
  if(minimum!==null&&(property.price===null||property.price<=0||property.price<minimum))return false;
  if(maximum!==null&&(property.price===null||property.price<=0||property.price>maximum))return false;
  return true;
 });
 return matches.sort((a,b)=>{
  if(filters.sort==='name')return a.title.localeCompare(b.title)||a.index-b.index;
  if(filters.sort==='price-asc'||filters.sort==='price-desc'){
   const aKnown=a.price!==null&&a.price>0,bKnown=b.price!==null&&b.price>0;
   if(aKnown!==bKnown)return aKnown?-1:1;
   if(aKnown&&bKnown)return (filters.sort==='price-asc'?a.price!-b.price!:b.price!-a.price!)||a.index-b.index;
  }
  return a.index-b.index;
 });
}
export function serializeFilters(filters:Filters,pathname='/properties/'):string {
 const params=new URLSearchParams();
 if(filters.purpose!=='buy')params.set('purpose',filters.purpose);
 if(filters.q.trim())params.set('q',filters.q.trim().slice(0,100));
 if(filters.location)params.set('location',filters.location);
 for(const name of ['type','bedrooms','features'] as const)for(const value of [...new Set(filters[name])])params.append(name,value);
 for(const name of ['minPrice','maxPrice'] as const){
  const raw=filters[name].trim();if(raw){const parsed=money(raw);params.set(name,parsed.valid?String(parsed.value):raw);}
 }
 if(filters.status!=='current')params.set('status',filters.status);
 if(filters.sort!=='featured')params.set('sort',filters.sort);
 if(filters.page>1)params.set('page',String(filters.page));
 return pathname+(params.size?'?'+params.toString():'');
}
export function parseFilterParams(params:URLSearchParams,options:FilterOptions):{filters:Filters;removed:boolean} {
 const filters=defaultFilters();let removed=false;
 const purpose=params.get('purpose')||'buy';filters.purpose=validPurpose(purpose);
 if(!['buy','rent','developments','all'].includes(purpose))removed=true;
 filters.q=(params.get('q')||'').trim().slice(0,100);
 for(const name of ['location','status'] as const){
  const value=params.get(name);if(value!==null){if(options[name].includes(value)||name==='location'&&value==='')filters[name]=value;else removed=true;}
 }
 for(const name of ['type','bedrooms','features'] as const){
  const values=params.getAll(name);filters[name]=options[name].filter(value=>values.includes(value));
  if(values.some(value=>!options[name].includes(value)))removed=true;
 }
 for(const name of ['minPrice','maxPrice'] as const)filters[name]=(params.get(name)||'').slice(0,30);
 const sort=params.get('sort')||'featured';filters.sort=validSort(sort);
 if(!['featured','price-asc','price-desc','name'].includes(sort))removed=true;
 const page=Number(params.get('page'));filters.page=Number.isSafeInteger(page)&&page>0?page:1;
 const recognized=new Set(['purpose','q','location','type','bedrooms','features','minPrice','maxPrice','status','sort','page']);
 if([...params.keys()].some(name=>!recognized.has(name)))removed=true;
 return {filters,removed};
}
export function filterChips(filters:Filters):[keyof Filters,string,string][] {
 const chips:[keyof Filters,string,string][]=[];
 if(filters.q)chips.push(['q',filters.q,'Search: '+filters.q]);
 if(filters.location)chips.push(['location',filters.location,filters.location]);
 filters.type.forEach(value=>chips.push(['type',value,value]));
 filters.bedrooms.forEach(value=>chips.push(['bedrooms',value,value==='0'?'Studio':value+' '+(value==='1'?'bedroom':'bedrooms')]));
 filters.features.forEach(value=>chips.push(['features',value,value]));
 const displayMoney=(value:string)=>{const parsed=money(value);return parsed.valid&&parsed.value!==null?new Intl.NumberFormat('en-US').format(parsed.value):value;};
 if(filters.minPrice)chips.push(['minPrice',filters.minPrice,'From AED '+displayMoney(filters.minPrice)]);
 if(filters.maxPrice)chips.push(['maxPrice',filters.maxPrice,'Up to AED '+displayMoney(filters.maxPrice)]);
 if(filters.status!=='current')chips.push(['status',filters.status,filters.status==='all'?'All records':filters.status==='archived'?'Sold & rented':filters.status.charAt(0).toUpperCase()+filters.status.slice(1)]);
 return chips;
}
