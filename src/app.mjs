import {validate} from './model.mjs';
import {inspect,cell,role,page} from './inspect.mjs';
import {format} from './json.mjs';
import {example} from './example.mjs';
import {matchedJSONL,projectJSON,reportJSON,reportHTML,summarySVG} from './exports.mjs';
import {readUTF8,downloads} from './files.mjs';
export function mount(document,options={}){
 const $=id=>document.getElementById(id),save=options.save||downloads(document).save;
 let result=null,original='',index=0,diagIndex=0,revision=0,fresh=false;
 const exportButtons=[...document.querySelectorAll('[data-export]')];
 function status(text,kind=''){ $('status').textContent=text;$('status').className=kind }
 function stale(){
  revision++;fresh=false;exportButtons.forEach(b=>b.disabled=true);
  $('freshness').textContent=result?'VIEW IS STALE':'NOT BUILT';
  status(result?'Source or settings changed. Previous results are stale; inspect again to enable exports.':'Ready to inspect.','stale');
 }
 function read(){
  const entered=$('source').value;
  return validate({schema:'lineglade/1',title:$('title').value,source:entered===original.replaceAll('\r\n','\n')?original:entered,columns:JSON.parse($('columns').value),pointer:$('pointer').value,operator:$('operator').value,needle:$('needle').value,rolePointer:$('role-pointer').value,notes:$('notes').value});
 }
 function detail(r){
  $('detail-meta').textContent='Line '+r.line+' · '+r.kind+(r.duplicates?' · '+r.duplicates+' duplicate name(s)':'');
  $('raw').textContent=r.raw;$('pretty').textContent=r.kind==='valid'?format(r.node,true):r.message;
 }
 function node(tag,text,cls){const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n}
 function render(){
  const s=result.summary;$('metrics').replaceChildren(...[['matching',s.matched],['valid',s.valid],['diagnostics',s.invalid+s.blank+s.limited+s.duplicateRows]].map(([label,value])=>{const d=document.createElement('div');d.append(node('strong',value),node('span',label));return d}));
  const head=document.querySelector('#records thead'),body=document.querySelector('#records tbody'),tr=document.createElement('tr');
  for(const text of ['Line',...result.project.columns.map(p=>p||'(root)')]){const th=node('th',text);th.scope='col';tr.append(th)}
  head.replaceChildren(tr);body.replaceChildren();
  const slice=page(result.rows,index);index=slice.current;
  for(const r of slice.items){
   const row=document.createElement('tr'),td=document.createElement('td'),button=node('button',r.line,'line-button');
   button.type='button';button.setAttribute('aria-label','Open line '+r.line);button.addEventListener('click',()=>detail(r));td.append(button);
   const label=role(r,result.project.rolePointer);row.dataset.role=label;
   if(label!=='other')td.append(node('span',label,'role-tag'));row.append(td);
   for(const p of result.project.columns){
    const v=cell(r,p),c=document.createElement('td');c.append(node('span',v.type,'cell-type'),node('span',v.text.slice(0,280)+(v.text.length>280?' … [open line for full value]':'')));row.append(c);
   }
   body.append(row);
  }
  $('empty').hidden=result.rows.length>0;$('empty').textContent='No matching records. Check the filter and diagnostics.';
  $('page').textContent='Page '+(index+1)+' of '+slice.pages+' · 20 per page';$('prev').disabled=index===0;$('next').disabled=index>=slice.pages-1;
  const issues=result.lines.filter(r=>r.kind!=='valid'||r.duplicates);
  $('diagnostic-count').textContent=issues.length+' ISSUE ROWS';
  const dpage=page(issues,diagIndex);diagIndex=dpage.current;
  $('diagnostics').replaceChildren(...dpage.items.map(r=>{const li=document.createElement('li');li.append(node('strong','Line '+r.line+' · '+r.kind),node('span',r.message+(r.column?' Column '+r.column+'.':'')+(r.duplicates?' Duplicate object names: '+r.duplicates+'.':' ')));const b=node('button','Inspect line','line-button');b.type='button';b.addEventListener('click',()=>detail(r));li.append(b);return li}));
  if(!issues.length)$('diagnostics').append(node('li','No invalid, blank, limited or duplicate-key rows.'));
  $('diag-page').textContent='Page '+(diagIndex+1)+' of '+dpage.pages;$('diag-prev').disabled=diagIndex===0;$('diag-next').disabled=diagIndex>=dpage.pages-1;
 }
 function build(p){
  const next=inspect(p);result=next;original=next.project.source;index=0;diagIndex=0;fresh=true;revision++;
  exportButtons.forEach(b=>b.disabled=false);$('freshness').textContent='CURRENT';render();
  $('detail-meta').textContent='Choose a line';$('pretty').textContent='No record selected.';$('raw').textContent='No record selected.';
  if(next.rows.length)detail(next.rows[0]);
  status(next.summary.matched+' matching records. '+(next.summary.invalid+next.summary.blank+next.summary.limited)+' excluded diagnostic lines. All exports contain full data.');
 }
 function install(p){
  const valid=validate(p);
  const next=inspect(valid); // Validate completely before replacing a user's workspace.
  for(const k of ['title','source','pointer','operator','needle','notes'])$(k).value=valid[k];
  $('columns').value=JSON.stringify(valid.columns);$('role-pointer').value=valid.rolePointer;
  build(next.project);
 }
 $('settings').addEventListener('input',stale);
 $('settings').addEventListener('change',stale);
 $('settings').addEventListener('submit',e=>{e.preventDefault();try{build(read())}catch(error){stale();status(error.message+' Previous view, if any, is stale.','error')}});
 $('example').addEventListener('click',()=>install(example));
 $('clear').addEventListener('click',()=>install({...example,title:'',source:'',notes:''}));
 for(const [id,isProject] of [['source-file',false],['project-file',true]]){
  $(id).addEventListener('change',async()=>{
   const file=$(id).files?.[0];if(!file)return;
   const token=++revision;status('Reading file locally…');
   try{
    const text=await readUTF8(file,isProject?28000000:4000000);
    if(token!==revision)return;
    if(isProject){
     if(text.length>7000000)throw Error('Project exceeds 7,000,000 text units.');
     install(JSON.parse(text));
    }else{
     // Current settings still need to be valid before an imported file replaces source.
     const p=read();p.source=text;install(p);
    }
   }catch(error){if(token===revision)status('File was not imported: '+error.message,'error')}
   finally{$(id).value=''}
  });
 }
 for(const [id,kind,delta] of [['prev','match',-1],['next','match',1],['diag-prev','diag',-1],['diag-next','diag',1]]){
  $(id).addEventListener('click',()=>{if(!result)return;if(kind==='match')index+=delta;else diagIndex+=delta;render()});
 }
 const exporters={
  matched:['matches.jsonl','application/x-ndjson;charset=utf-8',matchedJSONL],
  project:['lineglade-project.json','application/json;charset=utf-8',projectJSON],
  report:['lineglade-report.json','application/json;charset=utf-8',reportJSON],
  html:['lineglade-report.html','text/html;charset=utf-8',reportHTML],
  svg:['lineglade-summary.svg','image/svg+xml;charset=utf-8',summarySVG],
  source:['original.jsonl','application/x-ndjson;charset=utf-8',r=>r.project.source]
 };
 for(const b of exportButtons)b.addEventListener('click',()=>{
  if(!fresh||!result)return;
  try{const [name,type,fn]=exporters[b.dataset.export];save(name,type,fn(result));status('Downloaded '+name+'. Includes full records; review before sharing.')}
  catch(error){status('Download failed: '+error.message,'error')}
 });
 return {install,getResult:()=>result,isFresh:()=>fresh};
}
if(typeof document!=='undefined')mount(document);
