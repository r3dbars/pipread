// Real local inference. Downloads ~420 MB of weights across both backends.
// Run npm run build && npm run preview, then node tests/benchmark.mjs.
import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
const page = await context.newPage();
const base = process.env.BENCH_URL || 'http://127.0.0.1:4173';
const results = { date: new Date().toISOString(), url: base, runs: [], notes: 'Isolated browser context. Cold = empty Cache API and HTTP cache. Warm = reload in same context. No mocked engine.' };
let run;
page.on('pageerror', e => run?.errors.push(e.message));
page.on('console', m => {if(['error','warning'].includes(m.type())) {run?.console.push(m.text().slice(0,600));console.log(m.type(),m.text().slice(0,160));}});
page.on('response', r => {if(r.status() >= 400) {const u=new URL(r.url());run?.errors.push(`${r.status()} ${u.origin}${u.pathname}`);}});
page.on('request', r => {const u=new URL(r.url());if(run)run.requests.push({method:r.method(),url:u.origin+u.pathname});});
await page.goto(base);
results.environment = await page.evaluate(async () => {const a=await navigator.gpu?.requestAdapter();return {userAgent:navigator.userAgent,gpu:!!a,gpuInfo:a?.info?{vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device,description:a.info.description}:null,hardwareConcurrency:navigator.hardwareConcurrency};});
try {
 for (const backend of ['wasm','webgpu']) {
  if(backend==='webgpu' && !results.environment.gpu) continue;
  for (const temperature of ['cold','warm']) {
   if (temperature === 'cold') {await page.evaluate(async()=>{for(const name of await caches.keys())await caches.delete(name);await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('article-voice-assets-v1');r.onsuccess=resolve;r.onerror=reject;r.onblocked=reject})});const cdp=await context.newCDPSession(page);await cdp.send('Network.clearBrowserCache');await cdp.detach();}
   run={backend,temperature,requests:[],errors:[],console:[]};results.runs.push(run);
   await page.goto(base);
   await page.selectOption('#backend',backend);
   await page.evaluate(()=>{
    const p=document.createElement('article');p.id='benchmark';p.textContent='A little room to listen. Some of our best ideas arrive when we stop looking for them. They turn up on a walk around the block.';document.body.append(p);
    const player=document.querySelector('article-voice');player.setAttribute('article','#benchmark');
    window.voiceMetrics=null;window.downloads=[];window.cacheEvents=[];
    player.addEventListener('voice-metrics', e => {
      window.voiceMetrics=e.detail;
      const pcm=player.currentChunk.samples;
      window.audioStats={samples:pcm.length,peak:Math.max(...pcm),rms:Math.sqrt(pcm.reduce((s,x)=>s+x*x,0)/pcm.length)};
      window.samplePCM=Array.from(pcm);
    });
    player.addEventListener('voice-cache',e=>window.cacheEvents.push(e.detail));
    player.addEventListener('voice-progress',e=>{if(['download','done'].includes(e.detail.status))window.downloads.push({at:performance.now(),...e.detail})});
   });
   const start=Date.now();
   await page.getByRole('button',{name:'Listen to this article'}).click();
   try {await page.waitForFunction(()=>window.voiceMetrics || document.querySelector('article-voice').state==='error',{},{timeout:240000});}catch(e){run.timeout=true;}
   Object.assign(run,await page.evaluate(()=>({state:document.querySelector('article-voice').state,message:document.querySelector('article-voice').status.textContent,metrics:window.voiceMetrics,audio:window.audioStats,downloads:window.downloads,cacheEvents:window.cacheEvents})));
   run.elapsedMs=Date.now()-start;
   if(run.metrics){
     await page.getByRole('button',{name:'Pause',exact:false}).click();
     run.pause=await page.evaluate(()=>({state:document.querySelector('article-voice').state,mediaPaused:document.querySelector('article-voice').source.paused}));
     await page.getByLabel('Playback speed').selectOption('1.25');
     await page.getByRole('button',{name:'Resume'}).click();
     await page.waitForFunction(()=>document.querySelector('article-voice').state==='playing');
     run.resume=await page.evaluate(()=>({state:document.querySelector('article-voice').state,rate:document.querySelector('article-voice').source?.playbackRate}));
     await page.getByRole('button',{name:'Stop',exact:true}).click();
     run.stop=await page.evaluate(()=>({state:document.querySelector('article-voice').state,worker:document.querySelector('article-voice').worker,audio:document.querySelector('article-voice').source}));
     if(temperature==='warm'){
       const pcm=await page.evaluate(()=>window.samplePCM);const b=Buffer.alloc(44+pcm.length*2);b.write('RIFF',0);b.writeUInt32LE(36+pcm.length*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length*2,40);pcm.forEach((v,i)=>b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));fs.writeFileSync(`/tmp/article-voice-${backend}.wav`,b);
     }
   }
   run.cache=await page.evaluate(async()=>{const a=[];for(const n of await caches.keys()){const c=await caches.open(n);for(const r of await c.keys()){const response=await c.match(r);a.push({name:n,url:r.url,bytes:(await response.arrayBuffer()).byteLength})}}return a});
   console.log('BENCHMARK',backend,temperature,JSON.stringify({state:run.state,metrics:run.metrics,audio:run.audio,errors:run.errors}));
   fs.writeFileSync('/tmp/article-voice-benchmark.json',JSON.stringify(results,null,2));
  }
 }
} finally { await browser.close(); }
