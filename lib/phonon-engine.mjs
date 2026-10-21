import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import {
  PHONON_DEFAULT_VOICE,
  PHONON_MODEL,
  PHONON_MODEL_REF,
} from "./engine.mjs";

const defaultExecFile = promisify(execFileCb);
export { PHONON_DEFAULT_VOICE, PHONON_MODEL, PHONON_MODEL_REF };
export const PHONON_QUANT = "q8";
export const PHONON_LANG = "en";
// Stay under Windows CreateProcess and Linux MAX_ARG_STRLEN with room for flags.
export const MAX_PTTS_TEXT_BYTES = 16 * 1024;
const PTTS_TIMEOUT_MS = 15 * 60 * 1000;

const bytes = (text) => Buffer.byteLength(text, "utf8");

export async function findOnPath(name, env = process.env) {
  const pathVar = env.PATH || env.Path || "";
  const exts =
    process.platform === "win32"
      ? (env.PATHEXT || ".EXE;.CMD;.BAT").split(";").filter(Boolean)
      : [""];
  const names = [];
  for (const ext of exts) {
    const n =
      ext && !name.toLowerCase().endsWith(ext.toLowerCase()) ? name + ext : name;
    if (!names.includes(n)) names.push(n);
  }
  for (const dir of pathVar.split(delimiter)) {
    if (!dir) continue;
    for (const n of names) {
      const candidate = join(dir, n);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // try the next PATH entry
      }
    }
  }
  return null;
}

export function missingPttsError() {
  return Error(
    "Phonon requires the ptts CLI. Install a ptts binary on PATH (Homebrew: brew install gradium-ai/tap/ptts, or a GitHub release), or install uv (`pip install uv`) so Pipread can run `uvx ptts`. Only the Apache-2.0 phonon-31m-en model is used.",
  );
}

export async function resolvePtts({
  env = process.env,
  find = findOnPath,
} = {}) {
  const ptts = await find("ptts", env);
  if (ptts) return { command: ptts, prefix: [] };
  const uvx = await find("uvx", env);
  if (uvx) return { command: uvx, prefix: ["ptts"] };
  throw missingPttsError();
}

export function chunkPhononText(text, maxBytes = MAX_PTTS_TEXT_BYTES) {
  return splitPhononParagraphs(text).flatMap((paragraph) =>
    chunkPhononParagraph(paragraph, maxBytes),
  );
}

export function splitPhononParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function chunkPhononParagraph(paragraph, maxBytes = MAX_PTTS_TEXT_BYTES) {
  const text = String(paragraph || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  if (bytes(text) <= maxBytes) return [text];
  const pieces = [];
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  for (const { segment } of segmenter.segment(text)) {
    const sentence = segment.trim();
    if (!sentence) continue;
    if (bytes(sentence) <= maxBytes) pieces.push(sentence);
    else pieces.push(...splitLongSentence(sentence, maxBytes));
  }
  return pieces;
}

export function phononNarrationChunks(paragraphs, maxBytes = MAX_PTTS_TEXT_BYTES) {
  return paragraphs.flatMap((text, index) =>
    chunkPhononParagraph(text, maxBytes).map((chunk) => ({
      text: chunk,
      paragraph: index,
    })),
  );
}

function splitLongSentence(text, maxBytes) {
  const words = text.split(/\s+/).filter(Boolean);
  const pieces = [];
  let current = "";
  const flush = () => {
    if (current) pieces.push(current);
    current = "";
  };
  for (const word of words) {
    if (bytes(word) > maxBytes) {
      flush();
      pieces.push(...splitUtf8(word, maxBytes));
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (bytes(next) > maxBytes) {
      flush();
      current = word;
    } else current = next;
  }
  flush();
  return pieces;
}

function splitUtf8(text, maxBytes) {
  const pieces = [];
  let current = "";
  for (const ch of text) {
    if (bytes(current + ch) > maxBytes) {
      if (!current)
        throw Error("Unsplittable character exceeds the ptts argument limit");
      pieces.push(current);
      current = ch;
    } else current += ch;
  }
  if (current) pieces.push(current);
  return pieces;
}

export function parseWav(buffer) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 12 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  )
    throw Error("Not a WAV file");
  let offset = 12;
  let fmt;
  let dataOffset;
  let dataLength;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length) throw Error("Truncated WAV chunk");
    if (id === "fmt ") {
      if (size < 16) throw Error("WAV fmt chunk is too small");
      fmt = {
        audioFormat: buffer.readUInt16LE(start),
        numChannels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        byteRate: buffer.readUInt32LE(start + 8),
        blockAlign: buffer.readUInt16LE(start + 12),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      dataOffset = start;
      dataLength = size;
    }
    offset = start + size + (size % 2);
  }
  if (!fmt || dataOffset == null) throw Error("WAV missing fmt or data");
  return { ...fmt, dataOffset, dataLength };
}

export function writePcm16Wav(pcmBytes, sampleRate) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
    throw Error("Invalid WAV sample rate");
  if (!pcmBytes.length || pcmBytes.length % 2) throw Error("Invalid PCM payload");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBytes.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBytes.length, 40);
  return Buffer.concat([header, pcmBytes]);
}

export function concatWavs(buffers) {
  if (!Array.isArray(buffers) || !buffers.length)
    throw Error("No WAV files to concatenate");
  const parsed = buffers.map((buffer, index) => {
    const info = parseWav(buffer);
    if (
      info.audioFormat !== 1 ||
      info.numChannels !== 1 ||
      info.bitsPerSample !== 16
    )
      throw Error(`WAV ${index} is not 16-bit mono PCM`);
    return info;
  });
  const first = parsed[0];
  for (let i = 1; i < parsed.length; i++) {
    const next = parsed[i];
    if (
      next.sampleRate !== first.sampleRate ||
      next.audioFormat !== first.audioFormat ||
      next.numChannels !== first.numChannels ||
      next.bitsPerSample !== first.bitsPerSample
    )
      throw Error(
        `WAV format mismatch: ${first.sampleRate} Hz ${first.bitsPerSample}-bit ${first.numChannels}ch vs ${next.sampleRate} Hz ${next.bitsPerSample}-bit ${next.numChannels}ch`,
      );
  }
  const data = Buffer.concat(
    parsed.map((info, i) =>
      buffers[i].subarray(info.dataOffset, info.dataOffset + info.dataLength),
    ),
  );
  return writePcm16Wav(data, first.sampleRate);
}

export function wavToPcm(buffer) {
  const info = parseWav(buffer);
  if (
    info.audioFormat !== 1 ||
    info.numChannels !== 1 ||
    info.bitsPerSample !== 16
  )
    throw Error(
      `Unsupported WAV format: ${info.audioFormat}/${info.numChannels}ch/${info.bitsPerSample}bit`,
    );
  const samples = new Float32Array(info.dataLength / 2);
  for (let i = 0; i < samples.length; i++)
    samples[i] = buffer.readInt16LE(info.dataOffset + i * 2) / 32768;
  return { samples, sampleRate: info.sampleRate };
}

export function pttsArgs(text, outPath, voice, prefix = []) {
  return [
    ...prefix,
    "--model",
    PHONON_MODEL_REF,
    "--lang",
    PHONON_LANG,
    "--quant",
    PHONON_QUANT,
    "--voice",
    voice,
    text,
    "-o",
    outPath,
  ];
}

export async function loadEngine(
  config,
  log = () => {},
  {
    resolve = resolvePtts,
    execFile = defaultExecFile,
    env = process.env,
  } = {},
) {
  const voice = config.voice || PHONON_DEFAULT_VOICE;
  const ptts = await resolve({ env, find: findOnPath });
  log(
    ptts.prefix.length
      ? `Using uvx ptts (${ptts.command}) with ${PHONON_MODEL}`
      : `Using ptts at ${ptts.command} with ${PHONON_MODEL}`,
  );
  return {
    async generate(text) {
      const chunks = chunkPhononText(text);
      if (!chunks.length) throw Error("No text to synthesize");
      const dir = await mkdtemp(join(tmpdir(), "pipread-phonon-"));
      try {
        const wavs = [];
        for (let i = 0; i < chunks.length; i++) {
          const out = join(dir, `${String(i).padStart(4, "0")}.wav`);
          log(`Phonon: synthesizing piece ${i + 1}/${chunks.length}`);
          const args = pttsArgs(chunks[i], out, voice, ptts.prefix);
          try {
            await execFile(ptts.command, args, {
              timeout: PTTS_TIMEOUT_MS,
              maxBuffer: 8 * 1024 * 1024,
              windowsHide: true,
              env,
            });
          } catch (e) {
            const detail = [e.stderr, e.stdout, e.message]
              .filter(Boolean)
              .join("\n")
              .slice(0, 2000);
            throw Error(`ptts failed: ${detail}`);
          }
          wavs.push(await readFile(out));
        }
        return wavToPcm(concatWavs(wavs));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    async dispose() {},
  };
}
