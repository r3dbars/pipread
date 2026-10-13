#!/usr/bin/env node
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const help=`Pipread — local article audio setup

node bin/pipread.mjs init --dir ./reader [--write]
node bin/pipread.mjs add --html ./blog/post.html --selector '#story'
  [--script-url /voice/dist/article-voice.js] [--write]

Default is dry-run. init creates a source-only local preview project in an
empty directory. add inserts one explicit web component/script pair, backing
up the HTML first. It does not build, copy runtime binaries, install packages,
start servers or deploy. Repeating the same command is a no-op.

Public hosting of built speech assets remains on hold: see docs/RELEASE.md.
`;
const args=process.argv.slice(2),command=args.shift();
if(!command || ['help','--help','-h'].includes(command)){console.log(help);process.exit(0)}
const options={};
try{
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--write'){options.write=true;continue;}
  if(!['--dir','--html','--selector','--script-url'].includes(arg)||!args[i+1]||args[i+1].startsWith('--'))throw Error(`Unknown or incomplete option: ${arg}`);
  if(options[arg])throw Error(`Duplicate option: ${arg}`);options[arg]=args[++i];
 }
 const hash=s=>createHash('sha256').update(s).digest('hex');
 const exists=async p=>{try{return await lstat(p)}catch(e){if(e.code==='ENOENT')return null;throw e}};
 const plain=async p=>{const stat=await exists(p);if(stat?.isSymbolicLink())throw Error(`Refusing symlink: ${p}`);return stat};
 const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 if(command==='init'){
  if(!options['--dir']||options['--html']||options['--selector']||options['--script-url'])throw Error('init requires only --dir and optional --write');
  const target=resolve(options['--dir']);
  let ancestor=dirname(target);while(!(await exists(ancestor)))ancestor=dirname(ancestor);if(await realpath(ancestor)!==ancestor)throw Error('Target traverses a symlink.');if(target===root)throw Error('Choose a new directory, not this checkout.');
  await plain(target);
  const marker=join(target,'.article-voice-init.json');
  if(await exists(marker)){const m=JSON.parse(await readFile(marker,'utf8'));if(m.format!==1)throw Error('Unknown project marker');console.log('Already initialized. No files changed.');process.exit(0)}
  const {readdir}=await import('node:fs/promises');
  if(await exists(target) && (await readdir(target)).length)throw Error('Target must be empty; existing files will not be overwritten.');
  const files=['.gitignore','package.json','package-lock.json','index.html','vite.config.js','LICENSE','THIRD_PARTY_NOTICES.md','README.md','playwright.config.js','tests/cli.test.mjs','tests/player.spec.js','tests/benchmark.mjs','docs/HIGHLIGHTING.md','bin/pipread.mjs','docs/SETUP.md','examples/article.html','docs/RELEASE.md','docs/LICENSING.md',...(await readdir(join(root,'src'))).map(n=>'src/'+n),...(await readdir(join(root,'licenses'))).map(n=>'licenses/'+n)];
  console.log(`${options.write?'Create':'DRY RUN: would create'} ${files.length} source/notices files in ${target}`);
  if(options.write){await mkdir(target,{recursive:true});for(const file of files){await mkdir(dirname(join(target,file)),{recursive:true});await writeFile(join(target,file),await readFile(join(root,file)),{flag:'wx'})}await writeFile(marker,JSON.stringify({format:1},null,2)+'\n',{flag:'wx'})}
  console.log('Next: cd into that directory; npm ci --ignore-scripts; npm run dev');
 }else if(command==='add'){
  if(!options['--html']||!options['--selector']||options['--dir'])throw Error('add requires --html and --selector');
  const path=resolve(options['--html']);const stat=await plain(path);if(!stat?.isFile())throw Error('HTML must be an existing regular file.');
  // Refuse a symlink anywhere in the path, not just the file itself.
  if(await realpath(path)!==path)throw Error('HTML path traverses a symlink.');
  const selector=options['--selector'],url=options['--script-url']||'/voice/dist/article-voice.js';
  if(!selector.trim()||selector.length>500)throw Error('Supply a nonempty CSS selector of at most 500 characters.');
  if(!/^\/(?!\/)[^\s<>"']+\.js$/.test(url))throw Error('script-url must be a same-origin absolute .js path (for example /voice/dist/article-voice.js).');
  const html=await readFile(path,'utf8'),start='<!-- article-voice:start -->',end='<!-- article-voice:end -->';
  const block=`${start}\n<script type="module" src="${escape(url)}"></script>\n<article-voice article="${escape(selector)}" backend="auto"></article-voice>\n${end}`;
  if(html.includes(start)||html.includes(end)){
   if(html.includes(block)){console.log('Already integrated with this configuration. No files changed.');process.exit(0)}
   throw Error('Existing managed integration differs. Review and remove that block explicitly before changing configuration.');
  }
  if(/<article-voice\b/i.test(html))throw Error('An unmanaged player already exists. Review it manually.');
  if([...html.matchAll(/<\/body\s*>/gi)].length!==1)throw Error('Expected exactly one unambiguous </body>. Templates or embedded closing tags require manual integration.');
  const output=html.replace(/<\/body\s*>/i,match=>`${block}\n${match}`);
  console.log(`${options.write?'Add':'DRY RUN: would add'} to ${path}:\n${block}\nMove the block beside your article byline if desired. Selector is evaluated by the browser; verify it in preview.`);
  if(options.write){
   const backup=path+'.article-voice-backup';if(await exists(backup))throw Error('Backup already exists; refusing to overwrite it.');
   await writeFile(backup,html,{flag:'wx'});
   if(hash(await readFile(path))!==hash(html))throw Error('HTML changed while preparing the edit. Original left untouched.');
   await writeFile(path,output);
  }
  console.log('The script URL must be served from your local build. No assets were copied. Public bundle distribution is still on hold.');
 }else throw Error(`Unknown command: ${command}`);
}catch(e){console.error(`Setup stopped: ${e.message}`);process.exitCode=1}
