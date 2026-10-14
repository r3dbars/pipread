import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  unlink,
  symlink,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateBatch } from "../lib/batch.mjs";
import { articleText } from "../lib/narration.mjs";
async function fixture() {
  const dir = await mkdtemp(join(await realpath(tmpdir()), "pipread-batch-"));
  await mkdir(join(dir, "posts"));
  const config = join(dir, "pipread.json");
  await writeFile(
    config,
    JSON.stringify({ inputDir: "posts", outputDir: "audio" }),
  );
  await writeFile(
    join(dir, "posts/one.html"),
    "<article><p>One good story.</p><p>Another paragraph.</p></article>",
  );
  return { dir, config };
}
function fake() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    engineFactory: async () => ({
      generate: async () => {
        calls++;
        return {
          samples: new Float32Array(2400).fill(0.05),
          sampleRate: 24000,
        };
      },
      dispose: async () => {},
    }),
  };
}
const silent = { log: () => {} };
test("dry-run does not download or create output; initial/unchanged/changed/new/deleted runs", async () => {
  const { dir, config } = await fixture(),
    engine = fake(),
    options = { ...silent, engineFactory: engine.engineFactory };
  assert.equal((await generateBatch(config, options)).generated, 1);
  assert.equal(engine.calls, 0);
  assert.ok(!(await readdir(dir)).includes("audio"));
  const a = await generateBatch(config, { ...options, write: true });
  assert.equal(a.generated, 1);
  assert.equal(engine.calls, 2);
  const first = a.manifest.articles["one.html"];
  const timing = JSON.parse(await readFile(join(dir, "audio", first.timing)));
  assert.deepEqual(
    timing.paragraphs.map((p) => [p.start, p.end]),
    [
      [0, 0.1],
      [0.4, 0.5],
    ],
  );
  const manifestBefore = await readFile(
    join(dir, "audio/manifest.json"),
    "utf8",
  );
  const b = await generateBatch(config, { ...options, write: true });
  assert.equal(b.unchanged, 1);
  assert.equal(engine.calls, 2);
  assert.equal(
    await readFile(join(dir, "audio/manifest.json"), "utf8"),
    manifestBefore,
  );
  await writeFile(
    join(dir, "posts/one.html"),
    "<article><p>Changed story.</p></article>",
  );
  await writeFile(
    join(dir, "posts/two.html"),
    "<article><p>New story.</p></article>",
  );
  const c = await generateBatch(config, { ...options, write: true });
  assert.equal(c.generated, 2);
  assert.equal(c.manifest.retired.length, 1);
  assert.ok(await readFile(join(dir, "audio", first.audio)));
  await unlink(join(dir, "posts/one.html"));
  const d = await generateBatch(config, { ...options, write: true });
  assert.deepEqual(d.removed, ["one.html"]);
  assert.deepEqual(Object.keys(d.manifest.articles), ["two.html"]);
  assert.equal(d.manifest.retired.length, 2);
  assert.equal(engine.calls, 4);
});
test("config changes invalidate, missing files regenerate, modified outputs refuse", async () => {
  const { dir, config } = await fixture(),
    engine = fake(),
    options = { ...silent, engineFactory: engine.engineFactory, write: true };
  const a = await generateBatch(config, options);
  await writeFile(
    config,
    JSON.stringify({ inputDir: "posts", outputDir: "audio", speed: 1.25 }),
  );
  const b = await generateBatch(config, options);
  assert.notEqual(a.manifest.configHash, b.manifest.configHash);
  assert.equal(b.generated, 1);
  const audio = join(dir, "audio", b.manifest.articles["one.html"].audio);
  await unlink(audio);
  assert.equal((await generateBatch(config, options)).generated, 1);
  await writeFile(audio, "user content");
  await assert.rejects(generateBatch(config, options), /modified/);
  assert.equal(await readFile(audio, "utf8"), "user content");
});
test("safe paths, symlinks, conflicting directory, locks, extraction errors", async () => {
  const { dir, config } = await fixture();
  await mkdir(join(dir, "audio"));
  await writeFile(join(dir, "audio/keep.txt"), "keep");
  await assert.rejects(
    generateBatch(config, { ...silent, write: true }),
    /not owned/,
  );
  await writeFile(
    config,
    JSON.stringify({ inputDir: "posts", outputDir: "../escape" }),
  );
  await assert.rejects(generateBatch(config, silent), /escapes/);
  await writeFile(
    config,
    JSON.stringify({ inputDir: "posts", outputDir: "new-audio" }),
  );
  await symlink(join(dir, "posts/one.html"), join(dir, "posts/link.html"));
  await assert.rejects(generateBatch(config, silent), /symlink/i);
  await unlink(join(dir, "posts/link.html"));
  const engine = fake();
  await generateBatch(config, {
    ...silent,
    write: true,
    engineFactory: engine.engineFactory,
  });
  await writeFile(join(dir, "new-audio/.pipread.lock"), "other");
  await assert.rejects(
    generateBatch(config, { ...silent, write: true }),
    /locked/,
  );
});
test("generation errors preserve last manifest and release lock for retry", async () => {
  const { dir, config } = await fixture();
  const engine = fake();
  await generateBatch(config, {
    ...silent,
    write: true,
    engineFactory: engine.engineFactory,
  });
  const before = await readFile(join(dir, "audio/manifest.json"), "utf8");
  await writeFile(
    join(dir, "posts/one.html"),
    "<article><p>Changed.</p></article>",
  );
  await assert.rejects(
    generateBatch(config, {
      ...silent,
      write: true,
      engineFactory: async () => ({
        generate: async () => {
          throw Error("test failure");
        },
      }),
    }),
    /test failure/,
  );
  assert.equal(
    await readFile(join(dir, "audio/manifest.json"), "utf8"),
    before,
  );
  assert.ok(!(await readdir(join(dir, "audio"))).includes(".pipread.lock"));
});
test("HTML extraction preserves paragraphs and excludes hidden/code/navigation without scripts", () => {
  const html =
    '<article><h1>A &amp; B</h1><p>Hello <em>world</em>.<code>code</code></p><nav>menu</nav><p hidden>hidden</p><div style="display:none">hidden CSS</div><details><summary>Summary</summary>secret</details><script>throw Error()</script></article>';
  assert.deepEqual(articleText(html, "article"), [
    "A & B",
    "Hello world.",
    "Summary",
  ]);
  assert.throws(
    () => articleText("<article>A</article><article>B</article>", "article"),
    /exactly one/,
  );
});

test('HTML source formatting whitespace is not a spoken paragraph break', () => {
  assert.deepEqual(articleText('<article><p>Hello\n  world.</p><p>Next <em>little\n story</em>.</p><p>Line<br>break</p></article>', 'article'), ['Hello world.', 'Next little story.', 'Line', 'break']);
});

test('model cache cannot equal, contain, or be inside published output', async () => {
  for (const cacheDir of ['audio', 'audio/models', '.', 'audio/../audio/models']) {
    const {config}=await fixture();
    await writeFile(config, JSON.stringify({inputDir:'posts',outputDir:'audio',cacheDir}));
    let loaded=false;
    await assert.rejects(generateBatch(config,{write:true,log(){},engineFactory:async()=>{loaded=true;throw Error('Must reject before engine load');}}),/cache.*output|output.*cache/i);
    assert.equal(loaded,false);
  }
  const linkFixture=await fixture();
  await mkdir(join(linkFixture.dir,'audio'));
  await symlink(join(linkFixture.dir,'audio'),join(linkFixture.dir,'cache'));
  await writeFile(linkFixture.config,JSON.stringify({inputDir:'posts',outputDir:'audio',cacheDir:'cache'}));
  await assert.rejects(generateBatch(linkFixture.config,silent),/symlink/i);
  const {config}=await fixture();
  await writeFile(config,JSON.stringify({inputDir:'posts',outputDir:'audio',cacheDir:'audio-cache'}));
  assert.equal((await generateBatch(config,silent)).generated,1);
});

test('missing WAV repair preserves aligned words only for identical regenerated audio', async () => {
  const {createHash}=await import('node:crypto');
  const {spawnSync}=await import('node:child_process');
  const hash=b=>createHash('sha256').update(b).digest('hex');
  for (const different of [false,true]) {
    const {dir,config}=await fixture();
    await writeFile(join(dir,'posts/one.html'),'<article><p>Hello world.</p></article>');
    const engine=fake(),options={...silent,write:true,engineFactory:engine.engineFactory};
    const first=await generateBatch(config,options),record=first.manifest.articles['one.html'];
    const output=join(dir,'audio'),manifest=join(output,'manifest.json'),words=join(dir,'words.json');
    await writeFile(words,JSON.stringify({kind:'aligned-words',audioSha256:record.audioHash,duration:record.duration,words:[{text:'Hello',paragraph:0,start:.01,end:.04},{text:'world.',paragraph:0,start:.05,end:.09}]}));
    const attach=spawnSync(process.execPath,[new URL('../tools/alignment/attach.mjs',import.meta.url).pathname,'--manifest',manifest,'--article','one.html','--words',words,'--write'],{encoding:'utf8'});
    assert.equal(attach.status,0,attach.stderr);
    const aligned=JSON.parse(await readFile(manifest)).articles['one.html'];
    const alignedBytes=await readFile(join(output,aligned.timing));
    await unlink(join(output,record.audio));
    const logs=[];
    const repaired=await generateBatch(config,{...options,log:s=>logs.push(s),...(different?{engineFactory:async()=>({generate:async()=>({sampleRate:24000,samples:new Float32Array(2400).fill(.1)})})}:{})});
    const next=repaired.manifest.articles['one.html'];
    assert.equal(hash(await readFile(join(output,next.audio))),next.audioHash);
    const timing=JSON.parse(await readFile(join(output,next.timing)));
    if (!different) {assert.equal(next.timing,aligned.timing);assert.equal(next.timingHash,aligned.timingHash);assert.equal(timing.words.length,2);}
    else {assert.notEqual(next.audioHash,aligned.audioHash);assert.equal(timing.words,undefined);assert(logs.some(s=>/alignment must be rerun/i.test(s)));}
    assert.deepEqual(await readFile(join(output,aligned.timing)),alignedBytes);
    const unchanged=await generateBatch(config,{write:true,log(){},engineFactory:async()=>{throw Error('Unexpected regeneration');}});
    assert.equal(unchanged.unchanged,1);assert.equal(unchanged.manifest.articles['one.html'].timing,next.timing);
  }
});
