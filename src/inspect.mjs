import {validate,LIMITS,resolve} from './model.mjs';
import {parseJSON,format,ParseError} from './json.mjs';
export function indexLines(source,limits=LIMITS){
 if(typeof source!=='string'||source.length>limits.source||!source.isWellFormed())throw Error('Source exceeds text limits or contains unpaired literal surrogates.');
 const lines=[];let start=0,totalNodes=0;
 while(start<source.length){
  if(lines.length>=limits.lines)throw Error('Physical-line limit exceeded. No partial index was built.');
  const lf=source.indexOf('\n',start),end=lf<0?source.length:lf+1;
  const raw=source.slice(start,end),ending=lf<0?'':raw.endsWith('\r\n')?'\r\n':'\n',text=ending?raw.slice(0,-ending.length):raw;
  const row={line:lines.length+1,raw,text,ending,kind:'valid',message:'',column:null,duplicates:0};
  if(text.length>limits.line){row.kind='limited';row.message='Line-length limit exceeded.'}
  else if(/^[ \t\r]*$/.test(text)){row.kind='blank';row.message='Blank physical lines are not JSON values.'}
  else{
   try{
    const parsed=parseJSON(text,limits);totalNodes+=parsed.count;
    if(totalNodes>limits.totalNodes)throw Error('File value-node budget exceeded. No partial index was built.');
    Object.assign(row,parsed);
   }catch(error){
    if(!(error instanceof ParseError))throw error;
    row.kind=error.limited?'limited':'invalid';row.message=error.message;row.column=error.column;
   }
  }
  lines.push(row);start=end;
 }
 return lines;
}
export function matches(node,p){
 const result=resolve(node,p.pointer);
 if(p.operator==='all')return true;
 if(['present','missing','ambiguous'].includes(p.operator))return result.state===({present:'found',missing:'missing',ambiguous:'ambiguous'}[p.operator]);
 if(result.state!=='found')return false;
 if(p.operator==='type')return result.node.type===p.needle;
 if(result.node.type!=='string')return false;
 return p.operator==='contains'?result.node.value.includes(p.needle):result.node.value===p.needle;
}
export function inspect(input){
 const project=validate(input),lines=indexLines(project.source),valid=lines.filter(r=>r.kind==='valid');
 const rows=valid.filter(r=>matches(r.node,project));
 return {project,lines,rows,summary:{physical:lines.length,valid:valid.length,matched:rows.length,invalid:lines.filter(r=>r.kind==='invalid').length,blank:lines.filter(r=>r.kind==='blank').length,limited:lines.filter(r=>r.kind==='limited').length,duplicateRows:valid.filter(r=>r.duplicates>0).length}};
}
export function cell(row,pointer){
 const r=resolve(row.node,pointer);
 if(r.state!=='found')return {state:r.state,type:r.state,text:r.state};
 return {state:'found',type:r.node.type,text:r.node.type==='string'?r.node.value:format(r.node)};
}
export function role(row,pointer){
 const r=resolve(row.node,pointer);
 return r.state==='found'&&r.node.type==='string'&&['user','assistant'].includes(r.node.value)?r.node.value:'other';
}
export function page(items,index,size=20){
 const pages=Math.max(1,Math.ceil(items.length/size)),current=Math.max(0,Math.min(Number.isInteger(index)?index:0,pages-1));
 return {items:items.slice(current*size,(current+1)*size),current,pages};
}
