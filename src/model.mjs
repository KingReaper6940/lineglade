export const LIMITS=Object.freeze({source:1000000,lines:5000,line:100000,depth:32,nodes:5000,totalNodes:100000});
export const OPERATORS=['all','present','missing','ambiguous','contains','equals','type'];
const keys=['schema','title','source','columns','pointer','operator','needle','rolePointer','notes'];
export function pointerTokens(p){
 if(typeof p!=='string'||p.length>256)throw Error('Pointers must be strings of at most 256 characters.');
 if(p==='')return [];
 if(!p.startsWith('/')||/~(?![01])/u.test(p))throw Error('Use JSON Pointer: empty for root, or /field with ~0 and ~1 escapes.');
 return p.slice(1).split('/').map(s=>s.replaceAll('~1','/').replaceAll('~0','~'));
}
export function validate(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join('|')!==keys.slice().sort().join('|')||p.schema!=='lineglade/1')throw Error('Expected a Lineglade version 1 project with the documented fields.');
 for(const [k,n] of [['title',100],['source',LIMITS.source],['needle',512],['notes',4000]])if(typeof p[k]!=='string'||p[k].length>n)throw Error(k+' exceeds its text limit.');
 if(!p.source.isWellFormed())throw Error('Source contains an unpaired UTF-16 surrogate. Use escaped JSON strings instead.');
 if(!Array.isArray(p.columns)||p.columns.length<1||p.columns.length>6||new Set(p.columns).size!==p.columns.length)throw Error('Choose 1–6 unique JSON Pointer columns.');
 p.columns.forEach(pointerTokens);pointerTokens(p.pointer);pointerTokens(p.rolePointer);
 if(!OPERATORS.includes(p.operator))throw Error('Unknown filter operation.');
 if(p.operator==='type'&&!['object','array','string','number','boolean','null'].includes(p.needle))throw Error('Type must be object, array, string, number, boolean or null.');
 return structuredClone(p);
}
export function resolve(node,pointer){
 for(const token of pointerTokens(pointer)){
  if(node.type==='object'){
   const matches=node.entries.filter(e=>e.key===token);
   if(matches.length>1)return {state:'ambiguous'};
   if(!matches.length)return {state:'missing'};
   node=matches[0].value;
  }else if(node.type==='array'&&/^(0|[1-9][0-9]*)$/.test(token)&&Number(token)<node.items.length){
   node=node.items[Number(token)];
  }else return {state:'missing'};
 }
 return {state:'found',node};
}
