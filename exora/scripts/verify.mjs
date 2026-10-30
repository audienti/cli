import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(readFileSync('source-manifest.json','utf8'));
if(!/^[a-f0-9]{40}$/.test(manifest.sourceCommit))throw Error('Missing source commit');
for(const [path,hash]of Object.entries(manifest.files)){if(path.includes('..')||path.startsWith('/'))throw Error('Unsafe manifest path');if(createHash('sha256').update(readFileSync(path)).digest('hex')!==hash)throw Error(`Source differs: ${path}`);}
const p=JSON.parse(readFileSync('package.json','utf8'));
if(p.name!=='@audienti/cli'||p.publishConfig.tag!=='exora'||!p.version.includes('exora'))throw Error('Wrong publication channel');
console.log(`Verified ${Object.keys(manifest.files).length} source files at ${manifest.sourceCommit}`);
