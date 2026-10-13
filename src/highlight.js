// Approximate word positions only. No forced aligner or word timestamps are supplied by Kokoro.
export function speechActivity(samples, rate) {
  const hop = Math.max(1, Math.round(rate * .02));
  const rms = [];
  for (let i=0;i<samples.length;i+=hop) {
    let sum=0; const end=Math.min(samples.length,i+hop);
    for(let j=i;j<end;j++) sum+=samples[j]*samples[j];
    rms.push(Math.sqrt(sum/(end-i)));
  }
  const threshold=Math.max(.002,Math.max(0,...rms)*.04);
  const active=rms.flatMap((v,i)=>v>threshold ? [i*hop/rate] : []);
  return {active, step:hop/rate, duration:samples.length/rate};
}

export function approximateWords(text, activity) {
  if (!activity?.active.length || /\d|\b(?:Dr|Mr|Mrs|Ms|Prof|St|etc)\.|(?:[A-Za-z]\.){2,}/i.test(text)) return [];
  const words=[...new Intl.Segmenter('en',{granularity:'word'}).segment(text)].filter(w=>w.isWordLike);
  if (!words.length) return [];
  // Syllable estimates allocate voiced time; pauses measured from PCM are excluded.
  const weights=words.map(w=>Math.max(1,(w.segment.toLowerCase().replace(/e$/,'').match(/[aeiouy]+/g)||[]).length));
  const total=weights.reduce((a,b)=>a+b,0);let used=0;
  return words.map((w,i)=>{
    const start=activity.active[Math.min(activity.active.length-1,Math.floor(used/total*activity.active.length))];
    used+=weights[i];
    const end=i===words.length-1 ? activity.active.at(-1)+activity.step : activity.active[Math.min(activity.active.length-1,Math.floor(used/total*activity.active.length))];
    return {start,end,offset:w.index,length:w.segment.length};
  });
}

let serial=0;
export class ReadingHighlight {
  constructor(doc=document) { this.doc=doc;this.name=`article-voice-${++serial}`; }
  get supported() { return !!this.doc.defaultView.CSS?.highlights && !!this.doc.defaultView.Highlight; }
  clear() { this.doc.defaultView.CSS?.highlights?.delete(this.name);this.style?.remove();this.style=null;this.last=null; }
  render(mapped, mode, seconds, timings) {
    if(!this.supported || !mapped) { this.clear();return; }
    const word=mode==='words' && timings?.find(w=>seconds>=w.start && seconds<w.end);
    // During measured silence, retain passage context but no guessed active word.
    const from=word ? word.offset:0,to=word ? word.offset+word.length:mapped.points.length;
    const key=`${mode}:${from}:${to}`;
    if(this.last?.mapped===mapped && this.last.key===key) return;
    this.clear();
    const ranges=[]; let range=null, prior=null;
    for(const p of mapped.points.slice(from,to)) {
      if(!p) continue;
      if(!p.node.isConnected) {this.clear();return;}
      if(prior && prior.node===p.node && prior.offset+1===p.offset) range.setEnd(p.node,p.offset+1);
      else {range=this.doc.createRange();range.setStart(p.node,p.offset);range.setEnd(p.node,p.offset+1);ranges.push(range);}
      prior=p;
    }
    const style=this.doc.createElement('style');
    style.textContent=`::highlight(${this.name}) { background-color: ${word ? '#ffcb9d' : '#ffe8d0'}; color: #20221f; }`;
    this.doc.head.append(style);this.style=style;
    this.doc.defaultView.CSS.highlights.set(this.name,new this.doc.defaultView.Highlight(...ranges));
    this.last={mapped,key,word:word||null};
  }
}
