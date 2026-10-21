// Simple IndexedDB helper to store uploaded project files in the browser
(function(){
  const DB_NAME = 'csl-projects-db';
  const STORE = 'files';
  let dbP = null;

  function openDB(){
    if(dbP) return dbP;
    dbP = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const idb = r.result;
        if(!idb.objectStoreNames.contains(STORE)) idb.createObjectStore(STORE, { keyPath: 'path' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbP;
  }

  async function saveFiles(files, basePath){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const s = tx.objectStore(STORE);
      const saved = [];
      Array.from(files).forEach(f => {
        const sub = f.webkitRelativePath || f.name;
        const path = basePath ? (basePath + '/' + sub) : sub;
        const rec = { path, name: f.name, type: f.type, size: f.size, lastModified: f.lastModified, blob: f };
        s.put(rec);
        saved.push(path);
      });
      tx.oncomplete = () => resolve(saved);
      tx.onerror = () => reject(tx.error || new Error('idb tx error'));
    });
  }

  async function listFiles(){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const s = tx.objectStore(STORE);
      const all = [];
      const cur = s.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if(!c) { resolve(all); return; }
        const { path, name, type, size, lastModified } = c.value;
        all.push({ path, name, type, size, lastModified });
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
  }

  async function getFile(path){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const s = tx.objectStore(STORE);
      const req = s.get(path);
      req.onsuccess = () => {
        if(!req.result) return resolve(null);
        resolve(req.result.blob);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function clearAll(){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const s = tx.objectStore(STORE);
      const req = s.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  window.IDBStorage = { saveFiles, listFiles, getFile, clearAll };
})();
