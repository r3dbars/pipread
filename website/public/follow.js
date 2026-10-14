'use strict';
// Word intervals must be measured/aligned to this recording. Never interpolate them.
(function(root){
 function validateWords(data,texts,duration){
  if(!data||data.kind!=='aligned-words'||!Array.isArray(data.words))throw Error('Aligned word timings unavailable');
  if(!Number.isFinite(duration)||!Number.isFinite(data.duration)||Math.abs(data.duration-duration)>.01)throw Error('Recording duration mismatch');
  if(!/^[a-f0-9]{64}$/.test(data.audioSha256||''))throw Error('Missing audio provenance');
  const grouped=texts.map(()=>[]);let end=0,paragraph=0;
  for(const w of data.words){
   if(!Number.isInteger(w.paragraph)||w.paragraph<paragraph||w.paragraph>=texts.length||typeof w.text!=='string'||!w.text.trim()||/\s/.test(w.text)||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<end-1e-6||w.end<=w.start||w.end>duration+.01)throw Error('Invalid aligned word interval');
   grouped[w.paragraph].push(w);end=w.end;paragraph=w.paragraph;
  }
  for(let i=0;i<texts.length;i++)if(grouped[i].map(w=>w.text).join(' ')!==texts[i].trim().replace(/\s+/g,' '))throw Error('Word transcript mismatch');
  return grouped;
 }
 function currentWord(words,time){let lo=0,hi=words.length-1;while(lo<=hi){const mid=(lo+hi)>>1,w=words[mid];if(time<w.start)hi=mid-1;else if(time>=w.end)lo=mid+1;else return mid;}return -1;}
 function create({audio,button,paragraphs,title,document,loadWords}){
  let mode='paragraph',words=null,spans=[],previous=-1,frame=0;
  const texts=[title.textContent,...paragraphs.map(p=>p.textContent)];
  const label=button.querySelector('.follow-label');
  function paint(){
   const time=audio.currentTime,active=time>0&&!audio.ended;
   paragraphs.forEach(p=>p.classList.toggle('reading',mode==='paragraph'&&active&&time>=Number(p.dataset.start)&&time<Number(p.dataset.end)));
   const next=mode==='word'&&active&&words?currentWord(words,time):-1;
   if(previous!==next){if(previous>=0)spans[previous]?.classList.remove('word-reading');if(next>=0)spans[next]?.classList.add('word-reading');previous=next;}
  }
  function tick(){frame=0;paint();if(!audio.paused&&!audio.ended)frame=root.requestAnimationFrame(tick);}
  function refresh(){paint();if((audio.paused||audio.ended)&&frame){root.cancelAnimationFrame(frame);frame=0;}if(!audio.paused&&!audio.ended&&!frame)frame=root.requestAnimationFrame(tick);}
  const nextModes={off:'word',word:'paragraph',paragraph:'off'};
  function setMode(next){
   if(!Object.hasOwn(nextModes,next)||next==='word'&&!words)return false;
   mode=next;button.dataset.mode=mode;
   const name=mode[0].toUpperCase()+mode.slice(1),nextName=nextModes[mode];
   button.setAttribute('aria-pressed',String(mode!=='off'));
   button.setAttribute('aria-label',`Highlight: ${name}. Click to ${nextName==='off'?'turn highlighting off':`use ${nextName} highlighting`}.`);
   label.textContent=`Highlight: ${name}`;paint();return true;
  }
  button.onclick=()=>{if(words)setMode(nextModes[mode]);};
  button.disabled=true;button.title='Paragraph follow; word timings are loading';setMode('paragraph');
  ['timeupdate','play','pause','ended','seeked','loadedmetadata'].forEach(event=>audio.addEventListener(event,refresh));
  const ready=loadWords().then(data=>{
   const grouped=validateWords(data,texts,audio.duration);
   const filename=audio.dataset.src.split('/').pop();
   if(filename!==data.audioFile)throw Error('Recording filename mismatch');
   const prefix=filename.match(/^narration-([a-f0-9]+)\.wav$/)?.[1];
   if(!prefix||!data.audioSha256.startsWith(prefix))throw Error('Recording hash mismatch');
   words=[];spans=[];
   // The title is spoken but is not decorated; word following is confined to the article.
   paragraphs.forEach((p,i)=>{
    const tokens=p.textContent.match(/\S+|\s+/g)||[];let n=0;const fragment=document.createDocumentFragment();
    for(const token of tokens){if(/^\s+$/.test(token)){fragment.append(document.createTextNode(token));continue;}const span=document.createElement('span');span.className='follow-word';span.textContent=token;fragment.append(span);words.push(grouped[i+1][n++]);spans.push(span);}
    p.replaceChildren(fragment);
   });
   button.disabled=false;button.title='Cycle highlighting: Off → Word → Paragraph → Off';refresh();return true;
  }).catch(()=>{button.title='Word follow is unavailable; paragraph follow remains on';return false;});
  return {ready,paint,setMode,nextMode:()=>button.onclick(),getMode:()=>mode,destroy(){if(frame)root.cancelAnimationFrame(frame);}};
 }
 const api={validateWords,currentWord,create};if(typeof module==='object'&&module.exports)module.exports=api;else root.PipreadFollow=api;
})(typeof window==='object'?window:globalThis);
