import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  lstat,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import {
  resolve,
  dirname,
  relative,
  join,
  extname,
  isAbsolute,
  sep,
} from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { articleText, narrationChunks } from "./narration.mjs";
import {
  loadEngine,
  MODEL,
  REVISION,
  WEIGHTS,
  VOICE_HASH,
} from "./kokoro-engine.mjs";
import { pcmWav } from "../src/audio.js";
const hash = (data) => createHash("sha256").update(data).digest("hex");
const exists = async (path) => {
  try {
    return await lstat(path);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
};
async function safePath(path) {
  for (let p = path; ; p = dirname(p)) {
    const s = await exists(p);
    if (s?.isSymbolicLink()) throw Error(`Symlink path refused: ${p}`);
    if (dirname(p) === p) break;
  }
}
function inside(base, name) {
  if (typeof name !== "string" || !name || isAbsolute(name))
    throw Error("Input/output paths must be relative to the config");
  const p = resolve(base, name);
  if (relative(base, p).startsWith(".."))
    throw Error("Path escapes the project directory");
  return p;
}
const assetName = (name) =>
  typeof name === "string" &&
  /^(?:[a-z0-9-]+-)?[a-f0-9]{64}\.(wav|json)$/.test(name);
async function immutable(path, bytes) {
  const old = await exists(path);
  if (old) {
    if (!old.isFile() || hash(await readFile(path)) !== hash(bytes))
      throw Error(`Refusing to overwrite different content: ${path}`);
    return;
  }
  await writeFile(path, bytes, { flag: "wx" });
}
export async function generateBatch(
  configPath,
  { write = false, log = console.log, engineFactory = loadEngine } = {},
) {
  const path = resolve(configPath);
  await safePath(path);
  const raw = JSON.parse(await readFile(path, "utf8"));
  const base = dirname(path);
  const allowed = new Set([
    "inputDir",
    "outputDir",
    "selector",
    "extensions",
    "voice",
    "speed",
    "dtype",
    "cacheDir",
    "paragraphPause",
  ]);
  for (const key of Object.keys(raw))
    if (!allowed.has(key)) throw Error(`Unknown config option: ${key}`);
  const config = {
    inputDir: "posts",
    outputDir: "public/pipread",
    selector: "article",
    extensions: [".html"],
    voice: "af_heart",
    speed: 1,
    dtype: "fp32",
    paragraphPause: 0.3,
    ...raw,
  };
  if (
    config.voice !== "af_heart" ||
    !Object.hasOwn(WEIGHTS, config.dtype) ||
    !Number.isFinite(config.speed) ||
    config.speed < 0.75 ||
    config.speed > 2 ||
    !Number.isFinite(config.paragraphPause) ||
    config.paragraphPause < 0 ||
    config.paragraphPause > 2
  )
    throw Error("Unsupported voice, dtype, speed, or paragraphPause");
  if (
    typeof config.selector !== "string" ||
    !config.selector.trim() ||
    !Array.isArray(config.extensions) ||
    !config.extensions.length ||
    config.extensions.some((x) => ![".html", ".txt"].includes(x))
  )
    throw Error("Invalid selector or extensions (.html/.txt only)");
  const input = inside(base, config.inputDir),
    output = inside(base, config.outputDir);
  config.cacheDir = inside(base, raw.cacheDir || ".pipread-cache");
  if (
    input === output ||
    !relative(input, output).startsWith("..") ||
    !relative(output, input).startsWith("..")
  )
    throw Error("Input and output directories must not contain each other");
  const contains = (parent, child) => {
    const path = relative(parent, child);
    return !path || (path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path));
  };
  if (contains(output, config.cacheDir) || contains(config.cacheDir, output))
    throw Error("Model cache and published output directories must not overlap");
  for (const p of [input, output, config.cacheDir]) await safePath(p);
  if (!(await exists(input))?.isDirectory())
    throw Error("Input directory not found");
  const manifestPath = join(output, "manifest.json"),
    marker = join(output, ".pipread-output.json");
  const outputStat = await exists(output);
  let old = { version: 1, articles: {}, retired: [] };
  if (outputStat) {
    if (!outputStat.isDirectory()) throw Error("Output is not a directory");
    if ((await readdir(output)).length) {
      if (
        !(await exists(marker)) ||
        JSON.parse(await readFile(marker, "utf8")).format !== "pipread-static-1"
      )
        throw Error("Nonempty output directory is not owned by Pipread");
    }
  }
  const previous = (await exists(manifestPath))
    ? await readFile(manifestPath)
    : null;
  if (previous) {
    old = JSON.parse(previous);
    if (old.version !== 1 || !old.articles || !Array.isArray(old.retired))
      throw Error("Unsupported manifest");
  }
  // Verify every managed path before reading or writing; never trust a manifest path.
  for (const record of [...Object.values(old.articles), ...old.retired])
    for (const type of ["audio", "timing"]) {
      if (!assetName(record[type])) throw Error("Unsafe manifest asset path");
      await safePath(join(output, record[type]));
    }
  const implementationHash = hash(
    Buffer.concat(
      await Promise.all(
        [
          "./batch.mjs",
          "./narration.mjs",
          "./kokoro-engine.mjs",
          "../src/text.js",
          "../src/audio.js",
        ].map((file) => readFile(new URL(file, import.meta.url))),
      ),
    ),
  );
  const identity = {
    format: 1,
    implementationHash,
    extractor: 1,
    chunker: 1,
    engine: "kokoro-js@1.2.1",
    transformers: "3.8.1",
    phonemizer: "1.2.1",
    model: MODEL,
    revision: REVISION,
    modelHash: WEIGHTS[config.dtype].sha256,
    voiceHash: VOICE_HASH,
    voice: config.voice,
    dtype: config.dtype,
    speed: config.speed,
    paragraphPause: config.paragraphPause,
    selector: config.selector,
  };
  const configHash = hash(JSON.stringify(identity));
  const files = [];
  async function walk(dir) {
    for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const p = join(dir, e.name);
      if (e.isSymbolicLink()) throw Error(`Input symlink refused: ${p}`);
      if (e.isDirectory()) await walk(p);
      else if (
        e.isFile() &&
        config.extensions.includes(extname(e.name).toLowerCase())
      )
        files.push(p);
    }
  }
  await walk(input);
  const plans = [];
  for (const file of files) {
    const source = relative(input, file).split("\\").join("/");
    const body = await readFile(file, "utf8");
    const paragraphs = articleText(
      body,
      config.selector,
      extname(file).toLowerCase() === ".txt",
    );
    const text = paragraphs.join("\n\n");
    if (!text || text.length > 100000)
      throw Error(`${source}: expected 1–100,000 readable characters`);
    const contentHash = hash(text),
      key = hash(contentHash + configHash),
      prior = old.articles[source];
    let status = "generate";
    if (prior?.key === key) {
      let missing = false;
      for (const type of ["audio", "timing"]) {
        const p = join(output, prior[type]);
        if (!(await exists(p))) {
          missing = true;
          continue;
        }
        if (hash(await readFile(p)) !== prior[type + "Hash"])
          throw Error(
            `${source}: managed ${type} was modified; preserve it elsewhere before regenerating`,
          );
      }
      if (!missing) status = "unchanged";
    }
    plans.push({
      source,
      file,
      sourceHash: hash(body),
      paragraphs,
      text,
      contentHash,
      key,
      prior,
      status,
    });
    log(`${write ? "" : "DRY RUN: "}${status}: ${source}`);
  }
  const removed = Object.keys(old.articles).filter(
    (s) => !plans.some((p) => p.source === s),
  );
  for (const source of removed)
    log(`Retire deleted input: ${source} (keep audio files)`);
  if (!write)
    return {
      dryRun: true,
      generated: plans.filter((p) => p.status === "generate").length,
      unchanged: plans.filter((p) => p.status === "unchanged").length,
      removed,
    };
  await mkdir(output, { recursive: true });
  if (!(await exists(marker)))
    await writeFile(
      marker,
      JSON.stringify({ format: "pipread-static-1" }) + "\n",
      { flag: "wx" },
    );
  const lock = join(output, ".pipread.lock");
  await writeFile(
    lock,
    JSON.stringify({ pid: process.pid, started: new Date().toISOString() }),
    { flag: "wx" },
  ).catch((e) => {
    throw Error(
      `Output is locked or not writable (${e.code}); check for another run before removing .pipread.lock`,
    );
  });
  let engine;
  const next = {
    version: 1,
    identity,
    configHash,
    articles: {},
    retired: [...old.retired],
  };
  try {
    for (const plan of plans) {
      if (hash(await readFile(plan.file)) !== plan.sourceHash)
        throw Error(`${plan.source}: input changed during run; rerun`);
      if (plan.status === "unchanged") {
        next.articles[plan.source] = plan.prior;
        continue;
      }
      engine ??= await engineFactory(config, log);
      const chunks = narrationChunks(plan.paragraphs),
        pcm = [],
        sentences = [],
        paragraphs = [];
      let samples = 0,
        index = 0;
      for (let p = 0; p < plan.paragraphs.length; p++) {
        const start = samples;
        for (const chunk of chunks.filter((c) => c.paragraph === p)) {
          log(`${plan.source}: generating ${++index}/${chunks.length}`);
          const audio = await engine.generate(chunk.text);
          if (
            audio.sampleRate !== 24000 ||
            !audio.samples.length ||
            audio.samples.some((x) => !Number.isFinite(x))
          )
            throw Error("Invalid generated PCM");
          sentences.push({
            text: chunk.text,
            paragraph: p,
            start: samples / 24000,
            end: (samples + audio.samples.length) / 24000,
          });
          pcm.push(audio.samples);
          samples += audio.samples.length;
          if (samples > 24000 * 3600)
            throw Error("Audio exceeds one-hour limit");
        }
        paragraphs.push({
          text: plan.paragraphs[p],
          start: start / 24000,
          end: samples / 24000,
        });
        if (p < plan.paragraphs.length - 1) {
          const pause = new Float32Array(
            Math.round(config.paragraphPause * 24000),
          );
          pcm.push(pause);
          samples += pause.length;
        }
      }
      const all = new Float32Array(samples);
      let offset = 0;
      for (const a of pcm) {
        all.set(a, offset);
        offset += a.length;
      }
      const audio = Buffer.from(await pcmWav(all, 24000).arrayBuffer());
      let timing = Buffer.from(
        JSON.stringify(
          {
            version: 1,
            contentHash: plan.contentHash,
            configHash,
            voice: config.voice,
            duration: samples / 24000,
            sampleRate: 24000,
            text: plan.text,
            paragraphs,
            sentences,
            timingKind: "Exact generated chunk boundaries; not word alignment",
          },
          null,
          2,
        ) + "\n",
      );
      let audioName = plan.key + ".wav",
        timingName = plan.key + ".json";
      if (plan.prior?.key === plan.key) {
        const priorTimingPath = join(output, plan.prior.timing);
        const priorTiming = (await exists(priorTimingPath)) ? await readFile(priorTimingPath) : null;
        if (priorTiming && hash(priorTiming) !== plan.prior.timingHash)
          throw Error(`${plan.source}: managed timing changed during repair`);
        const hasWords = priorTiming && Array.isArray(JSON.parse(priorTiming).words);
        if (hash(audio) === plan.prior.audioHash) {
          // Alignment belongs to the exact recording, not just its transcript.
          audioName = plan.prior.audio;
          if (hasWords) { timing = priorTiming; timingName = plan.prior.timing; }
        } else {
          // Never replace prior immutable assets with a different regeneration.
          audioName = hash(audio) + ".wav";
          timingName = hash(timing) + ".json";
          if (hasWords) log(`${plan.source}: regenerated audio differs; alignment must be rerun. Publishing paragraph timings only.`);
        }
      }
      await immutable(join(output, audioName), audio);
      await immutable(join(output, timingName), timing);
      next.articles[plan.source] = {
        key: plan.key,
        contentHash: plan.contentHash,
        configHash,
        audio: audioName,
        timing: timingName,
        audioHash: hash(audio),
        timingHash: hash(timing),
        duration: samples / 24000,
      };
      if (plan.prior && (plan.prior.key !== plan.key || plan.prior.audio !== audioName || plan.prior.timing !== timingName))
        next.retired.push({ source: plan.source, ...plan.prior });
    }
    for (const source of removed)
      next.retired.push({ source, ...old.articles[source] });
    const player = await readFile(
      new URL("../src/pipread-audio.js", import.meta.url),
    );
    const playerName = "pipread-player.js",
      playerPath = join(output, playerName);
    await safePath(playerPath);
    if (await exists(playerPath)) {
      const current = await readFile(playerPath);
      if (hash(current) !== hash(player) && hash(current) !== old.playerHash)
        throw Error("Managed player was modified; refusing to overwrite");
    }
    if (
      !(await exists(playerPath)) ||
      hash(await readFile(playerPath)) !== hash(player)
    ) {
      const temp = playerPath + "." + randomUUID() + ".tmp";
      await writeFile(temp, player, { flag: "wx" });
      await rename(temp, playerPath);
    }
    next.player = playerName;
    next.playerHash = hash(player);
    await immutable(
      join(output, "pipread-player.LICENSE.txt"),
      await readFile(new URL("../LICENSE", import.meta.url)),
    );
    if (previous) {
      if (hash(await readFile(manifestPath)) !== hash(previous))
        throw Error("Manifest changed during generation");
      await immutable(
        join(output, "manifest.backup-" + hash(previous) + ".json"),
        previous,
      );
    }
    const bytes = JSON.stringify(next, null, 2) + "\n";
    if (!previous || previous.toString() !== bytes) {
      const temp = manifestPath + "." + randomUUID() + ".tmp";
      await writeFile(temp, bytes, { flag: "wx" });
      await rename(temp, manifestPath);
    }
    log(
      `Done: ${plans.filter((p) => p.status === "generate").length} generated, ${plans.filter((p) => p.status === "unchanged").length} unchanged, ${removed.length} retired. Manifest: ${manifestPath}`,
    );
    return {
      manifest: next,
      generated: plans.filter((p) => p.status === "generate").length,
      unchanged: plans.filter((p) => p.status === "unchanged").length,
      removed,
    };
  } finally {
    try {
      await engine?.dispose?.();
    } finally {
      await unlink(lock);
    }
  }
}
