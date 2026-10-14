"""Align a generated PCM16 WAV to its existing Pipread timing transcript locally."""
import argparse, hashlib, importlib.metadata, json, os, pathlib, re, socket, wave

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--audio', type=pathlib.Path, required=True)
    p.add_argument('--timings', type=pathlib.Path, required=True)
    p.add_argument('--model-dir', type=pathlib.Path, required=True)
    p.add_argument('--output', type=pathlib.Path, required=True)
    a = p.parse_args()
    report_path = a.output.with_name(a.output.stem + '.provenance.json')
    if a.output.exists() or report_path.exists(): p.error('Choose new output paths; existing files are never overwritten')
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    source = json.loads(a.timings.read_text())
    paragraphs = source['paragraphs']
    if source.get('version') != 1 or not paragraphs: p.error('Expected a version-1 Pipread timing sidecar')
    segments = source.get('sentences') or [{**s, 'paragraph': i} for i, s in enumerate(paragraphs)]
    for i, paragraph in enumerate(paragraphs):
        actual = [t for s in segments if s['paragraph'] == i for t in s['text'].split()]
        if actual != paragraph['text'].split(): p.error('Chunk transcript does not match paragraphs')
    records = json.loads(pathlib.Path(__file__).with_name('model-files.json').read_text())
    for item in records:
        if digest(a.model_dir / item['file']) != item['sha256']: p.error('Alignment model hash mismatch: ' + item['file'])
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', TOKENIZERS_PARALLELISM='false')
    import numpy as np
    import torch, torchaudio
    import whisperx.alignment as wx
    if importlib.metadata.version('whisperx') != '3.8.6': p.error('Install the pinned alignment requirements')
    def offline(*args, **kwargs): raise RuntimeError('Network disabled during alignment')
    socket.create_connection = offline; socket.socket.connect = offline
    class SingleSpan:
        def span_tokenize(self, text): return [(0, len(text))]
    # Already bounded synthesis chunks need no additional sentence model.
    wx.nltk_load = lambda _: SingleSpan()
    torch.set_num_threads(4)
    with wave.open(str(a.audio)) as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2: p.error('Expected mono PCM16 WAV')
        rate = wav.getframerate(); duration = wav.getnframes() / rate
        pcm = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768
    if abs(duration - source['duration']) > 1 / rate: p.error('WAV duration differs from timing sidecar')
    if any(not 0 <= s['start'] < s['end'] <= duration + 1 / rate for s in segments): p.error('Invalid source segment times')
    audio = torchaudio.functional.resample(torch.from_numpy(pcm), rate, 16000).numpy()
    model, metadata = wx.load_align_model('en', 'cpu', model_name=str(a.model_dir.resolve()), model_cache_only=True)
    model.eval(); model.config.apply_spec_augment = False
    words, normalized_inputs, unmatched, scores = [], [], [], []
    for index, segment in enumerate(segments):
        tokens = segment['text'].split()
        normalized = [re.sub("[^a-z']", '', t.lower().replace('’', "'")) for t in tokens]
        if not all(normalized): p.error('A token has no supported letters; write out numbers/symbols before synthesis and regenerate')
        normalized_inputs.append({'segment': index, 'original': tokens, 'alignmentText': normalized})
        result = wx.align([{'text': ' '.join(normalized), 'start': segment['start'], 'end': segment['end']}], model, metadata, audio, 'cpu', interpolate_method='ignore')
        aligned = result['word_segments']
        if [w['word'] for w in aligned] != normalized: raise ValueError('Alignment token mismatch')
        for text, word in zip(tokens, aligned):
            if not all(k in word for k in ['start','end','score']) or word['start'] >= word['end']:
                unmatched.append({'text':text,'paragraph':segment['paragraph']}); continue
            words.append({'text':text,'start':word['start'],'end':word['end'],'paragraph':segment['paragraph']})
            scores.append({'index':len(words)-1,'text':text,'score':word['score']})
        print(f'Aligned {index+1}/{len(segments)}', flush=True)
    report = {'method':'WhisperX CTC forced alignment on CPU; no timestamp interpolation', 'whisperxVersion':'3.8.6', 'model':'facebook/wav2vec2-base-960h', 'modelRevision':'22aad52d435eb6dbaf354bdad9b0da84ce7d6156', 'modelWeightsSha256':next(x['sha256'] for x in records if x['file']=='model.safetensors'), 'audioSha256':digest(a.audio), 'timingsSha256':digest(a.timings), 'inputNormalization':normalized_inputs, 'unmatchedTokens':unmatched, 'lowConfidenceTokens':[s for s in scores if s['score']<.5], 'scores':scores, 'limitations':['Automated acoustic boundaries, not human annotation. Short words and pauses may be imperfect.', 'Unsupported numeric-only tokens are refused, not assigned guessed timings.'], 'packages':{name:importlib.metadata.version(name) for name in ['whisperx','torch','torchaudio','transformers','numpy','pandas','nltk']}}
    a.output.parent.mkdir(parents=True, exist_ok=True)
    with report_path.open('x') as f: json.dump(report,f,ensure_ascii=False,indent=2); f.write('\n')
    if unmatched: raise ValueError('Unmatched tokens recorded; no word-timing file emitted')
    for i, paragraph in enumerate(paragraphs):
        ws=[w for w in words if w['paragraph']==i]
        if [w['text'] for w in ws] != paragraph['text'].split(): raise ValueError('Incomplete transcript coverage')
        if any(not paragraph['start'] <= w['start'] < w['end'] <= paragraph['end'] for w in ws): raise ValueError('Word outside paragraph')
    if any(x['end']>y['start'] for x,y in zip(words,words[1:])): raise ValueError('Overlapping word boundaries')
    result={'kind':'aligned-words','audioFile':a.audio.name,'audioSha256':digest(a.audio),'duration':duration,'words':words}
    with a.output.open('x') as f: json.dump(result,f,ensure_ascii=False,indent=2); f.write('\n')
    print(f'Wrote {len(words)} words; {len(report["lowConfidenceTokens"])} low-score tokens. Review {report_path.name}.')

if __name__ == '__main__': main()
