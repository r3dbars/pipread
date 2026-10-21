export const ENGINES = ["kokoro", "phonon"];
export const KOKORO_VOICE = "af_heart";
export const PHONON_DEFAULT_VOICE = "Easton";
export const PHONON_MODEL = "gradium/phonon-31m-en";
export const PHONON_MODEL_REF = "hf://gradium/phonon-31m-en";
const PHONON_VOICE = /^[\p{L}][\p{L}\p{N} _.'-]{0,79}$/u;

export function parseGenerateArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--write") {
      if (options.write) throw Error("Duplicate option: --write");
      options.write = true;
      continue;
    }
    if (arg === "--config" || arg === "--engine" || arg === "--voice") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--"))
        throw Error(`Unknown or incomplete option: ${arg}`);
      const key = arg.slice(2);
      if (options[key] !== undefined) throw Error(`Duplicate option: ${arg}`);
      options[key] = argv[++i];
      continue;
    }
    throw Error(`Unknown or incomplete option: ${arg}`);
  }
  if (!options.config)
    throw Error(
      "Usage: generate --config ./pipread.json [--write] [--engine kokoro|phonon] [--voice NAME]",
    );
  return { write: false, ...options };
}

export function resolveEngineOptions(raw = {}, overrides = {}) {
  const engine = overrides.engine ?? raw.engine ?? "kokoro";
  if (!ENGINES.includes(engine))
    throw Error(`Unknown engine: ${engine}. Use kokoro or phonon.`);
  const defaultVoice = engine === "phonon" ? PHONON_DEFAULT_VOICE : KOKORO_VOICE;
  let voice = overrides.voice ?? raw.voice ?? defaultVoice;
  if (overrides.engine != null && overrides.voice == null) {
    if (engine === "kokoro" && voice !== KOKORO_VOICE) voice = KOKORO_VOICE;
    if (engine === "phonon" && voice === KOKORO_VOICE) voice = PHONON_DEFAULT_VOICE;
  }
  if (engine === "kokoro") {
    if (voice !== KOKORO_VOICE)
      throw Error(`Kokoro supports only the ${KOKORO_VOICE} voice`);
  } else {
    if (voice === KOKORO_VOICE)
      throw Error(
        "af_heart is a Kokoro voice. For Phonon, omit voice to use Easton, or set a Phonon catalog voice such as Easton.",
      );
    if (typeof voice !== "string" || !voice.trim())
      throw Error("Invalid Phonon voice");
    if (/40m/i.test(voice) || /[\\/]/.test(voice) || /hf:\/\//i.test(voice))
      throw Error(
        "Phonon voice must be a catalog name. Only the phonon-31m-en model is supported.",
      );
    if (!PHONON_VOICE.test(voice)) throw Error("Invalid Phonon voice");
  }
  return { engine, voice, model: engine === "phonon" ? PHONON_MODEL : null };
}
