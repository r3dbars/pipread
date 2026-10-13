import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

mkdirSync('docs/screenshots', { recursive: true });

async function mock(page, { error = false, slow = false, gpu = false } = {}) {
  await page.addInitScript(({ error, slow, gpu }) => {
    Object.defineProperty(navigator, 'gpu', { value: gpu ? { requestAdapter: async () => ({}) } : undefined });
    window.workerCalls = [];
    window.Worker = class {
      constructor() { this.dead = false; window.workerCalls.push({ type: 'created' }); }
      postMessage(data) {
        window.workerCalls.push(data);
        setTimeout(() => {
          if (this.dead) return;
          if (error) return this.onmessage({ data: { type: 'error', message: 'Test network failure' } });
          if (data.type === 'load') this.onmessage({ data: { type: 'ready', ms: 15 } });
          else this.onmessage({ data: { type: 'audio', index: data.index, samples: new Float32Array(24000 * 8).fill(.01), sampleRate: 24000, ms: 20 } });
        }, slow ? 800 : 30);
      }
      terminate() { this.dead = true; window.workerCalls.push({ type: 'terminated' }); }
    };
  }, { error, slow, gpu });
  await page.goto('/examples/browser-local.html');
}
const player = page => page.locator('article-voice');
const state = page => page.evaluate(() => document.querySelector('article-voice').state);

test('extraction excludes navigation, code, hidden descendants and player; chunks bounded', async ({ page }) => {
  await page.goto('/examples/browser-local.html');
  const result = await page.evaluate(async () => {
    const { extractArticle, chunkText } = await import('/src/text.js');
    const root = document.createElement('article'); root.id = 'fixture';
    root.innerHTML = '<h2>Title</h2><p>Hello <em>world</em>.</p><nav>NO NAV</nav><pre>NO CODE</pre><p hidden>NO HIDDEN</p><div style="display:none">NO CSS</div><p>Read <code>NO INLINE CODE</code> this.</p><div aria-hidden="true">NO ARIA</div><span data-no-read>NO OPT OUT</span><details><summary>Visible summary</summary><p>NO CLOSED DETAILS</p></details>';
    document.body.append(root);
    return { text: extractArticle('#fixture'), chunks: chunkText('word '.repeat(150) + '\n' + 'x'.repeat(500)) };
  });
  expect(result.text).toBe('Title\nHello world.\nRead this.\nVisible summary');
  expect(result.chunks.every(c => c.length <= 240 && c.length > 0)).toBe(true);
});

test('pause/resume repeatedly, speed, bounded prefetch and stop', async ({ page }) => {
  await mock(page);
  await player(page).getByRole('button', { name: 'Listen to this article' }).click();
  await expect.poll(() => state(page)).toBe('playing');
  for (let i = 0; i < 4; i++) {
    await player(page).getByRole('button', { name: 'Pause', exact: false }).click();
    await expect.poll(() => state(page)).toBe('paused');
    await player(page).getByRole('button', { name: 'Resume' }).click();
    await expect.poll(() => state(page)).toBe('playing');
  }
  await player(page).getByLabel('Playback speed').selectOption('1.5');
  expect(await page.evaluate(() => document.querySelector('article-voice').source.playbackRate)).toBe(1.5);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.workerCalls.filter(x => x.type === 'generate').length)).toBe(2);
  await player(page).getByRole('button', { name: 'Stop', exact: true }).click();
  await expect.poll(() => state(page)).toBe('idle');
  expect(await page.evaluate(() => document.querySelector('article-voice').source)).toBeNull();
});

test('cancel loading, late results do not play, restart works', async ({ page }) => {
  await mock(page, { slow: true });
  await player(page).getByRole('button', { name: 'Listen to this article' }).click();
  await player(page).getByRole('button', { name: 'Cancel loading' }).click();
  await page.waitForTimeout(1000);
  expect(await state(page)).toBe('idle');
  expect(await page.evaluate(() => window.workerCalls.filter(x => x.type === 'generate').length)).toBe(0);
  await player(page).getByRole('button', { name: 'Listen to this article' }).click();
  await expect.poll(() => state(page)).toBe('playing');
});

test('switch selector cancels old session and reads new text', async ({ page }) => {
  await mock(page);
  await player(page).getByRole('button', { name: 'Listen to this article' }).click();
  await expect.poll(() => state(page)).toBe('playing');
  await page.evaluate(() => { const p=document.createElement('p');p.id='other';p.textContent='A different article.';document.body.append(p);document.querySelector('article-voice').setAttribute('article','#other'); });
  expect(await state(page)).toBe('idle');
  await player(page).getByRole('button', { name: 'Listen to this article' }).click();
  await expect.poll(() => state(page)).toBe('playing');
  expect(await page.evaluate(() => window.workerCalls.filter(x => x.type === 'generate').at(-1).text)).toBe('A different article.');
});

test('unsupported explicit GPU errors; auto selects CPU', async ({ page }) => {
  await mock(page);
  await page.selectOption('#backend', 'webgpu');
  await player(page).getByRole('button', { name: 'Listen to this article' }).click();
  await expect.poll(() => state(page)).toBe('error');
  await expect(player(page).getByRole('status')).toContainText('WebGPU is unavailable');
  await page.selectOption('#backend', 'auto');
  await player(page).getByRole('button', { name: 'Listen to this article' }).click();
  await expect.poll(() => state(page)).toBe('playing');
  expect(await page.evaluate(() => window.workerCalls.find(x => x.type === 'load').backend)).toBe('wasm');
});

test('network error is recoverable UI; no uncontrolled retry', async ({ page }) => {
  await mock(page, { error: true });
  await player(page).getByRole('button', { name: 'Listen to this article' }).click();
  await expect.poll(() => state(page)).toBe('error');
  await expect(player(page).getByRole('status')).toContainText('Test network failure');
  await expect(player(page).getByRole('button', { name: 'Try again' })).toBeVisible();
  expect(await page.evaluate(() => window.workerCalls.filter(x=>x.type==='load').length)).toBe(1);
});

test('invalid, absent, empty and hidden article targets are actionable errors', async ({ page }) => {
  await mock(page);
  for (const selector of ['[', '#missing', '#empty', '#hidden-parent p']) {
    await page.evaluate(selector => { if(!document.querySelector('#empty')) {const d=document.createElement('div');d.innerHTML='<article id="empty"></article><div id="hidden-parent" hidden><p>Secret</p></div>';document.body.append(d);}document.querySelector('article-voice').setAttribute('article',selector); },selector);
    await player(page).getByRole('button', { name: /Listen to this article|Try again/ }).click();
    await expect.poll(() => state(page)).toBe('error');
  }
});

test('desktop and narrow layout render without horizontal overflow or page errors', async ({ page }) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/examples/browser-local.html');
  await expect(page).toHaveTitle('Pipread — Give your blog a play button');
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  for (const width of [1440,390]) {await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);await expect(player(page).getByRole('button',{name:'Listen to this article'})).toBeVisible();await page.screenshot({path:`/tmp/article-voice-${width}.png`,fullPage:true});}
  expect(errors).toEqual([]);
});

test('GPU failure stops with explicit CPU guidance and does not auto-download CPU', async ({ page }) => {
  await mock(page,{gpu:true,error:true});
  await player(page).getByRole('button',{name:'Listen to this article'}).click();
  await expect.poll(()=>state(page)).toBe('error');
  await expect(player(page).getByRole('status')).toContainText('GPU failed');
  expect(await page.evaluate(()=>window.workerCalls.filter(x=>x.type==='load').map(x=>x.backend))).toEqual(['webgpu']);
});

test('detaching during loading terminates the worker', async ({ page }) => {
  await mock(page,{slow:true});
  await player(page).getByRole('button',{name:'Listen to this article'}).click();
  await expect.poll(()=>page.evaluate(()=>window.workerCalls.some(x=>x.type==='load'))).toBe(true);
  await page.evaluate(()=>document.querySelector('article-voice').remove());
  await page.waitForTimeout(1000);
  expect(await page.evaluate(()=>window.workerCalls.some(x=>x.type==='terminated'))).toBe(true);
  expect(await page.evaluate(()=>window.workerCalls.some(x=>x.type==='generate'))).toBe(false);
});

test('end of article releases resources and offers replay', async ({ page }) => {
  await mock(page);
  await page.evaluate(()=>{document.querySelector('#story').append(Object.assign(document.createElement('p'),{id:'one',textContent:'One sentence.'}));document.querySelector('article-voice').setAttribute('article','#one')});
  await player(page).getByRole('button',{name:'Listen to this article'}).click();
  await expect.poll(()=>state(page)).toBe('playing');
  await player(page).getByLabel('Playback speed').selectOption('2');
  await expect.poll(()=>state(page),{timeout:10000}).toBe('ended');
  await expect(player(page).getByRole('button',{name:'Listen again'})).toBeVisible();
  expect(await page.evaluate(()=>document.querySelector('article-voice').worker)).toBeNull();
});

test('IndexedDB cache stores exact bytes and reports storage failures without failing playback', async ({page})=>{
  await page.goto('/examples/browser-local.html');
  const result=await page.evaluate(async()=>{
    const {createModelCache}=await import('/src/model-cache.js');
    const events=[];const cache=createModelCache(x=>events.push(x));
    await cache.put('fixture',new Response('voice fixture'));
    const body=await (await cache.match('fixture')).text();
    Object.defineProperty(window,'indexedDB',{configurable:true,value:{open(){throw new Error('Storage unavailable')}}});
    const blocked=createModelCache(x=>events.push(x));
    const missing=await blocked.match('fixture');await blocked.put('fixture',new Response('test'));
    return {body,missing:missing===undefined,events};
  });
  expect(result.body).toBe('voice fixture');expect(result.missing).toBe(true);
  expect(result.events.some(x=>x.type==='cache-warning')).toBe(true);
});

test('native speed preserves measured pitch and changes duration', async ({page})=>{
  await page.goto('/examples/browser-local.html');await page.locator('h1').click();
  const measurements=await page.evaluate(async()=>{
    const {pcmWav}=await import('/src/audio.js');
    const sampleRate=24000,pcm=Float32Array.from({length:sampleRate*12},(_,i)=>.2*Math.sin(2*Math.PI*440*i/sampleRate));
    const audio=new Audio(URL.createObjectURL(pcmWav(pcm,sampleRate)));
    const context=new AudioContext();await context.resume();
    const source=context.createMediaElementSource(audio),analyser=context.createAnalyser();analyser.fftSize=8192;analyser.smoothingTimeConstant=0;source.connect(analyser);analyser.connect(context.destination);
    const results=[];
    for(const [rate,preserve] of [[.75,true],[1,true],[1.25,true],[1.5,true],[2,true],[2,false]]){
      audio.pause();audio.currentTime=0;audio.playbackRate=rate;audio.preservesPitch=preserve;await audio.play();
      // Exclude initial decoder/output startup from the steady-state rate measurement.
      await new Promise(resolve=>setTimeout(resolve,250));
      const start=performance.now(),mediaStart=audio.currentTime;
      await new Promise(resolve=>setTimeout(resolve,850));
      const bins=new Float32Array(analyser.frequencyBinCount);analyser.getFloatFrequencyData(bins);
      let peak=0;for(let i=1;i<bins.length;i++)if(bins[i]>bins[peak])peak=i;
      results.push({rate,preserve,hz:peak*context.sampleRate/analyser.fftSize,measuredRate:(audio.currentTime-mediaStart)/((performance.now()-start)/1000)});
    }
    audio.pause();URL.revokeObjectURL(audio.src);await context.close();return results;
  });
  writeFileSync('/tmp/article-voice-pitch.json',JSON.stringify(measurements,null,2));
  console.log('PITCH_EVIDENCE',JSON.stringify(measurements));
  for(const m of measurements){expect(Math.abs(m.hz-(m.preserve?440:880))).toBeLessThan(25);expect(Math.abs(m.measuredRate-m.rate)).toBeLessThan(.18);}
});

test('autoplay denial offers Resume, and Stop during pending play stays stopped', async ({page})=>{
  await mock(page);
  await page.evaluate(()=>{
    const play=HTMLMediaElement.prototype.play;let deny=true;
    HTMLMediaElement.prototype.play=function(){if(deny){deny=false;return Promise.reject(new DOMException('Gesture required','NotAllowedError'))}return play.call(this)};
  });
  await player(page).getByRole('button',{name:'Listen to this article'}).click();
  await expect.poll(()=>state(page)).toBe('paused');
  await expect(player(page).getByRole('status')).toContainText('Press Resume');
  await player(page).getByRole('button',{name:'Resume'}).click();
  await expect.poll(()=>state(page)).toBe('playing');
  await player(page).getByRole('button',{name:'Stop',exact:true}).click();
  await page.evaluate(()=>{const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){return new Promise((resolve,reject)=>setTimeout(()=>play.call(this).then(resolve,reject),300))}});
  await player(page).getByRole('button',{name:'Listen to this article'}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.querySelector('article-voice').source)).toBe(true);
  await player(page).getByRole('button',{name:'Stop',exact:true}).click();
  await page.waitForTimeout(500);expect(await state(page)).toBe('idle');
  expect(await page.evaluate(()=>document.querySelector('article-voice').audioURL)).toBeNull();
});


test('explicit CPU retry is available in a plain embed after unavailable GPU',async({page})=>{
  await mock(page);await page.selectOption('#backend','webgpu');
  await player(page).getByRole('button',{name:'Listen to this article'}).click();
  await expect.poll(()=>state(page)).toBe('error');
  await player(page).getByRole('button',{name:'Try CPU (~93 MB)',exact:true}).click();
  await expect.poll(()=>state(page)).toBe('playing');
  expect(await page.evaluate(()=>window.workerCalls.find(x=>x.type==='load').backend)).toBe('wasm');
});

test('expanded timeline, cross-chunk skips, keyboard seek, mute and speed survive transitions', async ({page})=>{
  await mock(page);
  await expect(player(page).getByRole('slider')).toBeHidden();
  await player(page).getByRole('button',{name:'Listen to this article'}).click();
  await expect.poll(()=>state(page)).toBe('playing');
  await player(page).getByRole('button',{name:'Pause',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>document.querySelector('article-voice').knownDuration)).toBe(16);
  await expect(player(page).locator('.duration')).toHaveText('00:16+');
  await player(page).getByRole('button',{name:'Mute',exact:true}).click();
  await player(page).getByLabel('Playback speed').selectOption('1.5');
  await player(page).getByRole('button',{name:'Forward 15 seconds'}).click();
  await expect.poll(()=>page.evaluate(()=>document.querySelector('article-voice').currentChunk.index)).toBe(1);
  expect(await page.evaluate(()=>document.querySelector('article-voice').source.muted)).toBe(true);
  expect(await page.evaluate(()=>document.querySelector('article-voice').source.playbackRate)).toBe(1.5);
  expect(await state(page)).toBe('paused');
  await player(page).getByRole('button',{name:'Back 15 seconds'}).click();
  expect(await page.evaluate(()=>document.querySelector('article-voice').currentChunk.index)).toBe(0);
  await page.evaluate(()=>document.querySelector('article-voice').seek(10));
  expect(await page.evaluate(()=>document.querySelector('article-voice').currentChunk.index)).toBe(1);
  await player(page).getByRole('slider').press('ArrowLeft');
  await expect.poll(()=>page.evaluate(()=>document.querySelector('article-voice').elapsed())).toBeCloseTo(9.9,1);
  await player(page).getByRole('button',{name:'Resume'}).click();
  await expect.poll(()=>state(page)).toBe('playing');
  await page.evaluate(()=>document.querySelector('article-voice').seek(15.9));
  await expect.poll(()=>page.evaluate(()=>document.querySelector('article-voice').currentChunk?.index)).toBe(2);
  await expect(player(page).getByRole('button',{name:'Unmute'})).toHaveAttribute('aria-pressed','true');
  await player(page).getByRole('button',{name:'Unmute'}).click();
  expect(await page.evaluate(()=>document.querySelector('article-voice').source.muted)).toBe(false);
});

test('seek cannot skip unknown audio, long-session history is bounded, completion and restart work',async({page})=>{
  await mock(page);
  await player(page).getByRole('button',{name:'Listen to this article'}).click();
  await expect.poll(()=>state(page)).toBe('playing');
  await player(page).getByRole('button',{name:'Pause',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>document.querySelector('article-voice').knownDuration)).toBe(16);
  await page.evaluate(()=>document.querySelector('article-voice').seek(999));
  expect(await page.evaluate(()=>document.querySelector('article-voice').elapsed())).toBeLessThanOrEqual(16);
  await expect(player(page).getByRole('status')).toContainText('Reached the prepared audio');
  const bounds=await page.evaluate(()=>{const p=document.querySelector('article-voice');p.clips=Array.from({length:40},(_,index)=>({index,start:index*8,blob:new Blob([new Uint8Array(1024*1024)])}));p.historyBytes=40*1024*1024;p.played=39;p.trimHistory();return {bytes:p.historyBytes,first:p.clips[0].index}});
  expect(bounds.bytes).toBeLessThanOrEqual(32*1024*1024);expect(bounds.first).toBe(8);
  await player(page).getByRole('button',{name:'Stop',exact:true}).click();
  await page.evaluate(()=>{const p=document.createElement('p');p.id='short';p.textContent='One sentence.';document.body.append(p);document.querySelector('article-voice').setAttribute('article','#short')});
  await player(page).getByRole('button',{name:'Listen to this article'}).click();
  await expect.poll(()=>state(page)).toBe('playing');
  await expect(player(page).locator('.duration')).toHaveText('00:08');
  await page.evaluate(()=>document.querySelector('article-voice').seek(7.9));
  await expect.poll(()=>state(page)).toBe('ended');
  await player(page).getByRole('button',{name:'Listen again'}).click();
  await expect.poll(()=>state(page)).toBe('playing');
});

test('retry after one worker failure succeeds; expanded layouts fit desktop and narrow widths',async({page})=>{
  await mock(page);
  await page.evaluate(()=>{const W=Worker;let first=true;window.Worker=class extends W {postMessage(d){if(first){first=false;setTimeout(()=>this.onmessage({data:{type:'error',message:'Temporary failure'}}),10)}else super.postMessage(d)}}});
  await player(page).getByRole('button',{name:'Listen to this article'}).click();
  await expect.poll(()=>state(page)).toBe('error');
  await player(page).getByRole('button',{name:'Try again'}).click();
  await expect.poll(()=>state(page)).toBe('playing');
  await player(page).getByRole('button',{name:'Pause',exact:true}).click();
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:800});
    expect(await page.evaluate(()=>{const p=document.querySelector('article-voice');return p.shadowRoot.querySelector('.player').scrollWidth<=p.clientWidth})).toBe(true);
    await expect(player(page).getByRole('slider')).toBeVisible();
    await page.screenshot({path:`docs/screenshots/player-${width}.png`});
  }
});

test('highlight maps original DOM across inline formatting and repetition without changing content',async({page})=>{
  await mock(page);
  const result=await page.evaluate(async()=>{
    const {snapshotArticle,chunkText,mapChunks}=await import('/src/text.js');
    const {ReadingHighlight}=await import('/src/highlight.js');
    const root=document.createElement('article');root.id='mapped';root.innerHTML='<p>Go <a href="#hello">go</a>, <em>go</em>! Dr. Smith paid $12.50 at 9:30 a.m.</p><p>A <strong>split</strong>word and <code>hidden</code> text.</p>';document.body.append(root);
    const html=root.innerHTML,snapshot=snapshotArticle('#mapped'),maps=mapChunks(snapshot,chunkText(snapshot.text));
    const mapped=maps.map(m=>m.points.filter(Boolean).map(p=>p.node.textContent[p.offset]).join('')).join('');
    const h=new ReadingHighlight();h.render(maps[0],'passage',0,[]);
    const ranges=[...CSS.highlights.get(h.name)].map(r=>r.toString());
    const selection=getSelection();selection.selectAllChildren(root.querySelector('a'));const selected=selection.toString();h.clear();
    return {text:snapshot.text,mapped,unchanged:html===root.innerHTML,ranges,selected,remaining:CSS.highlights.has(h.name),href:root.querySelector('a').getAttribute('href')};
  });
  expect(result.mapped).toBe(result.text.replace(/\s/g,''));expect(result.unchanged).toBe(true);expect(result.href).toBe('#hello');expect(result.selected).toBe('go');expect(result.remaining).toBe(false);expect(result.ranges.join('')).toContain('Gogo,go!');
});

test('optional highlight follows media seeks, pause, skips, speed, mute, disable and cancel',async({page})=>{
  await mock(page);await player(page).getByRole('button',{name:'Listen to this article'}).click();await expect.poll(()=>state(page)).toBe('playing');
  expect(await player(page).getByLabel('Highlight as read').isChecked()).toBe(false);
  await player(page).getByLabel('Highlight as read').check();await player(page).getByLabel('Highlight mode').selectOption('words');
  await player(page).getByRole('button',{name:'Pause',exact:true}).click();
  await page.evaluate(()=>document.querySelector('article-voice').seek(1));
  const key=await page.evaluate(()=>document.querySelector('article-voice').highlighter.last.key);
  await page.waitForTimeout(150);expect(await page.evaluate(()=>document.querySelector('article-voice').highlighter.last.key)).toBe(key);
  await page.evaluate(()=>document.querySelector('article-voice').seek(6));
  expect(await page.evaluate(()=>document.querySelector('article-voice').highlighter.last.key)).not.toBe(key);
  await player(page).getByRole('button',{name:'Forward 15 seconds'}).click();
  expect(await page.evaluate(()=>{const p=document.querySelector('article-voice');return p.highlighter.last.mapped===p.mappedChunks[p.currentChunk.index]})).toBe(true);
  await player(page).getByLabel('Playback speed').selectOption('2');await player(page).getByRole('button',{name:'Mute',exact:true}).click();await player(page).getByRole('button',{name:'Resume'}).click();await expect.poll(()=>state(page)).toBe('playing');
  await player(page).getByLabel('Highlight as read').uncheck();expect(await page.evaluate(()=>document.querySelector('article-voice').highlighter.last)).toBeNull();
  await player(page).getByLabel('Highlight as read').check();await player(page).getByRole('button',{name:'Stop',exact:true}).click();expect(await page.evaluate(()=>CSS.highlights.size)).toBe(0);
});

test('numeric and abbreviation passages fall back; actual generated PCM produces bounded audio-driven estimates',async({page})=>{
  test.skip(!existsSync('docs/samples/heart-wasm.wav'), 'Optional local generated PCM fixture; see docs/SETUP.md');
  await page.goto('/examples/browser-local.html');
  const result=await page.evaluate(async()=>{
    const {speechActivity,approximateWords}=await import('/src/highlight.js');
    const context=new AudioContext();const buffer=await context.decodeAudioData(await (await fetch('/docs/samples/heart-wasm.wav')).arrayBuffer());
    const activity=speechActivity(buffer.getChannelData(0),buffer.sampleRate);
    const timings=approximateWords('A little room to listen.',activity);
    const numeric=approximateWords('Dr. Smith paid $12.50 at 9:30 a.m.',activity);
    await context.close();return {duration:buffer.duration,activeFrames:activity.active.length,firstActivity:activity.active[0],lastActivity:activity.active.at(-1),timings,numeric};
  });
  writeFileSync('docs/highlight-audio-measurements.json',JSON.stringify(result,null,2));
  expect(result.activeFrames).toBeGreaterThan(5);expect(result.timings).toHaveLength(5);expect(result.numeric).toEqual([]);
  for(const w of result.timings){expect(w.start).toBeGreaterThanOrEqual(0);expect(w.end).toBeGreaterThanOrEqual(w.start);expect(w.end).toBeLessThanOrEqual(result.duration+.02)}
});

test('host edits invalidate highlighting; ending and restart clear stale ranges',async({page})=>{
  await mock(page);await page.evaluate(()=>{const p=document.createElement('p');p.id='single-highlight';p.textContent='One short sentence.';document.body.append(p);document.querySelector('article-voice').setAttribute('article','#single-highlight')});
  await player(page).getByRole('button',{name:'Listen to this article'}).click();await expect.poll(()=>state(page)).toBe('playing');await player(page).getByLabel('Highlight as read').check();
  await page.evaluate(()=>document.querySelector('#single-highlight').textContent='Changed sentence.');
  await expect.poll(()=>page.evaluate(()=>CSS.highlights.size)).toBe(0);
  await player(page).getByRole('button',{name:'Stop',exact:true}).click();await player(page).getByRole('button',{name:'Listen to this article'}).click();await expect.poll(()=>state(page)).toBe('playing');
  expect(await page.evaluate(()=>CSS.highlights.size)).toBe(1);await page.evaluate(()=>document.querySelector('article-voice').seek(7.9));await expect.poll(()=>state(page)).toBe('ended');expect(await page.evaluate(()=>CSS.highlights.size)).toBe(0);
});

test('landing call to action starts the same live local player',async({page})=>{
  await mock(page);
  await page.getByRole('link',{name:'Try listening'}).click();
  await expect.poll(()=>state(page)).toBe('playing');
  await expect(player(page).getByRole('button',{name:'Pause',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.workerCalls.filter(x=>x.type==='load').length)).toBe(1);
  await player(page).getByRole('button',{name:'Pause',exact:true}).click();
  await page.screenshot({path:'docs/screenshots/pipread-approved-style.png',fullPage:true});
});
