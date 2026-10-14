const assert=require('assert');
const {validateWords,currentWord,create}=require('../public/follow.js');
// Synthetic unit fixture only. Never bundled as production timing data.
const data={kind:'aligned-words',audioFile:'narration-abcdef.wav',audioSha256:'abcdef'+'0'.repeat(58),duration:5,words:[{paragraph:0,text:'Title',start:0,end:.5},{paragraph:1,text:'Hello,',start:1,end:1.4},{paragraph:1,text:'world.',start:1.5,end:2},{paragraph:2,text:'Again.',start:3,end:4}]};
const texts=['Title','Hello, world.','Again.'];
assert.equal(validateWords(data,texts,5).length,3);
for(const bad of [{...data,kind:'estimated'},{...data,duration:6},{...data,duration:undefined},{...data,duration:'5'},{...data,audioSha256:null},{...data,words:[]},{...data,words:[...data.words,{paragraph:2,text:'extra',start:2,end:3}]}])assert.throws(()=>validateWords(bad,texts,5));
assert.throws(()=>validateWords(data,['Title','Wrong text','Again.'],5));
assert.equal(currentWord(data.words,1.2),1);assert.equal(currentWord(data.words,1.4),-1);assert.equal(currentWord(data.words,1.5),2);assert.equal(currentWord(data.words,4),-1);assert.equal(currentWord(data.words,0),0);
function element(text='') {const classes=new Set();return{textContent:text,dataset:{},attrs:{},children:[],classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),toggle(n,on){on?classes.add(n):classes.delete(n)}},setAttribute(k,v){this.attrs[k]=v},replaceChildren(fragment){this.children=fragment.children;assert.equal(this.children.map(x=>x.textContent).join(''),this.textContent)},append(child){this.children.push(child)}}}
function environment(loaded=data){
 const paragraphs=[element(texts[1]),element(texts[2])];Object.assign(paragraphs[0].dataset,{start:1,end:2});Object.assign(paragraphs[1].dataset,{start:3,end:4});
 const button=element(),label=element();button.querySelector=()=>label;
 const events={};const audio={playbackRate:1,currentTime:1.2,duration:5,paused:true,ended:false,dataset:{src:'assets/narration-abcdef.wav'},addEventListener(n,fn){(events[n]??=[]).push(fn)},emit(n){for(const fn of events[n]||[])fn()}};
 const document={createDocumentFragment:()=>element(),createTextNode:element,createElement:()=>element()};
 const controller=create({audio,button,paragraphs,title:element('Title'),document,loadWords:()=>Promise.resolve(loaded)});return{controller,audio,button,label,paragraphs};
}
(async()=>{
 const e=environment();assert.equal(e.controller.getMode(),'paragraph');assert(e.paragraphs[0].classList.contains('reading'));assert.equal(await e.controller.ready,true);assert.equal(e.button.disabled,false);
 e.button.onclick();assert.equal(e.controller.getMode(),'off');assert.equal(e.button.attrs['aria-pressed'],'false');assert(!e.paragraphs[0].classList.contains('reading'));e.button.onclick();assert.equal(e.controller.getMode(),'word');assert.equal(e.label.textContent,'Highlight: Word');assert.equal(e.button.attrs['aria-pressed'],'true');assert(!e.paragraphs[0].classList.contains('reading'));assert(e.paragraphs[0].children[0].classList.contains('word-reading'));
 e.audio.currentTime=1.45;e.controller.paint();assert(!e.paragraphs[0].children[0].classList.contains('word-reading'));
 e.audio.currentTime=3.5;e.controller.paint();assert(e.paragraphs[1].children[0].classList.contains('word-reading'));
 e.audio.currentTime=.2;e.controller.paint();assert(!e.paragraphs[1].children[0].classList.contains('word-reading'));
 e.audio.currentTime=1.6;e.controller.paint();assert(e.paragraphs[0].children[2].classList.contains('word-reading'));
 e.button.onclick();assert.equal(e.controller.getMode(),'paragraph');assert(!e.paragraphs[0].children[2].classList.contains('word-reading'));assert(e.paragraphs[0].classList.contains('reading'));
 for(let n=0;n<21;n++)e.button.onclick();assert.equal(e.controller.getMode(),'paragraph');
 e.button.onclick();e.button.onclick();assert.equal(e.controller.getMode(),'word');e.audio.currentTime=3.5;e.audio.playbackRate=2;e.audio.emit('seeked');assert(e.paragraphs[1].children[0].classList.contains('word-reading'));e.audio.paused=true;e.audio.emit('pause');assert(e.paragraphs[1].children[0].classList.contains('word-reading'));e.audio.currentTime=1.2;e.audio.playbackRate=.75;e.audio.emit('timeupdate');assert(e.paragraphs[0].children[0].classList.contains('word-reading'));e.button.onclick();assert.equal(e.controller.getMode(),'paragraph');
 e.audio.ended=true;e.controller.paint();assert(!e.paragraphs[0].classList.contains('reading'));
 const bad=environment({...data,kind:'estimated'});assert.equal(await bad.controller.ready,false);assert(bad.button.disabled);assert.equal(bad.controller.setMode('word'),false);bad.button.onclick();assert.equal(bad.controller.getMode(),'paragraph');assert(bad.paragraphs[0].classList.contains('reading'));
 const wrongAudio=environment({...data,audioFile:'other.wav'});assert.equal(await wrongAudio.controller.ready,false);assert(wrongAudio.button.disabled);
 console.log('PASS: three-state Off → Word → Paragraph cycle, pause/speed/seek behavior, exact transcript/provenance validation, no estimates, word intervals/gaps/seek/title/end, repeated toggles, text preservation, missing/mismatched data fallback.');
})().catch(e=>{console.error(e);process.exitCode=1});
