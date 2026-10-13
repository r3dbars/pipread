import {
  readFile,
  writeFile,
  mkdir,
  rename,
  unlink,
  lstat,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
export const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const REVISION = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
export const WEIGHTS = {
  fp32: {
    file: "onnx/model.onnx",
    sha256: "8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb",
  },
  q8: {
    file: "onnx/model_quantized.onnx",
    sha256: "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478",
  },
};
export const VOICE_HASH =
  "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b";
const sha = (data) => createHash("sha256").update(data).digest("hex");
const configs = {
  "config.json": "790faf216e7e3f490e71e8bc80df79ed8941101c",
  "tokenizer.json": "4280f55fc1c32211bc9bb4d55545759a00054ecd",
  "tokenizer_config.json": "5c81e9a3a06db9139900d6ee5b60e8bb701ccb0b",
};
function valid(data, hash, git = false) {
  return (
    (git
      ? createHash("sha1")
          .update(`blob ${data.length}\0`)
          .update(data)
          .digest("hex")
      : sha(data)) === hash
  );
}
export async function loadEngine(config, log) {
  const dir = join(config.cacheDir, REVISION, config.dtype);
  const assets = [
    ...Object.entries(configs).map(([file, hash]) => ({
      file,
      hash,
      git: true,
    })),
    { file: WEIGHTS[config.dtype].file, hash: WEIGHTS[config.dtype].sha256 },
  ];
  for (const asset of assets) {
    const path = join(dir, asset.file);
    for (let p = path; ; p = dirname(p)) {
      try {
        if ((await lstat(p)).isSymbolicLink())
          throw Error("Model cache symlink refused");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (dirname(p) === p) break;
    }
    let data;
    try {
      data = await readFile(path);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (data && valid(data, asset.hash, asset.git)) {
      log(`Cached model asset: ${asset.file}`);
      continue;
    }
    log(`Downloading model asset: ${asset.file}`);
    const response = await fetch(
      `https://huggingface.co/${MODEL}/resolve/${REVISION}/${asset.file}`,
      { signal: AbortSignal.timeout(300000) },
    );
    if (!response.ok)
      throw Error(
        `Model download failed: HTTP ${response.status} (${asset.file})`,
      );
    const parts = [];
    let bytes = 0,
      last = 0;
    for await (const part of response.body) {
      parts.push(part);
      bytes += part.length;
      if (bytes - last > 16 * 1024 * 1024) {
        log(`${asset.file}: ${(bytes / 1e6).toFixed(1)} MB downloaded`);
        last = bytes;
      }
    }
    data = Buffer.concat(parts);
    if (!valid(data, asset.hash, asset.git))
      throw Error(`Model integrity check failed: ${asset.file}`);
    await mkdir(dirname(path), { recursive: true });
    const tmp = path + "." + randomUUID() + ".tmp";
    try {
      await writeFile(tmp, data, { flag: "wx" });
      await rename(tmp, path);
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }
  const voice = await readFile(
    new URL("../node_modules/kokoro-js/voices/af_heart.bin", import.meta.url),
  );
  if (sha(voice) !== VOICE_HASH)
    throw Error("Installed Heart voice hash differs from the pinned voice");
  // No article text leaves this process. All model transfers above precede inference.
  process.env.HF_HUB_DISABLE_TELEMETRY = "1";
  const [{ KokoroTTS }, { env }] = await Promise.all([
    import("kokoro-js"),
    import("@huggingface/transformers"),
  ]);
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  log("Loading Kokoro on the local CPU…");
  const tts = await KokoroTTS.from_pretrained(dir, {
    device: "cpu",
    dtype: config.dtype,
  });
  return {
    async generate(text) {
      const a = await tts.generate(text, {
        voice: "af_heart",
        speed: config.speed,
      });
      return { samples: a.audio, sampleRate: a.sampling_rate };
    },
    async dispose() {
      await tts.model.dispose();
    },
  };
}
