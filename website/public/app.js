'use strict';
const audio=document.getElementById('audio');
const play=document.getElementById('play');
const seek=document.getElementById('seek');
const status=document.getElementById('player-status');
const back=document.getElementById('back');
const forward=document.getElementById('forward');
const fmt=s=>Number.isFinite(s)?`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`:'0:00';
let highlight=true;
let followController=null;
let ready=false;
let loading=null;
let objectURL=null;
const SILENT='data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
function setStatus(){status.textContent='';}
function update(){
 document.getElementById('elapsed').textContent=fmt(audio.currentTime);
 document.getElementById('duration').textContent=fmt(audio.duration);
 seek.max=Number.isFinite(audio.duration)?audio.duration:100;
 seek.value=audio.currentTime;
 seek.style.setProperty("--progress",`${Number.isFinite(audio.duration)?100*audio.currentTime/audio.duration:0}%`);
 seek.setAttribute("aria-valuetext",`${fmt(audio.currentTime)} of ${fmt(audio.duration)}`);
 seek.disabled=back.disabled=forward.disabled=!ready;
 const playing=!audio.paused&&!audio.ended;
 // Swap the icon only when the state changes. Rebuilding it on every timeupdate removed the
 // element under a press, so slower clicks and taps on Play/Pause were silently lost.
 const icon=playing?'pause':'play';
 if(play.dataset.icon!==icon){play.dataset.icon=icon;play.querySelector('img').src=`assets/icons/${icon}.svg`;}
 play.setAttribute('aria-label',playing?'Pause preview':audio.ended?'Replay preview':'Play preview');
 if(followController){followController.paint();return;}
 const paras=[...document.querySelectorAll('#transcript p')];
 const total=paras.reduce((n,p)=>n+p.textContent.length,0);
 let boundary=0;
 const ratio=Number.isFinite(audio.duration)?audio.currentTime/audio.duration:0;
 paras.forEach(p=>{
  const start=boundary;boundary+=p.textContent.length/total;
  const measured=p.dataset&&Number.isFinite(Number(p.dataset.start))&&Number.isFinite(Number(p.dataset.end));
  const current=measured?audio.currentTime>=Number(p.dataset.start)&&audio.currentTime<Number(p.dataset.end):ratio>=start&&ratio<boundary;
  p.classList.toggle('reading',highlight&&current&&audio.currentTime>0&&!audio.ended);
 });
}
// Load the entire short recording once. A local Blob is seekable even when the
// authenticated host does not serve HTTP byte ranges for static audio assets.
function loadPreview(){
 if(ready)return Promise.resolve();
 if(loading)return loading;
 // Play stays enabled while loading: a press now waits for the recording instead of being ignored.
 play.setAttribute('aria-busy','true');
 play.classList.add('loading');
 status.textContent='Loading the voice preview…';
 loading=(async()=>{
  const controller=new AbortController();
  const downloadTimeout=setTimeout(()=>controller.abort(),20000);
  let bytes;
  try{
   const response=await fetch(audio.dataset.src,{credentials:'same-origin',signal:controller.signal});
   if(!response.ok)throw new Error('Audio download failed');
   bytes=await response.arrayBuffer();
  }finally{clearTimeout(downloadTimeout);}
  const head=new Uint8Array(bytes,0,Math.min(12,bytes.byteLength));
  if(bytes.byteLength<44||String.fromCharCode(...head.slice(0,4))!=='RIFF'||String.fromCharCode(...head.slice(8,12))!=='WAVE')throw new Error('Invalid preview audio');
  if(objectURL)URL.revokeObjectURL(objectURL);
  objectURL=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>finish(new Error('Audio load timed out')),20000);
   const onReady=()=>finish();
   const onError=()=>finish(new Error('Audio decode failed'));
   function finish(error){clearTimeout(timeout);audio.removeEventListener('canplay',onReady);audio.removeEventListener('error',onError);error?reject(error):resolve();}
   audio.addEventListener('canplay',onReady,{once:true});
   audio.addEventListener('error',onError,{once:true});
   audio.src=objectURL;
   audio.load();
  });
  ready=Number.isFinite(audio.duration)&&audio.duration>0;
  if(!ready)throw new Error('Missing audio duration');
  setStatus();
 })().catch(error=>{
  ready=false;
  status.textContent='The audio preview could not load. Press play to try again.';
  throw error;
 }).finally(()=>{loading=null;play.removeAttribute("aria-busy");play.classList.remove("loading");update();});
 return loading;
}
let playbackRequest=null;
// Safari lets a media element start sound only from inside a tap. If the recording is still
// downloading, start and stop a silent clip during the tap so the element may play when it is ready.
function unlockAudio(){
 if(ready||audio.src)return;
 audio.src=SILENT;
 const attempt=audio.play();
 if(attempt)attempt.catch(()=>{});
 audio.pause();
}
function startPlayback(){
 if(playbackRequest)return playbackRequest;
 if(!ready)unlockAudio();
 playbackRequest=(async()=>{
  // When the recording is ready, play() runs synchronously inside the tap.
  try{if(!ready)await loadPreview();if(audio.ended)audio.currentTime=0;await audio.play();setStatus();}
  catch{status.textContent='The audio preview could not play. Press play to try again.';}
  finally{playbackRequest=null;update();}
 })();
 return playbackRequest;
}
async function togglePlayback(){if(audio.paused||audio.ended)await startPlayback();else{audio.pause();update();}}
play.addEventListener('click',togglePlayback);
document.getElementById('try-listening').addEventListener('click',()=>{if(audio.paused||audio.ended)startPlayback();});
function jumpTo(seconds){if(ready&&Number.isFinite(audio.duration)){audio.currentTime=Math.max(0,Math.min(audio.duration,seconds));update();}}
back.onclick=()=>jumpTo(audio.currentTime-15);
forward.onclick=()=>jumpTo(audio.currentTime+15);
seek.addEventListener('input',()=>jumpTo(Number(seek.value)));
const speeds=[1,1.25,1.5,1.75,2,.75];
document.getElementById('speed').onclick=e=>{audio.playbackRate=speeds[(speeds.indexOf(audio.playbackRate)+1)%speeds.length];audio.defaultPlaybackRate=audio.playbackRate;e.currentTarget.textContent=`${audio.playbackRate}×`;e.currentTarget.setAttribute('aria-label',`Playback speed: ${audio.playbackRate} times`);};
document.getElementById('mute').onclick=e=>{audio.muted=!audio.muted;e.currentTarget.setAttribute('aria-label',audio.muted?'Unmute audio':'Mute audio');e.currentTarget.setAttribute('aria-pressed',String(audio.muted));e.currentTarget.title=audio.muted?'Unmute audio':'Mute audio';e.currentTarget.querySelector('img').src=audio.muted?'assets/icons/muted.svg':'assets/icons/volume.svg';};
document.getElementById('highlight').onclick=e=>{highlight=!highlight;e.currentTarget.setAttribute('aria-pressed',String(highlight));if(ready)setStatus();update();};
audio.addEventListener('error',()=>{if(ready&&!loading){ready=false;status.textContent='The audio stopped. Press play to reload it.';update();}});
['loadedmetadata','durationchange','timeupdate','play','pause','ended','seeked'].forEach(e=>audio.addEventListener(e,update));
window.addEventListener('pagehide',event=>{if(!event.persisted&&objectURL)URL.revokeObjectURL(objectURL);});
update();
loadPreview().catch(()=>{});

// Motion is decorative, bounded, and updated at most once per frame.
// The audio/article never move, and reduced-motion users get a still scene.
const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
// Three depths: the sun drifts least, then the mountains and lake, then the rock with Pip.
const landscape=document.querySelector('.landscape');
const sunLayer=document.querySelector('.sun-layer');
const outcrop=document.querySelector('.outcrop');
let motionFrame=0;
function paintScene(){
 motionFrame=0;
 const travel=motionPreference.matches?0:Math.min(Math.max(window.scrollY,0),window.innerHeight);
 const layers=[[sunLayer,0.02],[landscape,0.035],[outcrop,0.055]];
 for(const [part,depth] of layers)if(part)part.style.transform=`translate3d(0,${(travel*depth).toFixed(2)}px,0)`;
}
function queueScene(){if(!motionPreference.matches&&!motionFrame)motionFrame=window.requestAnimationFrame(paintScene);}
window.addEventListener('scroll',queueScene,{passive:true});
window.addEventListener('resize',queueScene,{passive:true});
if(motionPreference.addEventListener)motionPreference.addEventListener('change',()=>{if(motionFrame)window.cancelAnimationFrame(motionFrame);motionFrame=0;paintScene();});
paintScene();

// Keep paragraph follow active until verified word intervals have loaded.
if(window.PipreadFollow){
 followController=window.PipreadFollow.create({
  audio,button:document.getElementById('highlight'),
  paragraphs:[...document.querySelectorAll('#transcript p')],
  title:document.getElementById('article-title'),document,
  loadWords:async()=>{
   await loadPreview();
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),10000);
   try{
    const response=await fetch('assets/voice-words.json',{credentials:'same-origin',signal:controller.signal});
    if(!response.ok)throw new Error('Aligned words unavailable');
    return await response.json();
   }finally{clearTimeout(timeout);}
  }
 });
}
