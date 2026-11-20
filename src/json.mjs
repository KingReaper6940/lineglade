import {LIMITS} from './model.mjs';
export class ParseError extends Error{
 constructor(message,column,limited=false){super(message);this.column=column;this.limited=limited;}
}
// A syntax tree keeps number tokens and duplicate object names intact.
export function parseJSON(text,limits=LIMITS){
 let i=0,count=0,duplicates=0;
 const fail=(message,limited=false)=>{throw new ParseError(message,i+1,limited)};
 const ws=()=>{while(i<text.length&&/[ \t\r\n]/.test(text[i]))i++};
 function string(){
  const start=i++;
  while(i<text.length){
   const c=text.charCodeAt(i++);
   if(c===34)return JSON.parse(text.slice(start,i));
   if(c<32)fail('Unescaped control character in string.');
   if(c===92){
    if(i>=text.length)fail('Incomplete escape.');
    const escape=text[i++];
    if(escape==='u'){
     if(!/^[0-9a-fA-F]{4}$/.test(text.slice(i,i+4)))fail('Expected four hexadecimal digits.');
     i+=4;
    }else if(!'"\\/bfnrt'.includes(escape))fail('Invalid string escape.');
   }
  }
  fail('Unterminated string.');
 }
 function value(depth){
  ws();if(depth>limits.depth)fail('Nesting limit exceeded.',true);
  if(++count>limits.nodes)fail('Value-node limit exceeded.',true);
  const c=text[i];
  if(c==='"')return {type:'string',value:string()};
  if(c==='{'||c==='['){
   i++;ws();const object=c==='{',close=object?'}':']',items=[],entries=[],seen=new Set();
   if(text[i]===close){i++;return object?{type:'object',entries}:{type:'array',items}}
   for(;;){
    if(object){
     ws();if(text[i]!=='"')fail('Expected a quoted object name.');
     const key=string();ws();if(text[i++]!==':')fail('Expected a colon after the object name.');
     if(seen.has(key))duplicates++;seen.add(key);
     entries.push({key,value:value(depth+1)});
    }else items.push(value(depth+1));
    ws();if(text[i]===close){i++;break}
    if(text[i++]!==',')fail('Expected a comma or closing bracket.');
   }
   return object?{type:'object',entries}:{type:'array',items};
  }
  for(const [word,type,v] of [['true','boolean',true],['false','boolean',false],['null','null',null]]){
   if(text.startsWith(word,i)){i+=word.length;return {type,value:v}}
  }
  const m=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));
  if(m){i+=m[0].length;return {type:'number',raw:m[0]}}
  fail('Expected a JSON value.');
 }
 const node=value(0);ws();if(i!==text.length)fail('Unexpected text after the JSON value.');
 return {node,count,duplicates};
}
export function format(node,pretty=false,level=0){
 const indent=n=>pretty?'  '.repeat(n):'',sep=pretty?'\n':'',space=pretty?' ':'';
 if(node.type==='number')return node.raw;
 if(node.type==='string'||node.type==='boolean'||node.type==='null')return JSON.stringify(node.value);
 const object=node.type==='object',entries=object?node.entries:node.items;
 if(!entries.length)return object?'{}':'[]';
 const body=entries.map(e=>indent(level+1)+(object?JSON.stringify(e.key)+':'+space+format(e.value,pretty,level+1):format(e,pretty,level+1))).join(','+sep);
 return (object?'{':'[')+sep+body+sep+indent(level)+(object?'}':']');
}
