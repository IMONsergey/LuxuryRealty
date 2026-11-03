import test from 'node:test';
import assert from 'node:assert/strict';
import {filmSource} from '../src/scripts/films.ts';

test('retains the actual unlisted Vimeo path hash in the provider embed',()=>{
 const source=filmSource('https://vimeo.com/1128807572/259431719b?fl=pl&fe=sh');
 assert.equal(source.kind,'iframe');
 const url=new URL(source.url);
 assert.equal(url.origin,'https://player.vimeo.com');
 assert.equal(url.pathname,'/video/1128807572');
 assert.equal(url.searchParams.get('h'),'259431719b');
 assert.equal(url.searchParams.get('dnt'),'1');
});
test('retains explicit Vimeo h parameter and does not embed another origin',()=>{
 assert.equal(new URL(filmSource('https://player.vimeo.com/video/1128807572?h=abc123').url).searchParams.get('h'),'abc123');
 for(const bad of ['javascript:alert(1)','https://vimeo.com.evil.test/1128807572','https://example.com/video/1128807572','https://www.youtube.com/embed/no','http://vimeo.com/1128807572'])assert.equal(filmSource(bad),null);
});
test('normalises source YouTube watch links to the same film on the privacy host',()=>{
 const source=filmSource('https://www.youtube.com/watch?v=JDN5g17B2m0');
 assert.equal(new URL(source.url).origin,'https://www.youtube-nocookie.com');
 assert.equal(new URL(source.url).pathname,'/embed/JDN5g17B2m0');
});
