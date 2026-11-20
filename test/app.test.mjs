import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {mount} from '../src/app.mjs';
import {example} from '../src/example.mjs';
import {readUTF8,downloads} from '../src/files.mjs';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function setup(){const dom=new JSDOM(html),saved=[];const app=mount(dom.window.document,{save:(...args)=>saved.push(args)});return {dom,d:dom.window.document,app,saved}}
function submit(t){t.d.querySelector('#settings').dispatchEvent(new t.dom.window.Event('submit',{cancelable:true,bubbles:true}))}
function edit(t,id,value){t.d.getElementById(id).value=value;t.d.getElementById(id).dispatchEvent(new t.dom.window.Event('input',{bubbles:true}))}
test('simulated workspace builds sample, wraps data as literal text and exposes all exports',()=>{
 const t=setup();t.d.querySelector('#example').click();
 assert.equal(t.app.getResult().summary.matched,5);assert.equal(t.d.querySelectorAll('#records tbody tr').length,5);
 for(const b of t.d.querySelectorAll('[data-export]')){assert.equal(b.disabled,false);b.click()}
 assert.equal(t.saved.length,6);assert.ok(t.saved[0][2].includes('9007199254740993'));assert.ok(t.saved[0][2].includes('\r\n'));
 assert.ok(t.d.querySelector('tr[data-role="user"]'));assert.ok(t.d.querySelector('#pretty').textContent.includes('9007199254740993'));
 t.dom.window.close();
});
test('metadata-only edits preserve CRLF; changed source uses entered textarea text',()=>{
 const t=setup();t.app.install(example);edit(t,'title','Updated');submit(t);assert.equal(t.app.getResult().project.source,example.source);
 edit(t,'source','{}\nnull\n');submit(t);assert.equal(t.app.getResult().project.source,'{}\nnull\n');t.dom.window.close();
});
test('failed settings and dirty drafts invalidate downloads without replacing prior results',()=>{
 const t=setup();t.app.install(example);const before=t.app.getResult();edit(t,'columns','["/~x"]');
 assert.equal(t.app.isFresh(),false);submit(t);assert.equal(t.app.getResult(),before);assert.match(t.d.getElementById('status').textContent,/stale/);
 for(const b of t.d.querySelectorAll('[data-export]'))assert.equal(b.disabled,true);
 edit(t,'columns','["/content"]');submit(t);assert.equal(t.app.isFresh(),true);t.dom.window.close();
});
test('full record detail and exports exceed cell preview without HTML execution',()=>{
 const t=setup(),source=JSON.stringify({content:'<img src=x onerror=alert(1)>'+ 'z'.repeat(500)});
 t.app.install({...example,source});
 assert.match(t.d.querySelector('#records tbody').textContent,/open line for full value/);
 assert.equal(t.d.querySelectorAll('#records img').length,0);assert.ok(t.d.getElementById('pretty').textContent.includes('z'.repeat(500)));
 t.d.querySelector('[data-export=matched]').click();assert.equal(t.saved[0][2],source);t.dom.window.close();
});
test('table and diagnostics pagination access all physical rows',()=>{
 const t=setup();t.app.install({...example,source:Array.from({length:42},(_,i)=>i%2?'bad':JSON.stringify({id:i})).join('\n')});
 t.d.getElementById('next').click();assert.match(t.d.querySelector('#records tbody').textContent,/41/);
 t.d.getElementById('diag-next').click();assert.match(t.d.getElementById('diagnostics').textContent,/Line 42/);
 t.d.getElementById('clear').click();assert.equal(t.app.getResult().summary.physical,0);t.dom.window.close();
});
test('an in-flight import cannot overwrite a later edit or clear',async()=>{
 const t=setup();t.app.install(example);let release;
 const file={size:2,arrayBuffer:()=>new Promise(r=>{release=r})};
 Object.defineProperty(t.d.getElementById('source-file'),'files',{configurable:true,value:[file]});
 t.d.getElementById('source-file').dispatchEvent(new t.dom.window.Event('change'));
 edit(t,'notes','Keep this draft');release(new TextEncoder().encode('{}').buffer);
 await new Promise(r=>setTimeout(r,0));assert.equal(t.d.getElementById('notes').value,'Keep this draft');assert.equal(t.app.getResult().project.source,example.source);
 t.dom.window.close();
});
test('valid file import and invalid project import are atomic',async()=>{
 const t=setup();t.app.install(example);
 for(const [id,text] of [['source-file','{"id":9007199254740993}\r\n'],['project-file','{"schema":"wrong"}']]){
  const bytes=new TextEncoder().encode(text);
  Object.defineProperty(t.d.getElementById(id),'files',{configurable:true,value:[{size:bytes.length,arrayBuffer:async()=>bytes.buffer}]});
  t.d.getElementById(id).dispatchEvent(new t.dom.window.Event('change'));await new Promise(r=>setTimeout(r,0));
 }
 assert.equal(t.app.getResult().project.source,'{"id":9007199254740993}\r\n');assert.match(t.d.getElementById('status').textContent,/not imported/);t.dom.window.close();
});
test('UTF8 boundary rejects malformed bytes, caps files, retains BOM for diagnosis',async()=>{
 await assert.rejects(()=>readUTF8({size:10},5),/size/);
 await assert.rejects(()=>readUTF8({size:1,arrayBuffer:async()=>new Uint8Array([255]).buffer},5));
 assert.equal(await readUTF8({size:5,arrayBuffer:async()=>new Uint8Array([239,187,191,123,125]).buffer},5),'\ufeff{}');
});
test('actual Blob exporter emits exact UTF8 payloads and revokes object URLs',async()=>{
 const t=setup(),oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,captured=[],revoked=[];
 URL.createObjectURL=blob=>{captured.push(blob);return 'blob:test'+captured.length};URL.revokeObjectURL=url=>revoked.push(url);
 t.dom.window.HTMLAnchorElement.prototype.click=function(){};
 try{const d=downloads(t.d);d.save('x.jsonl','text/plain','9007199254740993\r\n');assert.equal(await captured[0].text(),'9007199254740993\r\n');d.save('y','text/plain','y');d.dispose();assert.deepEqual(revoked,['blob:test1','blob:test2']);assert.equal(t.d.querySelectorAll('a[download]').length,0)}
 finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;t.dom.window.close()}
});
test('labels, live status, skip target and responsive styles exist (not native visual QA)',async()=>{
 const t=setup();
 for(const e of t.d.querySelectorAll('input:not([type=file]),textarea,select'))assert.ok(t.d.querySelector('label[for="'+e.id+'"]'),e.id);
 assert.equal(t.d.getElementById('status').getAttribute('role'),'status');assert.ok(t.d.querySelector(t.d.querySelector('.skip').getAttribute('href')));
 const css=await readFile(new URL('../style.css',import.meta.url),'utf8');assert.match(css,/max-width:760px/);assert.match(css,/white-space:pre-wrap/);assert.match(css,/focus-visible/);t.dom.window.close();
});
