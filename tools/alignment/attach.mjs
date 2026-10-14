import {readFile,writeFile,rename,open,unlink,lstat} from 'node:fs/promises';
import {resolve,dirname,join,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2),options={};
try {
  for(let i=0;i<args.length;i++){
    if(args[i]==='--write'){options.write=true;continue;}
    if(!['--manifest','--article','--words'].includes(args[i])||!args[i+1])throw Error('Use --manifest PATH --article KEY --words PATH [--write]');
    options[args[i]]=args[++i];
  }
  if(!options['--manifest']||!options['--article']||!options['--words'])throw Error('Use --manifest PATH --article KEY --words PATH [--write]');
  const path=resolve(options['--manifest']),dir=dirname(path),lock=join(dir,'.pipread.lock');
  // Refuse symlinks in the managed output path, including ancestor directories.
  for(let p=path;;p=dirname(p)){if((await lstat(p)).isSymbolicLink())throw Error('Symlink refused');if(dirname(p)===p)break;}
  const original=await readFile(path),manifest=JSON.parse(original),entry=manifest.articles?.[options['--article']];
  if(manifest.version!==1||!entry)throw Error('Article is absent from version-1 manifest');
  for(const name of [entry.audio,entry.timing])if(!/^[a-f0-9]{64}\.(wav|json)$/.test(name))throw Error('Unsafe manifest filename');
  for(const name of [entry.audio,entry.timing])if((await lstat(join(dir,name))).isSymbolicLink())throw Error('Symlink refused');
  const audio=await readFile(join(dir,entry.audio)),prior=await readFile(join(dir,entry.timing));
  if(hash(audio)!==entry.audioHash||hash(prior)!==entry.timingHash)throw Error('Managed asset hash mismatch');
  const timing=JSON.parse(prior),aligned=JSON.parse(await readFile(resolve(options['--words'])));
  if(aligned.kind!=='aligned-words'||aligned.audioSha256!==entry.audioHash||aligned.duration!==timing.duration)throw Error('Alignment does not match this recording');
  if(!Array.isArray(aligned.words))throw Error('Missing words');
  const words=[];let cursor=0,previousEnd=0;
  for(let p=0;p<timing.paragraphs.length;p++){
    const paragraph=timing.paragraphs[p];
    for(const match of paragraph.text.matchAll(/\S+/gu)){
      const w=aligned.words[cursor++];
      if(!w||w.paragraph!==p||w.text!==match[0]||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<Math.max(paragraph.start,previousEnd)||w.end>paragraph.end||w.end<=w.start)throw Error('Invalid or mismatched word token');
      words.push({...w,offset:match.index,length:match[0].length});previousEnd=w.end;
    }
  }
  if(cursor!==aligned.words.length)throw Error('Extra word tokens');
  const bytes=Buffer.from(JSON.stringify({...timing,words,wordTimingKind:'Supplied acoustic forced alignment; review alignment provenance and quality'},null,2)+'\n');
  const name=hash(bytes)+'.json';
  if(entry.timing===name){console.log('Already attached; no changes.');process.exit(0);}
  console.log(`${options.write?'Attach':'DRY RUN: would attach'} ${words.length} words for ${options['--article']}: ${name}`);
  if(options.write){
    const handle=await open(lock,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,operation:'attach-word-timings'}));await handle.close();
    let temp;
    try {
      if(hash(await readFile(path))!==hash(original))throw Error('Manifest changed; retry');
      try{await writeFile(join(dir,name),bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||hash(await readFile(join(dir,name)))!==hash(bytes))throw e;}
      const backup=join(dir,'manifest.backup-'+hash(original)+'.json');
      try{await writeFile(backup,original,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||hash(await readFile(backup))!==hash(original))throw e;}
      entry.timing=name;entry.timingHash=hash(bytes);
      temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});await rename(temp,path);
    } finally {if(temp)await unlink(temp).catch(()=>{});await unlink(lock);}
  }
} catch(e){console.error(e.message);process.exitCode=1;}
