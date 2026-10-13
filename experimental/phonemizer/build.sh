#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Local evaluation build; does not install, publish, or change the default player.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
: "${PIP_ESPEAK_SOURCE:?Set to the official espeak-ng git checkout}"
: "${PIP_EMSDK:?Set to an activated official emsdk 4.0.10 checkout}"
revision=4870adfa25b1a32b4361592f1be8a40337c58d6c
sdk_revision=62a853cd3b3134398ce85cde8bb5cbb2ef0194cb
test "$(git -C "$PIP_ESPEAK_SOURCE" rev-parse HEAD)" = "$revision"
test "$(git -C "$PIP_EMSDK" rev-parse HEAD)" = "$sdk_revision"
emcc="$PIP_EMSDK/upstream/emscripten/emcc"
"$emcc" --version | head -1 | grep -q '4.0.10'
cmake --version | head -1 | grep -q '3.31.6'
build="${PIP_BUILD_DIR:-$here/build}"
mkdir -p "$build" "$here/generated"
test ! -e "$build/source" || { echo 'Use a fresh PIP_BUILD_DIR.' >&2; exit 1; }
mkdir "$build/source"
git -C "$PIP_ESPEAK_SOURCE" archive "$revision" | tar -x -C "$build/source"
patch -d "$build/source" -p1 < "$here/espeak-1.52.0.patch"
options=(-G Ninja -DUSE_ASYNC=OFF -DUSE_MBROLA=OFF -DUSE_LIBSONIC=OFF -DUSE_LIBPCAUDIO=OFF -DUSE_SPEECHPLAYER=OFF -DBUILD_TESTING=OFF)
cmake -S "$build/source" -B "$build/native" "${options[@]}"
cmake --build "$build/native" -j 4
"$PIP_EMSDK/upstream/emscripten/emcmake" cmake -S "$build/source" -B "$build/wasm" "${options[@]}" -DCMAKE_BUILD_TYPE=Release -DNativeBuild_DIR="$build/native/src"
cmake --build "$build/wasm" --target espeak-ng -j 4
mkdir -p "$build/english/lang/gmw"
for file in en_dict phondata phonindex phontab intonations; do
  cp "$build/native/espeak-ng-data/$file" "$build/english/$file"
done
for file in en en-US; do
  cp "$build/native/espeak-ng-data/lang/gmw/$file" "$build/english/lang/gmw/$file"
done
"$emcc" "$here/bridge.c" "$build/wasm/src/libespeak-ng/libespeak-ng.a" "$build/wasm/src/ucd-tools/libucd.a" \
  -I "$build/source/src/include" -O3 -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 \
  -sENVIRONMENT=web,worker,node -sEXPORTED_FUNCTIONS='["_pip_init","_pip_phonemize"]' \
  -sEXPORTED_RUNTIME_METHODS='["ccall"]' \
  --preload-file "$build/english@/data/espeak-ng-data" -o "$here/generated/espeak.mjs"
(cd "$here/generated" && shasum -a 256 espeak.mjs espeak.wasm espeak.data > SHA256SUMS)
echo 'Built local evaluation assets. Public runtime distribution remains held.'
