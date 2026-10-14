"""Download only the pinned English alignment model; verify every file's SHA-256."""
import argparse, hashlib, json, pathlib, urllib.request

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    records = json.loads(pathlib.Path(__file__).with_name('model-files.json').read_text())
    args.output.mkdir(parents=True, exist_ok=True)
    for item in records:
        target = args.output / item['file']
        if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == item['sha256']:
            print('Verified cache:', item['file']); continue
        temporary = target.with_suffix(target.suffix + '.download')
        try:
            digest = hashlib.sha256()
            with urllib.request.urlopen(item['source'], timeout=120) as response, temporary.open('xb') as output:
                while block := response.read(1024 * 1024):
                    output.write(block); digest.update(block)
            if temporary.stat().st_size != item['bytes'] or digest.hexdigest() != item['sha256']:
                raise ValueError('Model integrity mismatch: ' + item['file'])
            temporary.replace(target)
            print('Downloaded and verified:', item['file'])
        finally:
            temporary.unlink(missing_ok=True)

if __name__ == '__main__': main()
