export interface AgentContactSource {
 phone?:string|null;
 whatsapp?:string|null;
 issues?:readonly string[];
}
export interface AgentContact {phone:string|null;whatsapp:string|null;}

/** Use the independently published UAE telephone, never repair a local number by guessing a country. */
export function normaliseAgentContact(source:AgentContactSource):AgentContact {
 const phone=(source.phone||'').trim();
 if(source.issues?.some(issue=>/phone/i.test(issue))||!/^\+971[1-9]\d{7,8}$/.test(phone))return {phone:null,whatsapp:null};
 let whatsapp:string|null=null;
 try {
  const original=new URL(source.whatsapp||'');
  // A source WhatsApp action establishes the channel; the verified telephone
  // supplies its international digits. Do not invent a channel when absent.
  if(original.origin==='https://wa.me'&&/^\/\+?\d+\/?$/.test(original.pathname))whatsapp='https://wa.me/'+phone.slice(1);
 } catch {/* An absent or malformed source channel has no public action. */}
 return {phone,whatsapp};
}
