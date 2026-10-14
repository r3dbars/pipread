import {test, expect} from '@playwright/test';
import {pcmWav} from '../src/audio.js';
const audioName='a'.repeat(64)+'.wav', timingName='b'.repeat(64)+'.json';
const wav=Buffer.from(await pcmWav(new Float32Array(24000*12).fill(.01),24000).arrayBuffer());
const paragraphs=[{text:'Go go café.',start:0,end:5},{text:'Go go café.',start:6,end:12}];
const words=[{paragraph:0,offset:0,length:2,text:'Go',start:.2,end:.8},{paragraph:0,offset:3,length:2,text:'go',start:1,end:1.8},{paragraph:0,offset:6,length:4,text:'café',start:2,end:3},{paragraph:1,offset:0,length:2,start:6.2,end:7},{paragraph:1,offset:3,length:2,start:7.2,end:8}];
async function setup(page,extra={}){
 await page.route('**/word-test',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><title>Pipread word test</title><article id="story"><p>Go <a href="#kept">g<em>o</em></a> café.<span hidden>Excluded</span></p><p>Go go café.</p></article><pipread-audio manifest="/audio/manifest.json" article="post.html" selector="#story"></pipread-audio><script type="module" src="/src/pipread-audio.js"></script>`}));
 await page.route('**/audio/manifest.json',r=>r.fulfill({json:{version:1,articles:{'post.html':{audio:audioName,timing:timingName}}}}));
 await page.route('**/audio/'+timingName,r=>r.fulfill({json:{version:1,paragraphs,words,...extra}}));
 await page.route('**/audio/'+audioName,r=>{
  const range=r.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
  const start=range?Number(range[1]):0,end=range&&range[2]?Number(range[2]):wav.length-1;
  return r.fulfill({status:range?206:200,contentType:'audio/wav',headers:{'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${wav.length}`}:{})},body:wav.subarray(start,end+1)});
 });
 await page.goto('/word-test');
 await page.locator('pipread-audio').evaluate(el=>{el.audio.muted=true;});
 await page.getByRole('button',{name:'Listen to this article'}).click();
 await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
 await page.locator('pipread-audio').evaluate(el=>el.audio.pause());
 await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
 await page.getByLabel('Highlight passage').check();
}
async function seek(page,t){await page.locator('pipread-audio').evaluate((el,t)=>{el.audio.currentTime=t;},t);}
async function mark(page){return page.locator('pipread-audio').evaluate(el=>{const ranges=[...(CSS.highlights.get(el.key)||[])];return {text:ranges.map(r=>r.toString()).join(''),paragraph:ranges[0]?.startContainer.parentElement.closest('p')===document.querySelectorAll('#story p')[1]?1:0};});}
test('supplied words map repeated passages and inline nodes; media controls keep alignment',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await setup(page);
 await expect(page).toHaveTitle('Pipread word test');
 await seek(page,1.3);await expect.poll(()=>mark(page)).toEqual({text:'go',paragraph:0});
 await page.getByLabel('Playback speed').selectOption('2');
 await expect.poll(()=>mark(page)).toEqual({text:'go',paragraph:0});
 await page.waitForTimeout(100);expect(await mark(page)).toEqual({text:'go',paragraph:0});
 await seek(page,7.5);await expect.poll(()=>mark(page)).toEqual({text:'go',paragraph:1});
 expect(await page.locator('#story a').getAttribute('href')).toBe('#kept');expect(await page.locator('#story em').textContent()).toBe('o');
 await page.getByRole('button',{name:'Back 15 seconds',exact:true}).click();
 await expect.poll(()=>mark(page)).toEqual({text:'Gogocafé.',paragraph:0});
 await seek(page,.3);await page.getByRole('button',{name:'Resume',exact:true}).click();
 await expect.poll(()=>mark(page),{intervals:[25]}).toEqual({text:'go',paragraph:0});
 await page.locator('pipread-audio').evaluate(el=>el.audio.pause());
 await page.getByLabel('Highlight passage').uncheck();await expect.poll(()=>mark(page)).toEqual({text:'',paragraph:0});
 expect(errors).toEqual([]);
});
test('silence and absent or invalid word intervals fall back without inventing times',async({page})=>{
 await setup(page,{words:[...words,{paragraph:1,offset:99,length:3,start:9,end:10}]});
 await seek(page,4);await expect.poll(()=>mark(page)).toEqual({text:'Gogocafé.',paragraph:0});
 await seek(page,7.5);await expect.poll(()=>mark(page)).toEqual({text:'Gogocafé.',paragraph:1});
 await seek(page,5.5);await expect.poll(()=>mark(page)).toEqual({text:'',paragraph:0});
});
test('text mutations invalidate stale ranges until source reset',async({page})=>{
 await setup(page);await seek(page,1.3);await expect.poll(()=>mark(page)).toEqual({text:'go',paragraph:0});
 await page.locator('#story em').evaluate(e=>e.textContent='X');
 await expect.poll(()=>mark(page)).toEqual({text:'',paragraph:0});
 await seek(page,7.5);await expect.poll(()=>mark(page)).toEqual({text:'',paragraph:0});
});
test('stale transcript and malformed paragraph metadata do not prevent playback',async({page})=>{
 await setup(page,{paragraphs:[{text:'Wrong text',start:0,end:12}]});
 await seek(page,1.3);expect(await mark(page)).toEqual({text:'',paragraph:0});
 expect(await page.locator('pipread-audio').evaluate(el=>el.ready)).toBe(true);
});
test('word metadata rejects overlapping times, offsets, text mismatches and split surrogate pairs',async({page})=>{
 await page.goto('/');
 const sizes=await page.evaluate(async()=>{
  const {validatedWords}=await import('/src/pipread-audio.js');
  const p={text:'A 😀 word',start:0,end:5}, good={paragraph:0,offset:5,length:4,text:'word',start:2,end:3};
  return [[],[good],[{...good,offset:2,length:1}],[{...good,text:'nope'}],[{...good,end:6}],[good,{...good,start:2.5,end:4}],[{...good,start:NaN}]].map(words=>validatedWords({paragraphs:[p],words}).size);
 });expect(sizes).toEqual([0,1,0,0,0,0,0]);
});
test('paragraph-only metadata, reset and disconnect remain compatible',async({page})=>{
 await setup(page,{words:undefined});await seek(page,7.5);
 await expect.poll(()=>mark(page)).toEqual({text:'Gogocafé.',paragraph:1});
 await page.locator('pipread-audio').evaluate(el=>el.setAttribute('article','changed.html'));
 await expect.poll(()=>mark(page)).toEqual({text:'',paragraph:0});
 expect(await page.locator('pipread-audio').evaluate(el=>!el.reader&&!el.ready)).toBe(true);
});
test('unsupported highlighting leaves playback usable',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'Highlight',{value:undefined}));
 // Setup without enabling the intentionally disabled checkbox.
 await page.route('**/unsupported',r=>r.fulfill({contentType:'text/html',body:'<pipread-audio></pipread-audio><script type="module" src="/src/pipread-audio.js"></script>'}));
 await page.goto('/unsupported');await expect(page.getByLabel('Highlight passage')).toBeDisabled();
 await expect(page.getByRole('button',{name:'Listen to this article'})).toBeEnabled();
});
test('desktop/mobile word highlight renders without overlay, console errors or overflow',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await setup(page);await seek(page,1.3);await expect.poll(()=>mark(page)).toEqual({text:'go',paragraph:0});
 expect(await page.locator('vite-error-overlay').count()).toBe(0);
 await page.screenshot({path:'/tmp/pipread-word-highlight-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/pipread-word-highlight-mobile.png'});
 expect(errors).toEqual([]);
});
