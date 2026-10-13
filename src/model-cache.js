// IndexedDB stores large model blobs atomically. Chrome rejected the 326 MB
// fp32 model as a single Cache API response in our actual browser test.
export function createModelCache(report = () => {}) {
  let connection;
  const open = () => connection ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('article-voice-assets-v1', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('assets');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Model cache is blocked by another tab.'));
  });
  const warning = error => report({ type: 'cache-warning', message: error.message });
  return {
    async match(key) {
      try {
        const db = await open();
        const record = await new Promise((resolve, reject) => {
          const request = db.transaction('assets').objectStore('assets').get(String(key));
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        if (!record) return undefined;
        report({ type: 'cache', status: 'hit', key: String(key), bytes: record.blob.size });
        return new Response(record.blob, { headers: record.headers });
      } catch (error) { warning(error); return undefined; }
    },
    async put(key, response) {
      try {
        const blob = await response.blob();
        const headers = [...response.headers];
        // A cached body has a known decoded length even if CDN transfer was chunked.
        const filtered = headers.filter(([k]) => !['content-length', 'content-encoding'].includes(k));
        filtered.push(['content-length', String(blob.size)]);
        const db = await open();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('assets', 'readwrite');
          tx.objectStore('assets').put({ blob, headers: filtered }, String(key));
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Cache write cancelled.'));
        });
        report({ type: 'cache', status: 'stored', key: String(key), bytes: blob.size });
      } catch (error) { warning(error); }
    },
  };
}
