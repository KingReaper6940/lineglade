import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {example} from '../src/example.mjs';
import {inspect} from '../src/inspect.mjs';
import {matchedJSONL,projectJSON,reportJSON,reportHTML,summarySVG} from '../src/exports.mjs';
const dir=new URL('../examples/',import.meta.url);await mkdir(dir,{recursive:true});const result=inspect(example);
for(const [name,text] of [['workshop.jsonl',example.source],['matches.jsonl',matchedJSONL(result)],['project.json',projectJSON(result)],['report.json',reportJSON(result)],['report.html',reportHTML(result)],['summary.svg',summarySVG(result)]])await writeFile(new URL(name,dir),text);
console.log('Wrote six complete synthetic example artifacts to '+fileURLToPath(dir));console.log(result.summary);
