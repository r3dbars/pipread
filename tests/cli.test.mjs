import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,access,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const cli=resolve('bin/pipread.mjs');
const canonicalTemp=await realpath(tmpdir());
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
test('init dry-run, source scaffold, repeat; refuse nonempty target',async()=>{
 const root=await mkdtemp(join(canonicalTemp,'pipread-cli-')),target=join(root,'reader');
 assert.equal(run('init','--dir',target).status,0);await assert.rejects(access(target));
 assert.equal(run('init','--dir',target,'--write').status,0);
 assert.match(await readFile(join(target,'src/article-voice.js'),'utf8'),/ArticleVoice/);
 assert.match(await readFile(join(target,'.gitignore'),'utf8'),/node_modules\//);
 await assert.rejects(access(join(target,'dist')));
 assert.match(run('init','--dir',target,'--write').stdout,/Already initialized/);
 const occupied=join(root,'occupied');await writeFile(occupied,'keep');assert.notEqual(run('init','--dir',occupied,'--write').status,0);assert.equal(await readFile(occupied,'utf8'),'keep');
});
test('HTML dry-run, explicit write, backup, escaping, idempotence and conflict refusal',async()=>{
 const root=await mkdtemp(join(canonicalTemp,'pipread-html-')),html=join(root,'article.html'),original='<html><body><article id="story">Hello</article></body></html>';
 await writeFile(html,original);const args=['add','--browser-local','--html',html,'--selector','#story'];
 assert.equal(run(...args).status,0);assert.equal(await readFile(html,'utf8'),original);
 assert.equal(run(...args,'--write').status,0);const result=await readFile(html,'utf8');assert.match(result,/<article-voice article="#story"/);assert.equal(await readFile(html+'.article-voice-backup','utf8'),original);
 assert.match(run(...args,'--write').stdout,/Already integrated/);assert.equal(await readFile(html,'utf8'),result);
 assert.notEqual(run('add','--browser-local','--html',html,'--selector','#changed','--write').status,0);
 const other=join(root,'other.html');await writeFile(other,original);
 assert.equal(run('add','--browser-local','--html',other,'--selector','[data-title="a$&b"]','--write').status,0);assert.match(await readFile(other,'utf8'),/a\$&amp;b/);
});
test('reject external script URLs and symlink HTML without edits',async()=>{
 const root=await mkdtemp(join(canonicalTemp,'pipread-refuse-')),html=join(root,'article.html');await writeFile(html,'<body>Hello</body>');
 assert.notEqual(run('add','--browser-local','--html',html,'--selector','article','--script-url','https://example.com/a.js','--write').status,0);
 const link=join(root,'link.html');await symlink(html,link);assert.notEqual(run('add','--browser-local','--html',link,'--selector','article','--write').status,0);assert.equal(await readFile(html,'utf8'),'<body>Hello</body>');
});

test('ambiguous HTML closing tags are refused before writes',async()=>{
 const root=await mkdtemp(join(canonicalTemp,'pipread-tags-')),html=join(root,'post.html');const original='<body><script>const example="</body>";</script></body>';await writeFile(html,original);
 assert.notEqual(run('add','--browser-local','--html',html,'--selector','article','--write').status,0);assert.equal(await readFile(html,'utf8'),original);
});
test('static integration is the default and repeats without changes',async()=>{
 const root=await mkdtemp(join(canonicalTemp,'pipread-static-add-')),html=join(root,'post.html');const original='<body><article id="story">Hello.</article></body>';await writeFile(html,original);
 const args=['add','--html',html,'--selector','#story','--manifest','/pipread/manifest.json','--article','post.html'];
 assert.equal(run(...args).status,0);assert.equal(await readFile(html,'utf8'),original);assert.equal(run(...args,'--write').status,0);assert.match(await readFile(html,'utf8'),/<pipread-audio manifest="\/pipread\/manifest.json" article="post.html" selector="#story">/);assert.match(run(...args,'--write').stdout,/Already integrated/);
});
