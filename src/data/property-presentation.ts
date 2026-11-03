/** Only these two source headings need a case correction; branded names stay untouched. */
const titleCaseOverrides:Readonly<Record<string,string>>={
 'EXCEPTIONAL 3BR-LOFT | DESIGNER UPGRADE | SEA VIEW':'Exceptional 3BR-loft | Designer upgrade | Sea view',
 'UPGRADED 2BR | MARINA VIEW | INVESTOR DEAL':'Upgraded 2BR | Marina view | Investor deal',
};

/** Separate the source headline from its supporting phrases without rewriting facts. */
export function propertyPresentation(title:string):{heading:string;detail:string;label:string} {
 const displayTitle=titleCaseOverrides[title]||title;
 const parts=displayTitle.split('|').map(part=>part.replace(/\s+/g,' ').trim()).filter(Boolean);
 return {
  heading:parts[0]||displayTitle.trim(),
  detail:parts.slice(1).join(' · '),
  label:parts.join(' · ')||displayTitle.trim(),
 };
}
