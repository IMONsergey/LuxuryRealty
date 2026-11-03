import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 copyFilters,defaultFilters,filterOptions,matchingProperties,money,numberFrom,parseFilterParams,
 priceError,propertyFilterRecord,serializeFilters,
} from '../src/data/property-filters.ts';

const source=JSON.parse(readFileSync(new URL('../src/data/properties.json',import.meta.url),'utf8'));
const make=(id,overrides={},index=0)=>propertyFilterRecord({
 id,title:id,purpose:'buy',location:'Palm Jumeirah',type:'Apartment',bedrooms:2,price:1000000,
 features:['Pool','Balcony'],status:'Listed',...overrides,
},index);
const matches=(records,overrides={})=>matchingProperties(records,{...defaultFilters(),...overrides}).map(item=>item.id);

test('bedrooms are exact, studio is zero, unknown is never zero and 8+ is explicit',()=>{
 const records=[
  make('unknown',{bedrooms:null},0),make('studio',{bedrooms:0},1),make('two',{bedrooms:2},2),
  make('three',{bedrooms:3},3),make('eight',{bedrooms:8},4),make('nine',{bedrooms:9},5),
 ];
 assert.deepEqual(matches(records,{bedrooms:['2']}),['two']);
 assert.deepEqual(matches(records,{bedrooms:['0']}),['studio']);
 assert.deepEqual(matches(records,{bedrooms:['8+']}),['eight','nine']);
 assert.deepEqual(matches(records,{bedrooms:['0','3']}),['studio','three']);
 assert.equal(numberFrom(''),null);
 assert.equal(numberFrom('   '),null);
 assert.equal(numberFrom(undefined),null);
 assert.equal(numberFrom('0'),0);
 assert.equal(numberFrom('invalid'),null);
});

test('purpose, new developments and archive status remain independent criteria',()=>{
 const records=[
  make('buy',{},0),make('rent',{purpose:'rent'},1),make('sold',{saleStatus:'Sold'},2),
  make('project',{isDevelopment:true,bedrooms:4},3),
  make('off-market',{saleStatus:'Off-market'},4),make('unknown',{purpose:'unknown'},5),
 ];
 assert.deepEqual(matches(records),['buy']);
 assert.deepEqual(matches(records,{purpose:'rent'}),['rent']);
 assert.deepEqual(matches(records,{purpose:'developments'}),['project']);
 assert.deepEqual(matches(records,{purpose:'developments',bedrooms:['4']}),[]);
 assert.deepEqual(matches(records,{purpose:'all'}),['buy','rent','project','unknown']);
 assert.deepEqual(matches(records,{purpose:'all',status:'archived'}),['sold','off-market']);
 assert.deepEqual(matches(records,{status:'sold'}),['sold']);
 assert.deepEqual(matches(records,{purpose:'all',status:'all'}),records.map(item=>item.id));
});

test('unknown or request-only prices stay visible until a price boundary is applied',()=>{
 const records=[
  make('unknown',{price:null},0),make('request',{price:0},1),
  make('low',{price:100},2),make('high',{price:200},3),
 ];
 assert.deepEqual(matches(records),['unknown','request','low','high']);
 assert.deepEqual(matches(records,{minPrice:'0'}),['low','high']);
 assert.deepEqual(matches(records,{maxPrice:'200'}),['low','high']);
 assert.deepEqual(matches(records,{minPrice:'100',maxPrice:'100'}),['low']);
 assert.deepEqual(matches(records,{minPrice:'201'}),[]);
 assert.deepEqual(matches(records,{maxPrice:'0'}),[]);
});

test('invalid price input cannot silently broaden the result set',()=>{
 for(const input of ['-1','1.5','1e3','Infinity','one million','9_000','9007199254740992']){
  assert.equal(money(input).valid,false,input);
  assert.ok(priceError({minPrice:input,maxPrice:''}),input);
  assert.deepEqual(matches([make('home')],{minPrice:input}),[],input);
 }
 assert.deepEqual(money('1,250,000'),{value:1250000,valid:true});
 assert.deepEqual(money('1 250 000'),{value:1250000,valid:true});
 assert.deepEqual(money(''),{value:null,valid:true});
 assert.match(priceError({minPrice:'200',maxPrice:'100'}),/maximum price/);
 assert.deepEqual(matches([make('home')],{minPrice:'200',maxPrice:'100'}),[]);
 assert.equal(priceError({minPrice:'100',maxPrice:'100'}),'');
});

test('features require every selection while property types combine as alternatives',()=>{
 const records=[
  make('both',{},0),make('pool-only',{features:['Pool']},1),
  make('balcony-only',{features:['Balcony'],type:'Villa'},2),
  make('accent',{features:['Póol','BALCONY'],type:'Villa'},3),
 ];
 assert.deepEqual(matches(records,{features:['Pool','Balcony']}),['both','accent']);
 assert.deepEqual(matches(records,{type:['Apartment','Villa'],features:['Pool']}),['both','pool-only','accent']);
 assert.deepEqual(matches(records,{type:['Villa'],features:['Pool','Balcony']}),['accent']);
});

test('search matches all normalized terms including the exact reference and community',()=>{
 const records=[
  make('first',{title:'Élite Palm Residence',reference:'LR-0123'},0),
  make('second',{title:'Elite Palm Residence',reference:'LR-0456',location:'Downtown'},1),
  make('third',{title:'City Residence',reference:'LR-0123',location:'Downtown'},2),
 ];
 assert.deepEqual(matches(records,{q:'  élite   LR-0123 '}),['first']);
 assert.deepEqual(matches(records,{q:'palm 2 bedroom'}),['first','second']);
 assert.deepEqual(matches(records,{location:'Palm Jumeirah'}),['first']);
 assert.deepEqual(matches(records,{q:'palm nonexistent'}),[]);
});

test('both price sort directions put unknown prices last and ties retain source order',()=>{
 const records=[
  make('unknown',{price:null},0),make('high',{price:200},1),make('low',{price:100},2),
  make('tie',{price:100},3),make('request',{price:0},4),
 ];
 assert.deepEqual(matches(records,{sort:'price-asc'}),['low','tie','high','unknown','request']);
 assert.deepEqual(matches(records,{sort:'price-desc'}),['high','low','tie','unknown','request']);
 assert.deepEqual(matches(records,{sort:'featured'}),records.map(item=>item.id));
 assert.deepEqual(records.map(item=>item.id),['unknown','high','low','tie','request'],'Sorting must not mutate source order');
});

test('URL serialization and parsing round-trip repeated criteria and a selected page',()=>{
 const records=[
  make('first',{},0),make('second',{purpose:'rent',type:'Villa',bedrooms:3,saleStatus:'Rented'},1),
 ];
 const options=filterOptions(records);
 const filters={...defaultFilters('rent'),q:'Palm terrace',location:'Palm Jumeirah',
  type:['Apartment','Villa'],bedrooms:['2','3'],features:['Balcony','Pool'],
  minPrice:'100000',maxPrice:'2500000',status:'all',sort:'price-desc',page:3};
 const url=serializeFilters(filters);
 const params=new URL(url,'https://example.test').searchParams;
 assert.deepEqual(params.getAll('type'),['Apartment','Villa']);
 assert.deepEqual(params.getAll('bedrooms'),['2','3']);
 assert.deepEqual(params.getAll('features'),['Balcony','Pool']);
 assert.equal(params.has('type[]'),false);
 assert.deepEqual(parseFilterParams(params,options),{filters,removed:false});
 assert.equal(serializeFilters(defaultFilters()),'/properties/');
 assert.equal(new URL(serializeFilters({...filters,minPrice:'100,000'}),'https://example.test').searchParams.get('minPrice'),'100000');
});

test('unknown URL options are removed but invalid price ranges stay reviewable',()=>{
 const options=filterOptions([make('home')]);
 const params=new URLSearchParams('purpose=other&type=Apartment&type=Unknown&bedrooms=2&bedrooms=99&features=Pool&features=Unknown&location=Unknown&status=unknown&sort=invalid&page=-2&minPrice=500&maxPrice=100&bogus=value');
 const parsed=parseFilterParams(params,options);
 assert.equal(parsed.removed,true);
 assert.equal(parsed.filters.purpose,'buy');
 assert.deepEqual(parsed.filters.type,['Apartment']);
 assert.deepEqual(parsed.filters.bedrooms,['2']);
 assert.deepEqual(parsed.filters.features,['Pool']);
 assert.equal(parsed.filters.location,'');
 assert.equal(parsed.filters.status,'current');
 assert.equal(parsed.filters.sort,'featured');
 assert.equal(parsed.filters.page,1);
 assert.equal(parsed.filters.minPrice,'500');
 assert.equal(parsed.filters.maxPrice,'100');
 assert.ok(priceError(parsed.filters));
 assert.deepEqual(matches([make('home')],parsed.filters),[]);
 const roundTrip=new URL(serializeFilters({...parsed.filters,minPrice:'wrong'}),'https://example.test');
 assert.equal(roundTrip.searchParams.get('minPrice'),'wrong');
});

test('draft copies cannot mutate applied array selections',()=>{
 const applied={...defaultFilters(),type:['Apartment'],bedrooms:['2'],features:['Pool']};
 const draft=copyFilters(applied);
 draft.type.push('Villa');draft.bedrooms.length=0;draft.features[0]='Balcony';
 assert.deepEqual(applied.type,['Apartment']);
 assert.deepEqual(applied.bedrooms,['2']);
 assert.deepEqual(applied.features,['Pool']);
});

test('the shared hero index preserves all 110 source IDs and classifies source availability without deleting records',()=>{
 assert.equal(source.length,110);
 const records=source.map(propertyFilterRecord);
 assert.deepEqual(records.map(item=>item.id),source.map(item=>item.id));
 assert.equal(new Set(records.map(item=>item.id)).size,110);
 assert.deepEqual(matches(records,{purpose:'all',status:'all'}),source.map(item=>item.id));
 assert.ok(records.some(item=>item.development));
 assert.ok(records.some(item=>item.status!=='current'));
 for(let index=0;index<source.length;index++){
  const input=source[index],record=records[index];
  assert.equal(record.price,input.price??null,input.id);
  assert.equal(record.bedrooms,input.isDevelopment?null:input.bedrooms??null,input.id);
  assert.deepEqual(record.features,input.features||[],input.id);
  if(input.saleStatus==='Sold')assert.equal(record.status,'sold',input.id);
  if(input.saleStatus==='Rented')assert.equal(record.status,'rented',input.id);
 }
});
