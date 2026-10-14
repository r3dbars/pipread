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
 const audio=get('audio');Object.assign(audio,{dataset:{src:audioSource},paused:true,ended:false,duration:NaN,currentTime:0,playbackRate:1,muted:false,playCount:0,async play(){this.playCount++;if(playFails){playFails=false;throw Error('Playback blocked')}this.paused=false;this.ended=false;this.emit('play')},pause(){this.paused=true;this.emit('pause')},load(){this.duration=duration;queueMicrotask(()=>this.emit('canplay'));}});
 let requests=0,revoked=0;const urls=[];const motion={matches:reducedMotion,addEventListener(n,f){this.listener=f}};
 const window={scrollY:0,innerHeight:800,addEventListener(n,f){(listeners[n]??=[]).push(f)},matchMedia(){return motion},requestAnimationFrame(f){frames.set(++frameId,f);return frameId},cancelAnimationFrame(n){frames.delete(n)}};
 const ctx={document:{getElementById:get,querySelectorAll:()=>paras,querySelector:s=>get(s)},window,Number,String,Math,Uint8Array,Blob,AbortController,URL:{createObjectURL(b){assert.equal(b.size,waveBytes.byteLength);urls.push(b);return 'blob:complete-recording'},revokeObjectURL(){revoked++}},setTimeout,clearTimeout,fetch:async(url,options)=>{requests++;assert.equal(url,audioSource);assert.equal(options.credentials,'same-origin');if(failOnce&&requests===1)throw Error('Transient failure');const wav=invalidWave?Buffer.from('<html>Not an audio file</html>'):waveBytes;return{ok:true,arrayBuffer:async()=>wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.byteLength)}}};
 vm.runInNewContext(source,ctx);return{get,audio,paras,urls,window,motion,frames,dispatch(n,event={}){for(const f of listeners[n]||[])f(event)},paint(){const f=[...frames.values()];frames.clear();f.forEach(x=>x())},requests:()=>requests,revoked:()=>revoked};
}
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 assert(html.includes('class="article-copy expanded"'));assert(html.includes('id="highlight" aria-pressed="true"'));assert(html.includes('src="follow.js"'));assert(!html.includes('id="transcript-toggle"'));assert(!html.includes('<nav'));
 const e=environment(),{get,audio,paras}=e;assert.equal(paras.length,bodyTimings.length);paras.forEach((p,i)=>{assert.equal(p.textContent,bodyTimings[i].text);assert.equal(Number(p.dataset.start),bodyTimings[i].start);assert.equal(Number(p.dataset.end),bodyTimings[i].end)});assert.equal(duration,measuredTimings.duration);assert(get('seek').disabled);get('forward').onclick();assert.equal(audio.currentTime,0);await flush();assert.equal(audio.src,'blob:complete-recording');assert.equal(e.urls.length,1);assert(!get('seek').disabled);assert.equal(get('player-status').textContent,'');
 await get('play').events.click[0]();assert(!audio.paused);assert.equal(get('play').attrs['aria-label'],'Pause preview');await get('play').events.click[0]();assert(audio.paused);
 get('forward').onclick();assert.equal(audio.currentTime,15);get('forward').onclick();assert.equal(audio.currentTime,30);get('back').onclick();assert.equal(audio.currentTime,15);
 get('seek').value=35;get('seek').emit('input');assert.equal(audio.currentTime,35);get('seek').value=duration-3;get('seek').emit('input');get('forward').onclick();assert.equal(audio.currentTime,duration);get('seek').value=-2;get('seek').emit('input');assert.equal(audio.currentTime,0);get('back').onclick();assert.equal(audio.currentTime,0);
 for(const rate of [1.25,1.5,1.75,2,.75,1]){get('speed').onclick({currentTarget:get('speed')});assert.equal(audio.playbackRate,rate);assert.equal(get('speed').textContent,`${rate}×`)}
 get('mute').onclick({currentTarget:get('mute')});assert(audio.muted);assert.equal(get('mute').attrs['aria-pressed'],'true');get('mute').onclick({currentTarget:get('mute')});assert(!audio.muted);assert.equal(get('mute').attrs['aria-label'],'Mute audio');
 audio.currentTime=1;audio.emit('timeupdate');assert(!paras.some(p=>p.classList.contains('reading')));audio.currentTime=Number(paras[0].dataset.start)+1;audio.emit('timeupdate');assert(paras[0].classList.contains('reading'));get('highlight').onclick({currentTarget:get('highlight')});assert.equal(get('highlight').attrs['aria-pressed'],'false');assert(!paras.some(p=>p.classList.contains('reading')));get('highlight').onclick({currentTarget:get('highlight')});assert.equal(get('highlight').attrs['aria-pressed'],'true');
 paras.forEach((p,i)=>{audio.currentTime=(Number(p.dataset.start)+Number(p.dataset.end))/2;audio.emit('timeupdate');assert(p.classList.contains('reading'));assert.equal(paras.filter(x=>x.classList.contains('reading')).length,1);if(i<paras.length-1){audio.currentTime=Number(p.dataset.end)+.1;audio.emit('timeupdate');assert(!paras.some(x=>x.classList.contains('reading')))}});
 audio.pause();await get('try-listening').events.click[0]();await flush();assert(!audio.paused);const played=audio.playCount;await get('try-listening').events.click[0]();await flush();assert(!audio.paused);assert.equal(audio.playCount,played);assert.equal(e.requests(),1);
 audio.ended=true;audio.paused=true;audio.currentTime=duration;await get('play').events.click[0]();assert.equal(audio.currentTime,0);assert(!audio.paused);
 e.window.scrollY=500;e.dispatch('scroll');e.dispatch('scroll');assert.equal(e.frames.size,1);e.paint();assert.equal(get('.landscape').style.transform,'translate3d(0,17.50px,0)');e.window.scrollY=99999;e.dispatch('scroll');e.paint();assert.equal(get('.landscape').style.transform,'translate3d(0,28.00px,0)');e.motion.matches=true;e.motion.listener();assert.equal(get('.landscape').style.transform,'translate3d(0,0.00px,0)');e.dispatch('scroll');assert.equal(e.frames.size,0);
 e.dispatch('pagehide',{persisted:true});assert.equal(e.revoked(),0);e.dispatch('pagehide',{persisted:false});assert.equal(e.revoked(),1);
 const retry=environment({failOnce:true});await flush();assert(!retry.get('play').disabled);assert(retry.get('seek').disabled);await retry.get('play').events.click[0]();assert(!retry.audio.paused);assert.equal(retry.requests(),2);
 const bad=environment({invalidWave:true});await flush();assert(bad.get('seek').disabled);assert.equal(bad.urls.length,0);assert(bad.get('player-status').textContent.includes('could not load'));
 const blocked=environment({playFails:true});await flush();await blocked.get('play').events.click[0]();assert(blocked.audio.paused);assert(blocked.get('player-status').textContent.includes('could not play'));await blocked.get('play').events.click[0]();assert(!blocked.audio.paused);
 const still=environment({reducedMotion:true});await flush();still.window.scrollY=500;still.dispatch('scroll');assert.equal(still.frames.size,0);
 console.log('PASS: validated WAV/Blob, load and playback retry, all player controls, replay, seek bounds, complete speed cycle, mute, default highlight, exact paragraph timestamps, full article, idempotent CTA, bounded rAF parallax, reduced motion, page lifecycle.');
})().catch(e=>{console.error(e);process.exitCode=1});
