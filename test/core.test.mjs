import test from 'node:test';
import assert from 'node:assert/strict';
import {LIMITS,validate,resolve,pointerTokens} from '../src/model.mjs';
import {parseJSON,format,ParseError} from '../src/json.mjs';
import {indexLines,inspect,cell,page,role} from '../src/inspect.mjs';
import {example} from '../src/example.mjs';
import {matchedJSONL,projectJSON,reportJSON,reportHTML,summarySVG} from '../src/exports.mjs';
const node=s=>parseJSON(s).node,p=(source,extra={})=>({...example,source,...extra});
test('exact project schema, no aliasing and bounded settings',()=>{
 const v=validate(example);v.columns[0]='/changed';assert.equal(example.columns[0],'/id');
 for(const extra of [{unknown:1},{schema:'x'},{columns:[]},{columns:['/id','/id']},{pointer:'#/x'},{needle:'x'.repeat(513)},{source:'\ud800'},{operator:'type',needle:'float'}])assert.throws(()=>validate({...example,...extra}));
});
test('RFC pointer escapes, root, empty key and own dangerous-looking names',()=>{
 const n=node('{"foo":["bar","baz"],"":0,"a/b":1,"m~n":8,"~1":9,"__proto__":{"constructor":2}}');
 for(const [path,value] of [['/foo/0','"bar"'],['/','0'],['/a~1b','1'],['/m~0n','8'],['/~01','9'],['/__proto__/constructor','2']])assert.equal(format(resolve(n,path).node),value);
 assert.equal(resolve(n,'').node,n);
 for(const path of ['/foo/01','/foo/-','/foo/9','/absent'])assert.equal(resolve(n,path).state,'missing');
 for(const path of ['no','/~2','/~'])assert.throws(()=>pointerTokens(path));
});
test('duplicate decoded keys are retained and ambiguous; unrelated keys resolve',()=>{
 const r=parseJSON('{"a":1,"\\u0061":2,"b":null}');
 assert.equal(r.duplicates,1);assert.equal(resolve(r.node,'/a').state,'ambiguous');assert.equal(resolve(r.node,'/b').node.type,'null');
 assert.equal(format(r.node),'{"a":1,"a":2,"b":null}');
});
test('number tokens never pass through binary floating point',()=>{
 const source='[9007199254740993,-0,1e400,0.0000000000000000001,123456789012345678901234567890]';
 assert.equal(format(node(source)),source);
 assert.match(format(node(source),true),/9007199254740993/);
});
test('JSON grammar accepts values and escapes using native parser as safe-value oracle',()=>{
 const values=[null,true,false,0,-123.45,1e-25,'a"\\\n\t😀',[],{},[1,2,{x:'á'}],{'':null,'a/b':true}];
 for(let i=0;i<150;i++)values.push({i,arr:[i%2===0,'v'+i,{nested:i/3}],unicode:'🌿'});
 for(const value of values){
  const text=JSON.stringify(value),parsed=parseJSON(text);
  assert.deepEqual(JSON.parse(format(parsed.node)),value);
  assert.deepEqual(JSON.parse(format(parsed.node,true)),value);
 }
});
test('malformed JSON rejects rather than repairs',()=>{
 for(const s of ['', '01','+1','NaN','Infinity','1.','1e','[1,]','{"a":1,}','{"a" 1}','[1 2]','true false','"\\x"','"\\u123"','"a\nb"','"unterminated','\ufeff{}','/*x*/{}']){
  assert.throws(()=>parseJSON(s),ParseError,s);
 }
});
test('bounded depth and node errors are distinguished from syntax',()=>{
 assert.throws(()=>parseJSON('[[[0]]]',{...LIMITS,depth:2}),e=>e.limited);
 assert.throws(()=>parseJSON('[1,2,3]',{...LIMITS,nodes:3}),e=>e.limited);
 assert.equal(indexLines('[[[0]]]',{...LIMITS,depth:2})[0].kind,'limited');
});
test('LF, CRLF and terminal newline produce exact physical lines',()=>{
 const source=' {} \r\n\nnull\ntrue',rows=indexLines(source);
 assert.deepEqual(rows.map(r=>r.kind),['valid','blank','valid','valid']);assert.equal(rows.map(r=>r.raw).join(''),source);
 assert.deepEqual(rows.map(r=>r.ending),['\r\n','\n','\n','']);
 assert.equal(indexLines('{}\n').length,1);assert.equal(indexLines('{}\n\n').length,2);assert.equal(indexLines('').length,0);
});
test('BOM is diagnosed, primitives valid, leading whitespace and duplicate names counted',()=>{
 assert.equal(indexLines('\ufeff{}')[0].kind,'invalid');
 const r=inspect(p(' null\n3\n"text"\ntrue\n{"x":1,"x":2}\n'));
 assert.equal(r.summary.valid,5);assert.equal(r.summary.duplicateRows,1);
 assert.equal(cell(r.rows[0],'/x').state,'missing');
});
test('line and file resource budgets cannot silently truncate an index',()=>{
 assert.equal(indexLines('12345',{...LIMITS,line:4})[0].kind,'limited');
 assert.throws(()=>indexLines('0\n0',{...LIMITS,lines:1}),/Physical-line/);
 assert.throws(()=>indexLines('[1,2]\n[3,4]',{...LIMITS,totalNodes:5}),/budget/);
 assert.throws(()=>indexLines('123',{...LIMITS,source:2}),/limits/);
});
test('typed filters distinguish null, missing, ambiguous and decoded strings',()=>{
 const source='{"x":"a\\nb"}\n{"x":null}\n{}\n{"x":3}\n{"x":"3"}\n{"x":1,"x":2}\n';
 const run=(operator,needle='')=>inspect(p(source,{pointer:'/x',operator,needle})).rows.map(r=>r.line);
 assert.deepEqual(run('all'),[1,2,3,4,5,6]);assert.deepEqual(run('present'),[1,2,4,5]);assert.deepEqual(run('missing'),[3]);assert.deepEqual(run('ambiguous'),[6]);
 assert.deepEqual(run('contains','\n'),[1]);assert.deepEqual(run('equals','3'),[5]);assert.deepEqual(run('type','number'),[4]);assert.deepEqual(run('type','null'),[2]);
});
test('raw matching export preserves exact original tokens, duplicate keys and terminators',()=>{
 const source='{"x":9007199254740993}\r\ninvalid\n\n{"x":1,"x":2}\n1e400';
 const r=inspect(p(source));assert.equal(matchedJSONL(r),'{"x":9007199254740993}\r\n{"x":1,"x":2}\n1e400');
 assert.equal(JSON.parse(projectJSON(r)).source,source);assert.deepEqual(inspect(JSON.parse(projectJSON(r))).summary,r.summary);
});
test('complete reports include excluded diagnostics and never truncate long values',()=>{
 const r=inspect(p('{"x":"'+ 'a'.repeat(600)+'"}\nbad\n',{columns:['/x']}));
 const report=JSON.parse(reportJSON(r));assert.equal(report.records.length,2);assert.equal(report.records[0].columns[0].text.length,600);assert.equal(report.records[1].kind,'invalid');
 assert.match(reportHTML(r),new RegExp('a'.repeat(600)));assert.match(summarySVG(r),/not an application screenshot/);
});
test('all HTML and SVG data is escaped; no active imported content',()=>{
 const r=inspect(p('{"x":"<img src=x onerror=alert(1)>"}',{title:'</title><script>alert(1)</script>',notes:'<svg onload=alert(1)>',columns:['/x']}));
 const html=reportHTML(r),svg=summarySVG(r);
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(!svg.includes('<script>'));assert.match(html,/&lt;img/);assert.match(html,/default-src/);
});
test('pagination and role cues never invent rows or verify identity',()=>{
 const r=inspect(p(Array.from({length:45},(_,i)=>JSON.stringify({role:i%2?'assistant':'user',x:i})).join('\n')));
 assert.equal(page(r.rows,1).items[0].line,21);assert.equal(page(r.rows,99).items.length,5);assert.equal(page([],0).pages,1);
 assert.equal(role(r.rows[0],'/role'),'user');assert.equal(role(r.rows[0],'/missing'),'other');
});
