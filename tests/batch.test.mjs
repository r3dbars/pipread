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
