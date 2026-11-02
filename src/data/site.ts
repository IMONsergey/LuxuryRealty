import assets from './assets.json';

type Asset = {src:string;width?:number;height?:number;renderWidth?:number;renderHeight?:number;srcset?:string};
const map = assets as Record<string,Asset>;
export function asset(key:string):Asset {
  const found=map[key];
  if(!found) throw new Error('Missing source asset: '+key);
  return found;
}
export const site = {
  name:'Luxury Realty',
  description:'A considered collection of homes, architecture and extraordinary places in Dubai.',
  email:'contactus@luxuryrealty.com',
  phone:'+9714 323 4123',
  phoneHref:'+97143234123',
  address:'Office 410, One Central - Offices 5, Dubai, UAE, P.O. Box 451738',
};
export const navigation=[
  {label:'Home',href:'/'},
  {label:'Buy',href:'/properties/'},
  {label:'Rent',href:'/properties/?purpose=rent'},
  {label:'New developments',href:'/developments/'},
  {label:'Our services',href:'/#services'},
  {label:'Our story',href:'/#story'},
  {label:'Insights',href:'/insights/'},
  {label:'Contacts',href:'/contacts/'},
];
export interface Property {
 id:string; title:string; subtitle:string; image:string; type:string; location:string;
 bedrooms:number; area:number; price:number; purpose:'buy'|'rent'; features:string[];
 selectionImage?:string; photos?:PropertyPhoto[]; illustrative?:boolean;
}
export interface PropertyPhoto {image:string;alt:string;}
// These four detail photographs belong to the supplied residence template.
// Other records use only the photographs already assigned to their own cards.
const residencePhotos:PropertyPhoto[]=[
 {image:'property-imgRectangle58',alt:'Illustrative property image, not a verified listing'},
 {image:'property-imgRectangle60',alt:'Illustrative property image, not a verified listing'},
 {image:'property-imgRectangle61',alt:'Illustrative property image, not a verified listing'},
 {image:'property-imgRectangle63',alt:'Illustrative property image, not a verified listing'},
];
export const properties:Property[]=[
 {id:'dubai-hills-residence',title:'Illustrative residence 01',subtitle:'Illustrative collection preview',image:'catalogue-imgMedia',selectionImage:'imgRectangle4',photos:residencePhotos,type:'Villa',location:'Dubai Hills Estate',bedrooms:6,area:21000,price:65000000,purpose:'buy',features:['Garden','Pool','Terrace','Open kitchen'],illustrative:true},
 {id:'dubai-hills-waterfront',title:'Illustrative residence 02',subtitle:'Illustrative collection preview',image:'catalogue-imgMedia2',selectionImage:'imgRectangle7',type:'Villa',location:'Dubai Hills Estate',bedrooms:6,area:21000,price:65000000,purpose:'buy',features:['Pool','Terrace','Water view'],illustrative:true},
 {id:'dubai-hills-skyline',title:'Illustrative residence 03',subtitle:'Illustrative collection preview',image:'catalogue-imgMedia3',selectionImage:'imgRectangle8',type:'Villa',location:'Dubai Hills Estate',bedrooms:6,area:21000,price:65000000,purpose:'buy',features:['Terrace','Open kitchen','City view'],illustrative:true},
 {id:'dubai-hills-garden',title:'Illustrative residence 04',subtitle:'Illustrative collection preview',image:'catalogue-imgMedia4',selectionImage:'imgRectangle5',type:'Villa',location:'Dubai Hills Estate',bedrooms:6,area:21000,price:65000000,purpose:'buy',features:['Garden','Pool','Terrace'],illustrative:true},
 {id:'dubai-hills-courtyard',title:'Illustrative residence 05',subtitle:'Illustrative collection preview',image:'catalogue-imgMedia3',selectionImage:'imgRectangle11',type:'Villa',location:'Dubai Hills Estate',bedrooms:6,area:21000,price:65000000,purpose:'buy',features:['Garden','Terrace'],illustrative:true},
 {id:'dubai-hills-panorama',title:'Illustrative residence 06',subtitle:'Illustrative collection preview',image:'catalogue-imgMedia6',type:'Villa',location:'Dubai Hills Estate',bedrooms:6,area:21000,price:65000000,purpose:'buy',features:['Water view','Pool'],illustrative:true},
 {id:'dubai-hills-terrace',title:'Illustrative residence 07',subtitle:'Illustrative collection preview',image:'catalogue-imgMedia7',type:'Villa',location:'Dubai Hills Estate',bedrooms:6,area:21000,price:65000000,purpose:'buy',features:['Terrace','Open kitchen'],illustrative:true},
 {id:'dubai-hills-retreat',title:'Illustrative residence 08',subtitle:'Illustrative collection preview',image:'catalogue-imgMedia8',type:'Villa',location:'Dubai Hills Estate',bedrooms:6,area:21000,price:65000000,purpose:'buy',features:['Garden','Pool'],illustrative:true},
];
export function propertyPhotos(property:Property):PropertyPhoto[]{
 // The current image set is illustrative and has no verified per-listing mapping.
 const photos=[...(property.photos||[]),{image:property.image,alt:'Illustrative property image, not a verified listing'}];
 if(property.selectionImage)photos.push({image:property.selectionImage,alt:'Illustrative property image, not a verified listing'});
 return photos.filter((photo,index)=>photos.findIndex(other=>other.image===photo.image)===index);
}
export const projects=[
 {id:'ava-at-palm',name:'AVA at Palm Jumeirah',subtitle:'A Journey to Sublime Sophistication',image:'imgLuxuryRealtyProjectCard1',position:'center',url:'https://ava-at-palm-imon.vercel.app',location:'Palm Jumeirah, Dubai'},
 {id:'orla',name:'ORLA',subtitle:'Where architecture meets the horizon',image:'imgLuxuryRealtyProjectCard3',position:'50% 73.5%',url:'https://orla-imon.vercel.app',location:'Palm Jumeirah, Dubai'},
 {id:'six-senses',name:'Six Senses Residences',subtitle:'A different rhythm of living',image:'imgLuxuryRealtyProjectCard2',position:'center',url:'https://six-senses-imon.vercel.app',location:'Dubai Marina, Dubai'},
 {id:'atlantis',name:'Atlantis The Royal Residences',subtitle:'Created for legendary living',image:'atlantis-exterior',position:'center',url:'https://atlantis-imon.vercel.app',location:'Palm Jumeirah, Dubai'},
];
export const services=[
 {title:'Property search',body:'Start with how you want to live. Share the places, architecture and everyday details that matter to you, and explore a focused selection of homes.'},
 {title:'Property advice',body:'Arrange a conversation about a specific property, its setting and the questions you would like to explore before a viewing.'},
 {title:'Buying a property',body:'Keep your shortlist, request the available property information and arrange a private viewing with the relevant advisor.'},
 {title:'Selling a property',body:'Tell us about your home and your plans. We will get in touch to discuss the next steps and the information needed to present it.'},
 {title:'Renting a property',body:'Share your preferred location, timeframe and requirements. Rental availability is confirmed individually on enquiry.'},
 {title:'Private viewings',body:'Experience a home in person. Request a viewing and include your preferred dates, so the arrangements can be confirmed with you.'},
];
export const price=(value:number)=>'AED '+new Intl.NumberFormat('en-US').format(value);
