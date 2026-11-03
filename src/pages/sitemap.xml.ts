import type {APIRoute} from 'astro';
import {properties,projects} from '../data/site';
import {articles} from '../data/articles';
export const GET:APIRoute=({site,url})=>{
 const origin=site||new URL(url.origin);
 const routes=['/','/properties/','/developments/','/about/','/services/','/sell/','/contacts/','/privacy/','/insights/',
  ...properties.map(p=>'/properties/'+p.id+'/'),...projects.map(p=>'/developments/'+p.id+'/'),...articles.map(a=>'/insights/'+a.id+'/')];
 const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+routes.map(path=>'<url><loc>'+escape(new URL(path,origin).href)+'</loc></url>').join('')+'</urlset>',{headers:{'Content-Type':'application/xml; charset=utf-8'}});
};
