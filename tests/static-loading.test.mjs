import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function fixture(){
  let Player,resolveTiming,clears=0,plays=0;
  const el=()=>({textContent:'',disabled:false,value:'1',checked:false,querySelector(){return el();}});
  const audio={paused:true,ended:false,currentTime:0,async play(){plays++;this.paused=false;},pause(){this.paused=true;},load(){},removeAttribute(){}};
  class Element {
    attachShadow(){this.shadowRoot={querySelector:s=>s==='audio'?audio:el(),querySelectorAll:()=>[]};}
    getAttribute(n){return {manifest:'/audio/manifest.json',article:'post.html',selector:'article'}[n];}
  }
  const timing=new Promise(r=>resolveTiming=r);
  const context={HTMLElement:Element,AbortController,URL,location:{href:'http://localhost/',origin:'http://localhost'},cancelAnimationFrame(){},requestAnimationFrame(){return 1;},CSS:{highlights:{delete(){clears++;}}},customElements:{get(){},define(n,c){Player=c;}},fetch:async url=>url.endsWith('manifest.json')?{ok:true,json:async()=>({version:1,articles:{'post.html':{audio:'a'.repeat(64)+'.wav',timing:'b'.repeat(64)+'.json'}}})}:timing};
  vm.runInNewContext(readFileSync(new URL('../src/pipread-audio.js',import.meta.url),'utf8').replaceAll('export ',''),context);
  return {player:new Player(),resolveTiming,plays:()=>plays,clears:()=>clears};
}
const flush=()=>new Promise(r=>setImmediate(r));
test('stalled optional timing fetch does not block audio; stale results are ignored',async()=>{
 const f=fixture();await f.player.toggle();assert.equal(f.plays(),1);assert.equal(f.player.ready,true);assert.equal(f.player.timing,null);
 f.player.reset();f.resolveTiming({ok:true,json:async()=>({version:1,paragraphs:[{text:'Old',start:0,end:1}]})});await flush();assert.equal(f.player.timing,null);
});
test('audio failure clears active highlight',async()=>{
 const f=fixture();let readerCleared=false;f.player.reader={clear(){readerCleared=true;}};f.player.audio.onerror();assert.equal(readerCleared,true);assert(f.clears()>0);assert.equal(f.player.ready,false);
 f.player.highlight.checked=true;f.player.timing={paragraphs:[{text:'Old',start:0,end:1}]};f.player.mappingAttempted=true;f.player.reader.paint=()=>assert.fail('An audio error must not restore stale highlighting');f.player.paint();
});
test('valid optional metadata arrives after playback starts',async()=>{
 const f=fixture();await f.player.toggle();f.resolveTiming({ok:true,json:async()=>({version:1,paragraphs:[{text:'Ready',start:0,end:1}]})});await flush();assert.equal(f.player.timing.paragraphs[0].text,'Ready');assert.equal(f.plays(),1);
});
