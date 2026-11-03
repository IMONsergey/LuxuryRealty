import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filmSource} from '../src/scripts/films.ts';
import {normaliseAgentContact} from '../src/data/agent-contact.ts';

// These checks compare the display catalogue with the independently captured
// source snapshot. They do not import or duplicate the normaliser's logic.
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const source = read('../src/data/source/listings.json');
const properties = read('../src/data/properties.json');
const projects = read('../src/data/catalogue-projects.json');
const sourceProjects = read('../src/data/source/projects.json');
const sourceArticles = read('../src/data/source/articles.json');
const summary = read('../src/data/import-summary.json');
const coverage = read('../docs/content-migration/coverage.json');
const receipts = read('../docs/content-migration/source-receipts.json');
const corrections = read('../docs/content-migration/verified-corrections.json');
const originals = new Map(source.map(record => [record.id, record]));
const displayed = new Map(properties.map(record => [record.id, record]));
const sorted = values => [...values].sort();
const ids = records => sorted(records.map(record => record.id));
const active = record => record.status === 'Listed';
const bedroomConflictIds = new Set(['one-of-a-kind-loft-designer-upgrade-sea-view', 'unique-duplex-breath-taking-sea-view']);

test('the snapshot accounts for all sitemap URLs and every additionally discovered public page', () => {
  assert.equal(coverage.sitemapUrls, 200);
  assert.equal(coverage.sitemapFetched, 200);
  assert.equal(coverage.sitemapLivePages, 101);
  assert.equal(coverage.sitemapNotFound, 99);
  assert.equal(coverage.additionalDiscoveredUrls, 30);
  assert.equal(coverage.additionalFetched, 30);
  assert.equal(receipts.length, 230);
  assert.equal(new Set(receipts.map(record => record.url)).size, 230);
  assert.equal(receipts.filter(record => record.httpStatus === 200).length, 131);
  assert.equal(receipts.filter(record => record.httpStatus === 404).length, 99);
  assert.deepEqual(coverage.unfetchedDiscoveredUrls, []);
  assert.equal(receipts.filter(record => ![200, 404].includes(record.httpStatus)).length, 0);
});

test('all 110 source records survive with their own identity, URL and exact HTML hash', () => {
  assert.equal(source.length, 110);
  assert.equal(originals.size, 110);
  assert.equal(properties.length, 110);
  assert.equal(displayed.size, 110);
  assert.deepEqual(ids(properties), ids(source));
  const successful = new Map(receipts.filter(record => record.httpStatus === 200).map(record => [record.url, record]));
  for (const property of properties) {
    const original = originals.get(property.id);
    assert.equal(property.sourceUrl, original.sourceUrl, property.id);
    assert.equal(property.sourceHash, original.sourceHash, property.id);
    assert.match(property.sourceHash, /^[a-f0-9]{64}$/, property.id);
    assert.equal(successful.get(property.sourceUrl)?.sha256, property.sourceHash, property.id);
    assert.equal(new URL(property.sourceUrl).pathname, '/properties/' + property.id, property.id);
    assert.ok(property.title.trim(), property.id);
    assert.ok(property.description.trim(), property.id);
    assert.notEqual(property.illustrative, true, property.id);
  }
});

test('price, area, bedroom count and missing bathroom count are never invented or converted', () => {
  for (const property of properties) {
    const original = originals.get(property.id);
    for (const [displayField, sourceField] of [['price', 'priceAED'], ['area', 'areaSqft'], ['bedrooms', 'beds'], ['bathrooms', 'baths']]) {
      if (displayField === 'bedrooms' && bedroomConflictIds.has(property.id)) {
        assert.equal(original.beds, 2, property.id + ' raw source must remain unchanged');
        assert.equal(property.bedrooms, null, property.id + ' conflicting count must remain unconfirmed');
      } else {
        assert.equal(property[displayField], original[sourceField], property.id + ' ' + displayField);
      }
      assert.ok(property[displayField] === null || Number.isFinite(property[displayField]), property.id + ' ' + displayField);
    }
    assert.equal(property.pricePeriod, original.pricePeriod, property.id + ' rental period');
    if (property.id === 'vela-dorchester-collection') {
      assert.equal(original.location, 'Palm Jumeirah', 'The inaccurate raw source is retained as evidence');
      assert.equal(property.location, 'Marasi Bay', 'Only this verified source error is corrected');
      const correction = corrections.find(item => item.id === property.id && item.field === 'location');
      assert.ok(correction, 'VELA location correction must retain its evidence');
      assert.equal(correction.sourceValue, original.location);
      assert.equal(correction.displayValue, property.location);
      assert.deepEqual(sorted(correction.evidence), sorted([
        'https://omniyat.com/residential/vela-dorchester-collection-dubai',
        'https://www.dorchestercollection.com/residences/vela',
      ]));
    } else {
      assert.equal(property.location, original.location, property.id + ' missing location must stay missing');
    }
    assert.equal(property.isDevelopment, original.isDevelopment, property.id + ' individual/development distinction');
    assert.equal(property.category, original.category, property.id);
    assert.equal(property.purpose, original.purpose, property.id);
    // The source has unreliable hand-entered metric and USD equivalents.
    assert.equal(property.areaSqm, undefined, property.id + ' unreliable sqm must not be added to public record');
    assert.equal(property.priceUSD, undefined, property.id + ' unreliable USD must not be added to public record');
  }
  assert.equal(properties.filter(record => record.isDevelopment).length, 9);
  assert.equal(properties.filter(record => !record.isDevelopment).length, 101);
  assert.equal(properties.filter(record => record.location === '').length, 8);
});

test('only the two documented 3BR/2-bedroom conflicts suppress their count and explain why', () => {
  const bedroomCorrections = corrections.filter(item => item.field === 'bedrooms');
  assert.deepEqual(sorted(bedroomCorrections.map(item => item.id)), sorted(bedroomConflictIds));
  assert.deepEqual(sorted(properties.filter(property => property.bedrooms === null).map(property => property.id)), sorted(bedroomConflictIds));
  for (const id of bedroomConflictIds) {
    const original = originals.get(id);
    const property = displayed.get(id);
    const correction = bedroomCorrections.find(item => item.id === id);
    assert.equal(original.beds, 2, id);
    assert.match(original.title, /\b3BR\b/i, id);
    assert.equal(property.bedrooms, null, id);
    assert.equal(correction.sourceValue, 2, id);
    assert.equal(correction.displayValue, null, id);
    assert.equal(correction.sourceHash, original.sourceHash, id);
    assert.equal(correction.sourceTitle, original.title, id);
    assert.equal(correction.status, 'unresolved-source-conflict', id);
    assert.equal(correction.action, 'suppressed-pending-confirmation', id);
    assert.deepEqual(correction.evidence, [original.sourceUrl], id);
    assert.deepEqual(property.dataNotes, ['Published details list both 2 and 3 bedrooms. Please confirm the layout with an advisor.'], id);
    assert.equal(property.price, original.priceAED, id + ' price must not change while bedroom count is suppressed');
    assert.equal(property.area, original.areaSqft, id + ' area must not change while bedroom count is suppressed');
  }
  for (const property of properties.filter(record => !bedroomConflictIds.has(record.id))) {
    assert.equal(property.bedrooms, originals.get(property.id).beds, property.id);
    assert.ok(!(property.dataNotes || []).includes('Published details list both 2 and 3 bedrooms. Please confirm the layout with an advisor.'), property.id + ' no unrelated bedroom-conflict note');
  }
  assert.equal(summary.bedroomCountsAwaitingConfirmation, 2);
});

test('sold, rented and currently listed records retain distinct purposes and archive states', () => {
  for (const property of properties) {
    const original = originals.get(property.id);
    assert.equal(property.status, original.status, property.id);
    assert.equal(property.saleStatus, original.saleStatus, property.id);
    if (property.status === 'Sold') assert.equal(property.purpose, 'buy', property.id);
    if (property.status === 'Rented') assert.equal(property.purpose, 'rent', property.id);
    if (property.purpose === 'rent') assert.equal(property.pricePeriod, 'year', property.id);
    else assert.equal(property.pricePeriod, null, property.id);
  }
  assert.equal(properties.filter(record => record.status === 'Sold').length, 17);
  assert.equal(properties.filter(record => record.status === 'Rented').length, 9);
  assert.equal(properties.filter(record => active(record) && record.purpose === 'buy' && !record.isDevelopment).length, 49);
  assert.equal(properties.filter(record => active(record) && record.purpose === 'rent').length, 26);
  assert.equal(summary.currentSales, 49);
  assert.equal(summary.currentRentals, 26);
  assert.equal(summary.archivedListings, 26);
});

test('independently checked sale, rental and archived examples retain exact published facts', () => {
  const cases = [
    ['palm-view-duplex-bespoke-garden-home', 'buy', 'Listed', 125000000, 6, 12014],
    ['1-of-1-branded-renovation-incredible-must-see', 'rent', 'Listed', 1750000, 2, 2727],
    ['furnished-palm-and-skyline-views-exclusive', 'buy', 'Sold', 25000000, 2, 2382],
    ['furnished-palm-skyline-views-exclusive-2', 'rent', 'Rented', 2000000, 2, 2382],
    ['one-of-a-kind-villa-unique-reimagined-layout', 'buy', 'Listed', 65000000, 5, 6702],
  ];
  for (const [id, purpose, status, price, bedrooms, area] of cases) {
    const property = displayed.get(id);
    assert.ok(property, id);
    assert.deepEqual([property.purpose, property.status, property.price, property.bedrooms, property.area], [purpose, status, price, bedrooms, area], id);
  }
  assert.equal(displayed.get('1-of-1-branded-renovation-incredible-must-see').sourceHash, 'aa95dbcb3f4ac982f7a3b6d4f37a96a2aecf71c9fe95e6c869618bcdbd0ffd1e');
});

test('each photo and video belongs to its own source listing; no repeated template gallery is substituted', () => {
  let photoReferences = 0;
  let recordsWithVideo = 0;
  const allPhotoUrls = new Set();
  for (const property of properties) {
    const original = originals.get(property.id);
    const originalPhotos = new Set([original.image, ...original.gallery].filter(Boolean));
    assert.ok(property.photos.length > 0, property.id);
    assert.equal(new Set(property.photos.map(photo => photo.image)).size, property.photos.length, property.id);
    assert.ok(originalPhotos.has(property.image), property.id + ' cover');
    assert.equal(property.photos[0].image, property.image, property.id + ' cover order');
    for (const photo of property.photos) {
      assert.ok(originalPhotos.has(photo.image), property.id + ' mismatched photo: ' + photo.image);
      assert.ok(photo.alt.trim(), property.id + ' photo alt');
      allPhotoUrls.add(photo.image);
      photoReferences += 1;
    }
    assert.deepEqual(sorted(property.photos.map(photo => photo.image)), sorted(originalPhotos), property.id + ' missing source gallery asset');
    assert.deepEqual(sorted(property.videos.map(video => video.url)), sorted(original.videos.map(video => video.url)), property.id + ' video URLs');
    for (const video of property.videos) {
      assert.equal(video.type, 'video', property.id);
      assert.ok(['vimeo.com', 'youtu.be', 'www.youtube.com', 'youtube.com'].includes(new URL(video.url).hostname), property.id + ' unexpected video provider');
      assert.equal(Object.hasOwn(video, 'html'), false, property.id + ' source embed HTML must not be rendered');
    }
    if (property.videos.length) recordsWithVideo += 1;
  }
  assert.equal(photoReferences, 2083);
  assert.equal(allPhotoUrls.size, 1803);
  assert.equal(recordsWithVideo, 54);
});

test('separate sale and rental offers are not collapsed merely because their descriptions or images match', () => {
  const pairs = [
    ['brand-new-sea-and-palm-view-corner-unit', 'brand-new-sea-and-palm-view-corner-unit-2'],
    ['brand-new-vacant-sea-and-sunset-views', 'brand-new-vacant-sea-and-sunset-views-2'],
    ['ultra-luxury-super-rare-dual-view-residence', 'must-be-viewed-rare-2br-sea-and-skyline-views'],
  ];
  for (const [saleId, rentalId] of pairs) {
    const sale = displayed.get(saleId);
    const rental = displayed.get(rentalId);
    assert.ok(sale && rental, saleId + ' / ' + rentalId);
    assert.notEqual(sale.id, rental.id);
    assert.equal(sale.purpose, 'buy');
    assert.equal(rental.purpose, 'rent');
    assert.notEqual(sale.price, rental.price);
    assert.equal(sale.pricePeriod, null);
    assert.equal(rental.pricePeriod, 'year');
  }
});

test('Six Senses Palm residences cannot inherit the Dubai Marina project association', () => {
  const palm = source.filter(record => /six senses/i.test(record.building) && /palm/i.test(record.location));
  assert.ok(palm.length > 0, 'The source snapshot must contain Palm examples for this regression');
  for (const original of palm) assert.notEqual(displayed.get(original.id).projectId, 'six-senses', original.id);
  assert.equal(displayed.get('six-senses-residences-dubai-marina').projectId, 'six-senses');
  // This source building omits the word Serenity, but its exact source slug,
  // title and developer video identify the matching editorial project page.
  assert.equal(displayed.get('serenity-mansions-waterfront-collection').projectId, 'serenity-mansions-waterfront-collection');
  for (const property of properties.filter(record => record.projectId === 'six-senses')) {
    const original = originals.get(property.id);
    assert.match(original.building + ' ' + original.location, /marina/i, property.id);
    assert.doesNotMatch(original.location, /palm/i, property.id);
  }
  const validIds = new Set(projects.map(project => project.id));
  for (const property of properties) if (property.projectId) assert.ok(validIds.has(property.projectId), property.id);
  assert.equal(displayed.get('one-at-palm-jumeirah-dorchester-collection').projectId, undefined);
});

test('project records exclude the source template and retain exact source provenance', () => {
  assert.equal(projects.length, 7);
  assert.equal(new Set(projects.map(project => project.id)).size, 7);
  assert.ok(projects.every(project => project.id !== 'template'));
  const eligible = new Map(sourceProjects.filter(project => project.publicationEligible).map(project => [project.sourceUrl, project]));
  assert.deepEqual(sorted(projects.map(project => project.sourceUrl)), sorted(eligible.keys()));
  for (const project of projects) {
    const original = eligible.get(project.sourceUrl);
    assert.equal(project.sourceHash, original.sourceHash, project.id);
    const originalImages = new Set([...original.gallery, ...original.hero.images]);
    assert.ok(originalImages.has(project.image), project.id + ' cover provenance');
    assert.doesNotMatch(decodeURIComponent(project.image), /\.svg|placeholder|logo|white@2x|google-map/i, project.id + ' cover cannot be a logo, template or map');
    for (const photo of project.photos) {
      assert.ok(originalImages.has(photo.image), project.id + ' photo provenance');
      assert.doesNotMatch(decodeURIComponent(photo.image), /\.svg|placeholder|logo|white@2x|google-map/i, project.id + ' gallery cannot include a logo, template or map');
    }
  }
  assert.equal(sourceArticles.length, 4);
  assert.ok(sourceArticles.every(article => article.publicationEligible === false), 'Mismatched source articles must remain archived');
});

test('imported descriptions have no executable markup or copied legacy embed code', () => {
  for (const property of properties) {
    assert.doesNotMatch(property.descriptionHtml, /<(?:script|style|iframe|object|embed|form|input|button|svg)\b/i, property.id);
    assert.doesNotMatch(property.descriptionHtml, /\son[a-z]+\s*=/i, property.id);
    assert.doesNotMatch(property.descriptionHtml, /(?:javascript|data|vbscript)\s*:/i, property.id);
    assert.doesNotMatch(property.descriptionHtml, /Luxury Residences/, property.id + ' public rebrand');
  }
});

test('every sourced film is supported and the real unlisted Vimeo path hash survives embedding', () => {
  const original = originals.get('dual-views-highest-floor-huge-layout');
  const privateVideo = original.videos.find(video => video.url.includes('/1128807572/259431719b'));
  assert.ok(privateVideo, 'Keep the real source example that exposed the missing Vimeo hash');
  const rendered = filmSource(privateVideo.url);
  assert.ok(rendered);
  assert.equal(rendered.kind, 'iframe');
  const embed = new URL(rendered.url);
  assert.equal(embed.hostname, 'player.vimeo.com');
  assert.equal(embed.pathname, '/video/1128807572');
  assert.equal(embed.searchParams.get('h'), '259431719b');
  for (const property of properties) {
    for (const video of property.videos) {
      assert.equal(filmSource(video.url)?.kind, 'iframe', property.id + ' unsupported source film');
    }
  }
});


test('team WhatsApp actions use the verified international phone and preserve the raw source', () => {
  const agents = read('../src/data/source/agents.json');
  const original = JSON.stringify(agents);
  const published = new Map(agents.map(agent => [agent.name, normaliseAgentContact(agent)]));
  assert.deepEqual(published.get('Tyrese Kandler'), {phone: '+971542777751', whatsapp: 'https://wa.me/971542777751'});
  assert.equal(agents.find(agent => agent.name === 'Tyrese Kandler').whatsapp, 'https://wa.me/542777751', 'Keep the incorrect original URL as provenance');
  assert.deepEqual(published.get('Matthew Cooke'), {phone: null, whatsapp: null}, 'The source telephone with an extra digit must remain unavailable');
  assert.equal(published.get('Nhea Mestio').whatsapp, 'https://wa.me/971551572197');
  assert.equal(published.get('Sabeeha Bham').whatsapp, 'https://wa.me/971564530078');
  const reachable = [...published.values()].filter(contact => contact.whatsapp);
  assert.equal(reachable.length, 6);
  for (const contact of reachable) {
    const url = new URL(contact.whatsapp);
    assert.equal(url.origin, 'https://wa.me');
    assert.equal(url.pathname, '/' + contact.phone.slice(1));
    assert.match(url.pathname, /^\/971[1-9]\d{7,8}$/);
  }
  assert.equal(JSON.stringify(agents), original, 'Normalization must not change the captured source');
});

test('agent contact normalization does not guess missing country codes or unconfirmed channels', () => {
  for (const phone of [null, '', '542777751', '+9715025402880', '+9710542777751', '+44 7700 900123']) {
    assert.deepEqual(normaliseAgentContact({phone, whatsapp: 'https://wa.me/542777751'}), {phone: null, whatsapp: null}, String(phone));
  }
  assert.deepEqual(normaliseAgentContact({phone: '+971542777751', whatsapp: 'https://wa.me/542777751', issues: ['source-phone-awaiting-confirmation']}), {phone: null, whatsapp: null});
  for (const whatsapp of [null, '', 'javascript:alert(1)', 'https://wa.me.evil.test/971542777751', 'https://example.com/971542777751']) {
    assert.deepEqual(normaliseAgentContact({phone: '+971542777751', whatsapp}), {phone: '+971542777751', whatsapp: null}, String(whatsapp));
  }
});
