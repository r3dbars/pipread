const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('public/app.js','utf8'),html=fs.readFileSync('public/index.html','utf8');
const audioSource=html.match(/id="audio"[^>]*data-src="([^"]+)"/)[1];
const waveBytes=fs.readFileSync('public/'+audioSource);
const measuredTimings=JSON.parse(fs.readFileSync('public/assets/voice-timings.json','utf8'));
const bodyTimings=measuredTimings.paragraphs.slice(1);
assert.equal(html.match(/<h2[^>]*>([^<]+)<\/h2>/)[1],measuredTimings.paragraphs[0].text);
assert.equal(fs.readFileSync('public/assets/voice-transcript.txt','utf8').trim(),measuredTimings.text);
assert(html.includes('<span>Try it</span>'));
assert(html.indexOf('id="try-listening"')<html.indexOf('id="article-title"'));
assert(html.indexOf('id="demo"')<html.indexOf('id="article-title"'));
assert(html.indexOf('id="play"')<html.indexOf('id="article-title"'));
assert(html.indexOf('id="article-title"')<html.indexOf('id="transcript"'));
assert(html.indexOf('id="play"')<html.indexOf('id="highlight"'));
assert(html.indexOf('id="highlight"')<html.indexOf('id="article-title"'));
function wavDuration(wav){let rate=0,size=0;for(let o=12;o+8<=wav.length;){const name=wav.toString('ascii',o,o+4),length=wav.readUInt32LE(o+4);if(name==='fmt ')rate=wav.readUInt32LE(o+16);if(name==='data')size=length;o+=8+length+(length%2);}assert(rate>0&&size>0);return size/rate;}
const duration=wavDuration(waveBytes);
function classes(){const values=new Set();return{add(...names){names.forEach(n=>values.add(n))},remove(...names){names.forEach(n=>values.delete(n))},toggle(n,on){on??=!values.has(n);on?values.add(n):values.delete(n);return on},contains(n){return values.has(n)}};}
function environment({failOnce=false,invalidWave=false,reducedMotion=false,playFails=false}={}){
 const el={},listeners={},frames=new Map();let frameId=0;
 const get=id=>el[id]??=({textContent:'',innerHTML:'',value:0,dataset:{},style:{setProperty(k,v){this[k]=v}},classList:classes(),attrs:{},events:{},addEventListener(n,f){(this.events[n]??=[]).push(f)},removeEventListener(n,f){this.events[n]=(this.events[n]||[]).filter(x=>x!==f)},emit(n){for(const f of [...(this.events[n]||[])])f()},setAttribute(n,v){this.attrs[n]=v},getAttribute(n){return this.attrs[n]},removeAttribute(n){delete this.attrs[n]},querySelector(){return this.child??={textContent:'',style:{}}}});
 const transcript=html.match(/id="transcript">([\s\S]*?)<\/div>/)[1];
 const paras=[...transcript.matchAll(/<p([^>]*)>([\s\S]*?)<\/p>/g)].map((m,i)=>Object.assign(get(`p${i}`),{textContent:m[2],dataset:{start:m[1].match(/data-start="([^"]+)"/)?.[1],end:m[1].match(/data-end="([^"]+)"/)?.[1]}}));
 get('article-title').textContent=measuredTimings.paragraphs[0].text;
 const audio=get('audio');Object.assign(audio,{dataset:{src:audioSource},paused:true,ended:false,duration:NaN,currentTime:0,playbackRate:1,muted:false,playCount:0,async play(){this.playCount++;if(playFails){playFails=false;throw Error('Playback blocked')}this.paused=false;this.ended=false;this.emit('play')},pause(){this.paused=true;this.emit('pause')},load(){this.duration=duration;queueMicrotask(()=>this.emit('canplay'));}});
 let requests=0,revoked=0;const urls=[];const motion={matches:reducedMotion,addEventListener(n,f){this.listener=f}};
 const window={scrollY:0,innerHeight:800,addEventListener(n,f){(listeners[n]??=[]).push(f)},matchMedia(){return motion},requestAnimationFrame(f){frames.set(++frameId,f);return frameId},cancelAnimationFrame(n){frames.delete(n)}};
 const makeNode=(text='')=>({textContent:text,children:[],classList:classes(),append(n){this.children.push(n)}});
 paras.forEach(p=>p.replaceChildren=f=>{p.children=f.children;assert.equal(f.children.map(n=>n.textContent).join(''),p.textContent)});
 const ctx={document:{createElement:()=>makeNode(),createTextNode:makeNode,createDocumentFragment:()=>makeNode(),getElementById:get,querySelectorAll:()=>paras,querySelector:s=>get(s)},window,Number,String,Math,Uint8Array,Blob,AbortController,URL:{createObjectURL(b){assert.equal(b.size,waveBytes.byteLength);urls.push(b);return 'blob:complete-recording'},revokeObjectURL(){revoked++}},setTimeout,clearTimeout,fetch:async(url,options)=>{if(url==='assets/voice-words.json')return{ok:true,json:async()=>JSON.parse(fs.readFileSync('public/assets/voice-words.json'))};requests++;assert.equal(url,audioSource);assert.equal(options.credentials,'same-origin');if(failOnce&&requests===1)throw Error('Transient failure');const wav=invalidWave?Buffer.from('<html>Not an audio file</html>'):waveBytes;return{ok:true,arrayBuffer:async()=>wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.byteLength)}}};
 vm.runInNewContext(fs.readFileSync('public/follow.js','utf8'),ctx);vm.runInNewContext(source,ctx);return{get,audio,paras,urls,window,motion,frames,dispatch(n,event={}){for(const f of listeners[n]||[])f(event)},paint(){const f=[...frames.values()];frames.clear();f.forEach(x=>x())},requests:()=>requests,revoked:()=>revoked};
}

const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const e=environment();await flush();await flush();const b=e.get('highlight');assert.equal(b.disabled,false);assert.equal(b.dataset.mode,'paragraph');
 const words=JSON.parse(fs.readFileSync('public/assets/voice-words.json')).words.filter(w=>w.paragraph>0);
 b.onclick();assert.equal(b.dataset.mode,'off');b.onclick();assert.equal(b.dataset.mode,'word');
 const spans=e.paras.flatMap(p=>p.children.filter(x=>x.className==='follow-word'));assert.equal(spans.length,words.length);
 for(let i=0;i<words.length;i++){
  const w=words[i];e.audio.currentTime=(w.start+w.end)/2;e.audio.emit('seeked');assert(spans[i].classList.contains('word-reading'),w.text);assert.equal(spans.filter(n=>n.classList.contains('word-reading')).length,1);
 }
 e.audio.currentTime=41.87;e.audio.emit('seeked');assert.equal(spans.find(s=>s.classList.contains('word-reading')).textContent,'to');
 await e.get('play').events.click[0]();assert(!e.audio.paused);assert(e.frames.size>0);e.paint();
 e.get('speed').onclick({currentTarget:e.get('speed')});assert.equal(e.audio.playbackRate,1.25);
 e.get('seek').value=21.8;e.get('seek').emit('input');assert.equal(spans.find(s=>s.classList.contains('word-reading')).textContent,'ElevenLabs,');
 await e.get('play').events.click[0]();assert(e.audio.paused);assert.equal(e.frames.size,0);
 b.onclick();assert.equal(b.dataset.mode,'paragraph');assert(e.paras[1].classList.contains('reading'));assert(!spans.some(s=>s.classList.contains('word-reading')));
 b.onclick();assert.equal(b.dataset.mode,'off');assert(!e.paras.some(p=>p.classList.contains('reading')));
 console.log('PASS: actual app + follow integration, every real word midpoint, weak-token vicinity, playback/media-clock rAF, seeking, speed, pause, full cycle and no simultaneous modes.');
})().catch(e=>{console.error(e);process.exitCode=1});
