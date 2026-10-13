// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import {phonemize} from './adapter.mjs';
const cases = ['Good stories deserve a voice.', 'Hello, world!', 'The CPU model costs ninety-three megabytes.', 'It’s a source-only preview.'];
for (const text of cases) {
  const first = await phonemize(text);
  assert.ok(first.length && first.every(p => p.length));
  assert.deepEqual(await phonemize(text), first);
  console.log(JSON.stringify({text, phonemes:first}));
}
assert.deepEqual(await phonemize(''), []);
await assert.rejects(phonemize('text', 'de'));
await assert.rejects(phonemize('hello\0world'));
await assert.rejects(phonemize('x'.repeat(10001)));
console.log('PASS: four deterministic phoneme cases; empty, unsupported language, NUL, size guards');
