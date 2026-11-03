import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {propertyPresentation} from '../src/data/property-presentation.ts';

const properties=JSON.parse(readFileSync(new URL('../src/data/properties.json',import.meta.url),'utf8'));
const words=value=>value.replace(/[|·]/g,' ').replace(/\s+/g,' ').trim();
const approvedCaseTitles=new Map([
 ['EXCEPTIONAL 3BR-LOFT | DESIGNER UPGRADE | SEA VIEW','Exceptional 3BR-loft | Designer upgrade | Sea view'],
 ['UPGRADED 2BR | MARINA VIEW | INVESTOR DEAL','Upgraded 2BR | Marina view | Investor deal'],
]);

test('property headings separate source qualifiers and only correct two reviewed uppercase headings',()=>{
 assert.deepEqual(propertyPresentation('Palm View | Duplex Bespoke Garden Home'),{heading:'Palm View',detail:'Duplex Bespoke Garden Home',label:'Palm View · Duplex Bespoke Garden Home'});
 assert.deepEqual(propertyPresentation('EXCEPTIONAL 3BR-LOFT | DESIGNER UPGRADE | SEA VIEW'),{heading:'Exceptional 3BR-loft',detail:'Designer upgrade · Sea view',label:'Exceptional 3BR-loft · Designer upgrade · Sea view'});
 assert.deepEqual(propertyPresentation('UPGRADED 2BR | MARINA VIEW | INVESTOR DEAL'),{heading:'Upgraded 2BR',detail:'Marina view · Investor deal',label:'Upgraded 2BR · Marina view · Investor deal'});
 assert.deepEqual(propertyPresentation('ORLA | VELA | 3BR | 2BR'),{heading:'ORLA',detail:'VELA · 3BR · 2BR',label:'ORLA · VELA · 3BR · 2BR'});
});

test('all 110 titles retain every word and punctuation, allowing only the two approved case corrections',()=>{
 assert.equal(properties.length,110);
 assert.equal(properties.filter(property=>approvedCaseTitles.has(property.title)).length,2);
 for(const property of properties){
  const display=propertyPresentation(property.title);
  const expected=approvedCaseTitles.get(property.title)||property.title;
  if(approvedCaseTitles.has(property.title))assert.equal(expected.toLowerCase(),property.title.toLowerCase(),'The approved correction changes case only: '+property.id);
  assert.ok(display.heading,property.id);
  assert.equal(words([display.heading,display.detail].filter(Boolean).join(' ')),words(expected),property.id);
  assert.equal(words(display.label),words(expected),property.id);
  assert.ok(!display.label.includes('|'),property.id);
 }
});
