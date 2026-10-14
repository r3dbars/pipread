const assert=require('assert'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('public/index.html','utf8'),source=fs.readFileSync('public/copy-agent.js','utf8');
const prompt=html.match(/<textarea id="agent-prompt"[^>]*>([\s\S]*?)<\/textarea>/)[1].replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&#x27;',"'").replaceAll('&quot;','"');
assert(html.indexOf('</article>')<html.indexOf('id="add-to-blog"'));assert(html.indexOf('id="add-to-blog"')<html.indexOf('id="qa"'));
assert(prompt.includes('https://github.com/r3dbars/pipread'));assert(prompt.includes('README'));assert(prompt.includes('do not invent an npm package or use npx pipread'));assert(prompt.includes('Do not deploy, publish, or push changes without my approval.'));
// With scripts disabled, native details/summary still exposes the manual prompt.
const {parseHTML}=require('linkedom');
const document=parseHTML(html).document,manual=document.getElementById('agent-prompt-details');
assert(!manual.hasAttribute('hidden'));assert(manual.querySelector('summary'));
assert(manual.querySelector('textarea[readonly]').textContent.includes('https://github.com/r3dbars/pipread'));
assert.equal(document.querySelector('footer'),null);
const actions=document.querySelector('#add-to-blog .install-actions');
assert(actions.querySelector('#copy-agent-prompt'));assert.equal(actions.querySelectorAll('a').length,1);
const github=actions.querySelector('a.install-github');
assert.equal(github.getAttribute('href'),'https://github.com/r3dbars/pipread');
assert.equal(github.textContent,'GitHub');assert.equal(github.getAttribute('rel'),'noopener noreferrer');
assert(document.querySelector('#qa .asset-credits a[href="https://creativecommons.org/licenses/by/4.0/"]'));
function setup(clipboard){const els={};for(const id of ['copy-agent-prompt','agent-prompt','agent-prompt-details','copy-agent-status'])els[id]={classList:{values:new Set(),add(v){this.values.add(v)},remove(v){this.values.delete(v)},contains(v){return this.values.has(v)}},textContent:'',value:prompt,disabled:false,addEventListener(n,f){this.click=f},focus(){this.focused=true},select(){this.selected=true}};vm.runInNewContext(source,{document:{getElementById:id=>els[id]},navigator:{clipboard}});return els;}
(async()=>{
 let captured,done,rejectCopy=false;const e=setup({writeText:text=>{if(rejectCopy)return Promise.reject(Error('Permission denied'));captured=text;return new Promise(r=>done=r)}});const pending=e['copy-agent-prompt'].click();assert(e['copy-agent-prompt'].disabled);assert.equal(e['copy-agent-prompt'].textContent,'Copying…');assert.equal(captured,prompt);done();await pending;assert.equal(e['copy-agent-prompt'].textContent,'Copied');assert(!e['copy-agent-prompt'].disabled);assert(!e['agent-prompt-details'].open);assert(e['agent-prompt-details'].hidden);assert(e['copy-agent-status'].classList.contains('copy-success'));
 // A later denied copy must clear the hidden-success styling and reveal fallback.
 rejectCopy=true;await e['copy-agent-prompt'].click();assert.equal(e['agent-prompt-details'].hidden,false);assert(!e['copy-agent-status'].classList.contains('copy-success'));assert(e['copy-agent-status'].textContent.includes('unavailable'));
 for(const clipboard of [undefined,{writeText:async()=>{throw Error('Permission denied')}}]){const e=setup(clipboard);await e['copy-agent-prompt'].click();assert.equal(e['copy-agent-prompt'].textContent,'Copy for your agent');assert(e['agent-prompt-details'].open);assert.equal(e['agent-prompt-details'].hidden,false);assert(e['agent-prompt'].focused&&e['agent-prompt'].selected);assert(!e['copy-agent-prompt'].disabled);assert(e['copy-agent-status'].textContent.includes('unavailable'));}
 console.log('PASS: section order, real repository/docs prompt, awaited clipboard success, pending state, denied/missing clipboard selectable fallback, no-JS manual disclosure, inline GitHub action, no duplicate footer and attribution; no false Copied.');
})().catch(e=>{console.error(e);process.exitCode=1});
