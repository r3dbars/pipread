const assert=require('assert'),fs=require('fs'),crypto=require('crypto');
const {validateWords}=require('../public/follow');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const w=JSON.parse(fs.readFileSync('public/assets/voice-words.json')),t=JSON.parse(fs.readFileSync('public/assets/voice-timings.json'));
assert.equal(hash('public/assets/voice-words.json'),'daa0505b401b210972d1bb9e3dc28055a838546e3d6ac86c1c4f67d9a2f5dca6');
assert.equal(hash('public/assets/'+w.audioFile),w.audioSha256);
assert.equal(hash('public/assets/voice-transcript.txt'),'6176815dd0d3df53f9a3ccccf890603104d889d16e98fea871d6a686010be1cd');
assert.equal(hash('public/assets/voice-timings.json'),'fef5d91d092e7b471c0b8ef346e137083eb530e3a33901fb8cb62295e50285bd');
assert.equal(fs.readFileSync('public/assets/voice-transcript.txt','utf8').trim(),t.text);
assert.equal(w.words.length,242);validateWords(w,t.paragraphs.map(p=>p.text),t.duration);
for(const word of w.words){const p=t.paragraphs[word.paragraph];assert(word.start>=p.start-.001&&word.end<=p.end+.001)}
console.log('PASS: unchanged WAV/transcript/chunk hashes, verified alignment output hash, all 242 tokens and paragraph bounds.');
