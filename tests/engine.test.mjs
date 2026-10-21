import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  chmod,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { realpath } from "node:fs/promises";
import {
  parseGenerateArgs,
  resolveEngineOptions,
  PHONON_MODEL,
  PHONON_MODEL_REF,
} from "../lib/engine.mjs";
import {
  chunkPhononText,
  chunkPhononParagraph,
  concatWavs,
  parseWav,
  writePcm16Wav,
  wavToPcm,
  resolvePtts,
  pttsArgs,
  loadEngine,
  phononNarrationChunks,
} from "../lib/phonon-engine.mjs";
import { generateBatch } from "../lib/batch.mjs";
import { pcmWav } from "../src/audio.js";

const cli = new URL("../bin/pipread.mjs", import.meta.url).pathname;
const silent = { log: () => {} };

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

async function fixture(extra = {}) {
  const dir = await mkdtemp(join(await realpath(tmpdir()), "pipread-engine-"));
  await mkdir(join(dir, "posts"));
  const config = join(dir, "pipread.json");
  await writeFile(
    config,
    JSON.stringify({ inputDir: "posts", outputDir: "audio", ...extra }),
  );
  await writeFile(
    join(dir, "posts/one.html"),
    "<article><p>One good story.</p><p>Another paragraph.</p></article>",
  );
  return { dir, config };
}

async function wavBuffer(sampleCount, sampleRate = 24000, fill = 0.2) {
  return Buffer.from(
    await pcmWav(new Float32Array(sampleCount).fill(fill), sampleRate).arrayBuffer(),
  );
}

function insertJunk(wav) {
  const info = parseWav(wav);
  const fmtEnd = 12 + 8 + 16; // canonical pcmWav layout
  const junk = Buffer.alloc(12);
  junk.write("JUNK", 0);
  junk.writeUInt32LE(4, 4);
  junk.writeUInt32LE(0, 8);
  return Buffer.concat([wav.subarray(0, fmtEnd), junk, wav.subarray(fmtEnd)]);
}

test("parseGenerateArgs accepts engine and voice; config is required", () => {
  assert.deepEqual(parseGenerateArgs(["--config", "./pipread.json"]), {
    write: false,
    config: "./pipread.json",
  });
  assert.deepEqual(
    parseGenerateArgs([
      "--config",
      "./pipread.json",
      "--write",
      "--engine",
      "phonon",
      "--voice",
      "Easton",
    ]),
    {
      write: true,
      config: "./pipread.json",
      engine: "phonon",
      voice: "Easton",
    },
  );
  assert.throws(() => parseGenerateArgs([]), /Usage: generate/);
  assert.throws(() => parseGenerateArgs(["--engine", "phonon"]), /Usage: generate/);
  assert.throws(() => parseGenerateArgs(["--config", "./pipread.json", "--nope"]), /Unknown/);
  assert.throws(
    () => parseGenerateArgs(["--config", "./pipread.json", "--engine"]),
    /incomplete/,
  );
});

test("resolveEngineOptions: default kokoro, config, CLI wins, unknown engine", () => {
  assert.deepEqual(resolveEngineOptions({}), {
    engine: "kokoro",
    voice: "af_heart",
    model: null,
  });
  assert.deepEqual(resolveEngineOptions({ engine: "phonon" }), {
    engine: "phonon",
    voice: "Easton",
    model: PHONON_MODEL,
  });
  assert.deepEqual(
    resolveEngineOptions({ engine: "phonon", voice: "Freya" }, { engine: "kokoro" }),
    { engine: "kokoro", voice: "af_heart", model: null },
  );
  assert.deepEqual(
    resolveEngineOptions({ engine: "kokoro" }, { engine: "phonon", voice: "Easton" }),
    { engine: "phonon", voice: "Easton", model: PHONON_MODEL },
  );
  assert.deepEqual(resolveEngineOptions({ voice: "af_heart" }, { engine: "phonon" }), {
    engine: "phonon",
    voice: "Easton",
    model: PHONON_MODEL,
  });
  assert.throws(() => resolveEngineOptions({ engine: "bark" }), /Unknown engine: bark/);
  assert.throws(() => resolveEngineOptions({}, { engine: "40m" }), /Unknown engine/);
  assert.throws(
    () => resolveEngineOptions({ engine: "phonon", voice: "af_heart" }),
    /Kokoro voice/,
  );
  assert.throws(
    () => resolveEngineOptions({ engine: "kokoro", voice: "Easton" }),
    /af_heart/,
  );
  assert.throws(
    () => resolveEngineOptions({ engine: "phonon", voice: "hf://gradium/phonon-40m-en" }),
    /phonon-31m-en/,
  );
});

test("generateBatch default, config engine, CLI flag wins, unknown engine", async () => {
  const { config } = await fixture();
  const engine = fake();
  const def = await generateBatch(config, {
    ...silent,
    write: true,
    engineFactory: engine.engineFactory,
  });
  assert.equal(def.manifest.identity.engine, "kokoro-js@1.2.1");
  assert.equal(def.manifest.identity.voice, "af_heart");
  assert.match(def.manifest.identity.model, /Kokoro/);

  await writeFile(
    config,
    JSON.stringify({ inputDir: "posts", outputDir: "audio", engine: "phonon" }),
  );
  const fromConfig = await generateBatch(config, {
    ...silent,
    write: true,
    engineFactory: engine.engineFactory,
  });
  assert.equal(fromConfig.manifest.identity.engine, "phonon");
  assert.equal(fromConfig.manifest.identity.model, PHONON_MODEL);
  assert.equal(fromConfig.manifest.identity.voice, "Easton");
  assert.notEqual(
    fromConfig.manifest.articles["one.html"].key,
    def.manifest.articles["one.html"].key,
  );

  const flagWins = await generateBatch(config, {
    ...silent,
    write: true,
    engine: "kokoro",
    engineFactory: engine.engineFactory,
  });
  assert.equal(flagWins.manifest.identity.engine, "kokoro-js@1.2.1");
  assert.equal(
    flagWins.manifest.articles["one.html"].key,
    def.manifest.articles["one.html"].key,
  );

  await writeFile(
    config,
    JSON.stringify({ inputDir: "posts", outputDir: "audio", engine: "bark" }),
  );
  await assert.rejects(generateBatch(config, silent), /Unknown engine: bark/);
});

test("cache key includes engine, voice and model so engines never share audio", async () => {
  const { dir, config } = await fixture({ engine: "phonon", voice: "Easton" });
  const engine = fake();
  const easton = await generateBatch(config, {
    ...silent,
    write: true,
    engineFactory: engine.engineFactory,
  });
  await writeFile(
    config,
    JSON.stringify({
      inputDir: "posts",
      outputDir: "audio",
      engine: "phonon",
      voice: "Freya",
    }),
  );
  const freya = await generateBatch(config, {
    ...silent,
    write: true,
    engineFactory: engine.engineFactory,
  });
  assert.notEqual(
    easton.manifest.articles["one.html"].key,
    freya.manifest.articles["one.html"].key,
  );
  assert.equal(easton.manifest.identity.model, freya.manifest.identity.model);
  assert.notEqual(easton.manifest.identity.voice, freya.manifest.identity.voice);
  const reused = await generateBatch(config, {
    ...silent,
    write: true,
    engineFactory: async () => {
      throw Error("Unexpected regeneration");
    },
  });
  assert.equal(reused.unchanged, 1);
  assert.ok(await readFile(join(dir, "audio", easton.manifest.articles["one.html"].audio)));
});

test("resolvePtts prefers a ptts binary, then uvx, and explains a miss", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "pipread-ptts-"));
  const bin = join(root, "bin");
  await mkdir(bin);
  const ptts = join(bin, "ptts");
  const uvx = join(bin, "uvx");
  await writeFile(ptts, "#!/bin/sh\nexit 0\n");
  await writeFile(uvx, "#!/bin/sh\nexit 0\n");
  await chmod(ptts, 0o755);
  await chmod(uvx, 0o755);
  assert.deepEqual(await resolvePtts({ env: { PATH: bin } }), {
    command: ptts,
    prefix: [],
  });
  await rm(ptts);
  assert.deepEqual(await resolvePtts({ env: { PATH: bin } }), {
    command: uvx,
    prefix: ["ptts"],
  });
  await assert.rejects(resolvePtts({ find: async () => null }), /ptts CLI/);
  await assert.rejects(resolvePtts({ env: { PATH: join(root, "empty") } }), /uvx ptts/);
});

test("ptts invocation pins phonon-31m-en and uses an args array", async () => {
  const args = pttsArgs("Hello from Phonon.", "/tmp/out.wav", "Easton", ["ptts"]);
  assert.deepEqual(args, [
    "ptts",
    "--model",
    PHONON_MODEL_REF,
    "--lang",
    "en",
    "--quant",
    "q8",
    "--voice",
    "Easton",
    "Hello from Phonon.",
    "-o",
    "/tmp/out.wav",
  ]);
  assert(!args.some((a) => /40m/i.test(String(a))));
  let seen;
  const tts = await loadEngine({ voice: "Easton" }, () => {}, {
    resolve: async () => ({ command: "/usr/bin/true", prefix: [] }),
    execFile: async (command, argv) => {
      assert.equal(typeof command, "string");
      assert.equal(Array.isArray(argv), true);
      assert.equal(argv.includes("Hello."), true);
      assert.equal(argv.includes(PHONON_MODEL_REF), true);
      seen = { command, argv };
      const out = argv[argv.indexOf("-o") + 1];
      await writeFile(out, await wavBuffer(480));
    },
  });
  const audio = await tts.generate("Hello.");
  assert.equal(audio.sampleRate, 24000);
  assert.equal(audio.samples.length, 480);
  assert.equal(seen.command, "/usr/bin/true");
  assert.equal(typeof seen.argv, "object");
});

test("chunking keeps paragraph then sentence boundaries without losing or duplicating text", () => {
  const post =
    "First paragraph stays together.\n\nSecond paragraph is also one piece.";
  assert.deepEqual(chunkPhononText(post, 10_000), [
    "First paragraph stays together.",
    "Second paragraph is also one piece.",
  ]);
  const longParagraph =
    "Sentence one is short. Sentence two is also short but the paragraph is long.";
  const split = chunkPhononParagraph(longParagraph, 60);
  assert.deepEqual(split, [
    "Sentence one is short.",
    "Sentence two is also short but the paragraph is long.",
  ]);
  assert.equal(split.join(" "), longParagraph);
  const words = Array.from({ length: 40 }, (_, i) => `word${i}`);
  const sentence = `${words.join(" ")}.`;
  const parts = chunkPhononParagraph(sentence, 30);
  assert(parts.length > 1);
  assert.deepEqual(parts.join(" ").split(/\s+/), sentence.split(/\s+/));
  const token = "A".repeat(50);
  const shards = chunkPhononParagraph(token, 16);
  assert(shards.length > 1);
  assert.equal(shards.join(""), token);
  assert.equal(shards.join("").length, 50);
  const chunks = phononNarrationChunks(
    ["Hello there.", "A second paragraph."],
    10_000,
  );
  assert.deepEqual(
    chunks.map((c) => [c.paragraph, c.text]),
    [
      [0, "Hello there."],
      [1, "A second paragraph."],
    ],
  );
});

test("WAV concat checks matching format and rewrites the header", async () => {
  const a = insertJunk(await wavBuffer(100, 24000, 0.1));
  const b = await wavBuffer(50, 24000, 0.2);
  const combined = concatWavs([a, b]);
  const header = parseWav(combined);
  assert.equal(header.sampleRate, 24000);
  assert.equal(header.audioFormat, 1);
  assert.equal(header.numChannels, 1);
  assert.equal(header.bitsPerSample, 16);
  assert.equal(header.dataOffset, 44);
  assert.equal(header.dataLength, 300);
  assert.equal(combined.readUInt32LE(4), 36 + 300);
  assert.equal(combined.length, 44 + 300);
  const pcm = wavToPcm(combined);
  assert.equal(pcm.samples.length, 150);
  const otherRate = await wavBuffer(20, 16000);
  assert.throws(() => concatWavs([b, otherRate]), /format mismatch/);
  const stereo = writePcm16Wav(Buffer.alloc(8), 24000);
  stereo.writeUInt16LE(2, 22);
  assert.throws(() => concatWavs([b, stereo]), /format mismatch|not 16-bit/);
});

test("CLI generate engine flag, unknown engine, and missing ptts", async () => {
  const { config } = await fixture();
  const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  const def = run("generate", "--config", config);
  assert.equal(def.status, 0, def.stderr);
  assert.match(def.stdout, /DRY RUN: generate: one.html/);

  const phonon = run("generate", "--config", config, "--engine", "phonon");
  assert.equal(phonon.status, 0, phonon.stderr);
  assert.match(phonon.stdout, /DRY RUN: generate: one.html/);

  const unknown = run("generate", "--config", config, "--engine", "bark");
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown engine: bark/);

  const empty = await mkdtemp(join(await realpath(tmpdir()), "pipread-nopath-"));
  const missing = spawnSync(
    process.execPath,
    [cli, "generate", "--config", config, "--engine", "phonon", "--write"],
    { encoding: "utf8", env: { ...process.env, PATH: empty } },
  );
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /ptts CLI/);
});
