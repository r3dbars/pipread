/* SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright 2026 Justin Betker
 * New adapter for the pinned eSpeak NG public API. No upstream generated code.
 * Provided without warranty; see ../../licenses/espeak-GPL-3.0.txt.
 */
#include <stdlib.h>
#include <string.h>
#include <espeak-ng/speak_lib.h>

static char *result;
static size_t capacity;

int pip_init(void) {
  return espeak_Initialize(AUDIO_OUTPUT_SYNCHRONOUS, 0, "/data", 0) > 0 ? 0 : -1;
}

const char *pip_phonemize(const char *text, const char *voice) {
  if (!text || !voice || espeak_SetVoiceByName(voice) != EE_OK) return NULL;
  const void *cursor = text;
  size_t used = 0;
  do {
    const void *previous = cursor;
    const char *clause = espeak_TextToPhonemes(&cursor, espeakCHARS_UTF8, espeakPHONEMES_IPA);
    if (!clause || (cursor && cursor == previous)) return NULL;
    size_t n = strlen(clause);
    if (used + n + 2 > capacity) {
      size_t next = (used + n + 2) * 2;
      char *grown = realloc(result, next);
      if (!grown) return NULL;
      result = grown;
      capacity = next;
    }
    if (n) { memcpy(result + used, clause, n); used += n; result[used++] = '\n'; }
  } while (cursor);
  result[used] = 0;
  return result;
}
