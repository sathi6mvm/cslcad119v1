function normalizeRemoteFileUrl(url) {
    if (typeof url !== 'string') return url;
    const trimmed = url.trim();
    if (!trimmed) return trimmed;

    try {
        const parsed = new URL(trimmed);
        const host = parsed.hostname.toLowerCase();
        if (host === 'github.com' || host === 'www.github.com') {
            const parts = parsed.pathname.split('/').filter(Boolean);
            const blobIndex = parts.indexOf('blob');
            if (blobIndex >= 0 && parts.length > blobIndex + 3) {
                const owner = parts[0];
                const repo = parts[1];
                const branch = parts[blobIndex + 1];
                const filePath = parts.slice(blobIndex + 2).join('/');
                const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
                console.log('Normalized GitHub blob URL to raw URL:', rawUrl);
                return rawUrl;
            }
        }
    } catch (err) {
        console.warn('normalizeRemoteFileUrl failed for', trimmed, err);
    }

    return trimmed;
}

const ProjectManager = {
    tree: [],
    selectedFiles: [],

    loadAndroidDownloads() {
        if (!window.AndroidProjectBridge || typeof window.AndroidProjectBridge.getDownloadProjects !== 'function') {
            return null;
        }

        try {
            const raw = window.AndroidProjectBridge.getDownloadProjects();
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const tree = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.contents) ? [parsed] : []);
            if (!Array.isArray(tree) || tree.length === 0) return null;
            this.tree = tree;
            const container = document.getElementById('project-container');
            if (container) this.buildTree(this.tree, container);
            return tree;
        } catch (err) {
            console.warn('ProjectManager: Android downloads unavailable', err);
            return null;
        }
    },

    init() {
    const isAndroidApp = !!(window.AndroidProjectBridge && typeof window.AndroidProjectBridge.getDownloadProjects === 'function');
    const isLocalFileApp = window.location.protocol === 'file:';
    const apiBase = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/';
    const projectsUrl = apiBase + 'api/projects';

    if (isAndroidApp) {
        const androidTree = this.loadAndroidDownloads();
        if (androidTree && androidTree.length > 0) {
            return;
        }
    }

    if (isAndroidApp || isLocalFileApp) {
        const container = document.getElementById('project-container');
        fetch('./projects/index.json')
            .then(res => {
                if (!res.ok) throw new Error('no local index');
                return res.json();
            })
            .then(data => {
                this.tree = data;
                if (container) this.buildTree(this.tree, container);
            })
            .catch(() => {
                if (container) {
                    container.innerHTML = '<div style="padding:12px;color:var(--panel-text);opacity:0.8;">No local project files found. Please place files in the Downloads/projects folder, or select them from the device file picker.</div>';
                }
            });
        return;
    }

    fetch(projectsUrl)
            .then(res => {
                if (!res.ok) throw new Error('no server');
                return res.json();
            })
            .then(data => {
                this.tree = data;
                const container = document.getElementById('project-container');
                if (container) this.buildTree(this.tree, container);
            })
            .catch(err => {
        console.warn('ProjectManager: falling back to local directory picker', err);
                const container = document.getElementById('project-container');
                // Try a local index manifest first (useful for offline / static deployments)
                            fetch('./projects/index.json').then(r => {
                    if (!r.ok) throw new Error('no local index');
                    return r.json();
                }).then(data => {
                    this.tree = data;
                    if (container) this.buildTree(this.tree, container);
                }).catch(() => {
                                // If local index not present, try server-backed Drive session endpoint
                                const apiBaseSess = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/';
                                fetch(apiBaseSess + 'session', { credentials: 'include' }).then(r=>r.json()).then(sesh=>{
                                    if (sesh && sesh.signedIn) {
                                        // fetch drive list from server and build a simple manifest
                                        fetch(apiBaseSess + 'drive/list', { credentials: 'include' }).then(r=>r.json()).then(files=>{
                                            // Build manifest with folders and files
                                            const manifest = [];
                                            files.forEach(f => {
                                                if (!f || !f.name) return;
                                                if (f.mimeType === 'application/vnd.google-apps.folder') {
                                                    manifest.push({ type: 'folder', name: f.name, driveFolderId: f.id, contents: [] });
                                                } else {
                                                    manifest.push({ type: 'file', name: f.name, path: apiBaseSess + `drive/proxy/${f.id}` });
                                                }
                                            });
                                            this.tree = manifest;
                                            if (container) this.buildTree(this.tree, container);
                                        }).catch(()=>{/* ignore */});
                                    }
                                }).catch(()=>{});
                    if (container) container.innerHTML = '<div style="padding:12px;color:var(--panel-text);opacity:0.8;">No server project index. Use the <button onclick="document.getElementById(\'projectsUploadFilesInput\').click()">Select File</button>, then <button onclick="ProjectManager.uploadSelectedFiles()">Upload</button>, or create a <button onclick="ProjectManager.createFolder()">New Folder</button>. (Using browser storage is available)</div>';
                });
                const dirInput = document.getElementById('projectsDirInput');
                    const uploadInput = document.getElementById('projectsUploadInput');
                    const uploadFilesInput = document.getElementById('projectsUploadFilesInput');
                if (dirInput) dirInput.addEventListener('change', (e) => {
                    console.log('projectsDirInput selected files:', Array.from(e.target.files).map(f=>f.webkitRelativePath||f.name));
                    this.loadDirectoryFiles(e.target.files);
                    this.tryUploadFiles(e.target.files).catch(()=>{
                        const base = this._lastUploadRoot || null;
                        IDBStorage.saveFiles(e.target.files, base).then(()=>{ this._lastUploadRoot = null; this.loadFromIDB(); });
                    });
                });
                if (uploadInput) uploadInput.addEventListener('change', (e) => {
                    const fileNames = Array.from(e.target.files).map(f=>f.webkitRelativePath||f.name);
                    console.log('projectsUploadInput (folder) selected files:', fileNames);
                    // Ask user for a root folder name to create on the server so the selected folder is preserved
                    let rootName = window.prompt('Enter folder name to create on the server for this upload (leave blank to upload files directly into projects/):', '');
                    rootName = (rootName || '').trim();
                    this._lastUploadRoot = rootName || null;
                    this.loadDirectoryFiles(e.target.files);
                    // Pass lastUploadRoot implicitly via this._lastUploadRoot which tryUploadFiles will append to the form
                    this.tryUploadFiles(e.target.files).catch(()=>{
                        const base = this._lastUploadRoot || null;
                        IDBStorage.saveFiles(e.target.files, base).then(()=>{ this._lastUploadRoot = null; this.loadFromIDB(); });
                    });
                });
                if (uploadFilesInput) uploadFilesInput.addEventListener('change', (e) => {
                    console.log('projectsUploadFilesInput (files) selected files:', Array.from(e.target.files).map(f=>f.name));
                    this.addUploadedFiles(e.target.files);
                    this.showSelectedFiles(e.target.files);
                });
                // Attempt to load from IndexedDB if present
                this.loadFromIDB().catch(()=>{});
            });
    },

    // debugUpload removed; use uploadSelectedFiles() which provides progress and status updates

    showSelectedFiles(fileList) {
        const files = Array.from(fileList || []);
        this.selectedFiles = files;
        const list = document.getElementById('projects-selected-list');
        if (!list) return;
        list.innerHTML = '';
        files.forEach((f, idx) => {
            const name = f.webkitRelativePath || f.name;
            const row = document.createElement('div');
            row.id = `proj-sel-${idx}`;
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.padding = '4px 0';
            row.innerHTML = `<span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:60%">${name}</span><span id="proj-sel-status-${idx}" style="color:var(--accent);opacity:0.9">Selected</span>`;
            list.appendChild(row);
        });
    },

    uploadSelectedFiles() {
        const files = (this.selectedFiles && this.selectedFiles.length>0) ? this.selectedFiles : (document.getElementById('projectsUploadFilesInput') && document.getElementById('projectsUploadFilesInput').files ? Array.from(document.getElementById('projectsUploadFilesInput').files) : []);
        if (!files || files.length === 0) {
            const list = document.getElementById('projects-selected-list');
            if (list) list.innerHTML = '<div style="padding:6px;color:var(--accent);">No files selected to upload.</div>';
            return;
        }

        const uploadBtn = document.getElementById('projectsUploadBtn');
        if (uploadBtn) uploadBtn.disabled = true;
        // mark all as uploading
        files.forEach((f, idx) => {
            const statusEl = document.getElementById(`proj-sel-status-${idx}`);
            if (statusEl) statusEl.innerText = 'Uploading...';
        });
        this.tryUploadFiles(files).then(result => {
            if (uploadBtn) uploadBtn.disabled = false;
            if (result && result.saved && Array.isArray(result.saved)) {
                files.forEach((f, idx) => {
                    const statusEl = document.getElementById(`proj-sel-status-${idx}`);
                    if (statusEl) statusEl.innerText = 'Uploaded';
                });
            } else {
                files.forEach((f, idx) => {
                    const statusEl = document.getElementById(`proj-sel-status-${idx}`);
                    if (statusEl) statusEl.innerText = 'Saved (local)';
                });
            }
        }).catch(err => {
            if (uploadBtn) uploadBtn.disabled = false;
            files.forEach((f, idx) => {
                const statusEl = document.getElementById(`proj-sel-status-${idx}`);
                if (statusEl) statusEl.innerText = 'Failed';
            });
        });
    },

    async createFolder() {
        const name = (window.prompt('Enter new folder name to create under projects:', '') || '').trim();
        if (!name) return;
        const apiBase = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/';
        const url = apiBase + 'api/create-folder';
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
            const json = await res.json();
            if (!res.ok) throw new Error(json && json.error ? json.error : 'create failed');
            const container = document.getElementById('project-container');
            if (container) container.insertAdjacentHTML('afterbegin', `<div style="padding:8px;color:var(--accent);">Created folder: ${json.path}</div>`);
            // set as current upload root so subsequent uploads go into this folder
            this._lastUploadRoot = name;
            // reload tree
            this.init();
        } catch (e) {
            // If server create failed, create a local virtual folder in the project tree and set upload root
            const container = document.getElementById('project-container');
            if (container) container.insertAdjacentHTML('afterbegin', `<div style="padding:8px;color:var(--accent);">Server not available — created local folder: ${name}</div>`);
            // ensure folder doesn't already exist
            const exists = Array.isArray(this.tree) && this.tree.find(x => x.type === 'folder' && x.name === name);
            if (!exists) {
                this.tree = Array.isArray(this.tree) ? this.tree.slice() : [];
                this.tree.unshift({ type: 'folder', name: name, contents: [] });
            }
            this._lastUploadRoot = name;
            const containerEl = document.getElementById('project-container');
            if (containerEl) this.buildTree(this.tree, containerEl);
        }
    },

    loadDirectoryFiles(fileList) {
        const files = Array.from(fileList);
        const root = [];

        files.forEach(file => {
            const rel = file.webkitRelativePath || file.name;
            const parts = rel.split('/');
            let cur = root;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isFile = (i === parts.length - 1);

                if (isFile) {
                    cur.push({ type: 'file', name: part, file: file, path: rel });
                } else {
                    let folder = cur.find(x => x.type === 'folder' && x.name === part);
                    if (!folder) {
                        folder = { type: 'folder', name: part, contents: [] };
                        cur.push(folder);
                    }
                    cur = folder.contents;
                }
            }
        });

        this.tree = root;
        const container = document.getElementById('project-container');
        if (container) this.buildTree(this.tree, container);
    },

    addUploadedFiles(fileList) {
        const files = Array.from(fileList);
        files.forEach(file => {
            this.tree.push({ type: 'file', name: file.name, file: file, path: file.name });
        });
        const container = document.getElementById('project-container');
        if (container) this.buildTree(this.tree, container);
    },

        tryUploadFiles(fileList) {
        // Attempt to upload files to server at /upload preserving relative paths when available.
        const files = Array.from(fileList || []);
        if (files.length === 0) return Promise.reject(new Error('no files'));

        const apiBase = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/';
        const uploadUrl = apiBase + 'upload';

        return new Promise((resolve, reject) => {
            const saved = [];
            let i = 0;

            const uploadNext = () => {
                if (i >= files.length) {
                    try { this.init(); } catch (e) {}
                    resolve({ saved });
                    return;
                }

                const f = files[i];
                const fd = new FormData();
                const name = f.webkitRelativePath || f.name;
                fd.append('files', f, name);
                if (this._lastUploadRoot) {
                    fd.append('uploadRoot', this._lastUploadRoot);
                    this._lastUploadRoot = null;
                }

                const xhr = new XMLHttpRequest();
                xhr.open('POST', uploadUrl, true);

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const res = JSON.parse(xhr.responseText);
                            if (res && res.saved && Array.isArray(res.saved)) saved.push(...res.saved);
                        } catch (e) {}
                        const statusEl = document.getElementById(`proj-sel-status-${i}`);
                        if (statusEl) statusEl.innerText = 'Uploaded';
                        i++; uploadNext();
                    } else {
                        // fallback to saving to IndexedDB if available
                        if (window.IDBStorage && IDBStorage.saveFiles) {
                            const base = this._lastUploadRoot || null;
                            IDBStorage.saveFiles(files, base).then(() => {
                                this._lastUploadRoot = null;
                                files.forEach((_, idx) => { const s = document.getElementById(`proj-sel-status-${idx}`); if (s) s.innerText = 'Saved (local)'; });
                                resolve({ saved: [] });
                            }).catch(err => { files.forEach((_, idx) => { const s = document.getElementById(`proj-sel-status-${idx}`); if (s) s.innerText = 'Failed'; }); reject(new Error('upload failed')); });
                        } else {
                            files.forEach((_, idx) => { const s = document.getElementById(`proj-sel-status-${idx}`); if (s) s.innerText = 'Failed'; });
                            reject(new Error('upload failed status ' + xhr.status));
                        }
                    }
                };

                xhr.onerror = () => {
                    if (window.IDBStorage && IDBStorage.saveFiles) {
                        const base = this._lastUploadRoot || null;
                        IDBStorage.saveFiles(files, base).then(() => {
                            this._lastUploadRoot = null;
                            files.forEach((_, idx) => { const s = document.getElementById(`proj-sel-status-${idx}`); if (s) s.innerText = 'Saved (local)'; });
                            resolve({ saved: [] });
                        }).catch(() => { files.forEach((_, idx) => { const s = document.getElementById(`proj-sel-status-${idx}`); if (s) s.innerText = 'Failed'; }); reject(new Error('network error')); });
                    } else {
                        files.forEach((_, idx) => { const s = document.getElementById(`proj-sel-status-${idx}`); if (s) s.innerText = 'Failed'; });
                        reject(new Error('network error'));
                    }
                };

                xhr.upload.onprogress = (ev) => {
                    if (ev.lengthComputable) {
                        const pct = Math.round(ev.loaded / ev.total * 100);
                        const statusEl = document.getElementById(`proj-sel-status-${i}`);
                        if (statusEl) statusEl.innerText = `Uploading ${pct}%`;
                    }
                };

                xhr.send(fd);
            };

            uploadNext();
        });
    },

        async loadFromIDB(){
            if(!window.IDBStorage) return Promise.reject(new Error('no idb'));
            const entries = await IDBStorage.listFiles();
            if(!entries || entries.length===0) return Promise.reject(new Error('empty'));
            // Build nested tree from paths
            const root = [];
            entries.forEach(e => {
                const parts = e.path.split('/');
                let cur = root;
                for(let i=0;i<parts.length;i++){
                    const part = parts[i];
                    const isFile = (i===parts.length-1);
                    if(isFile){
                        cur.push({ type:'file', name: part, path: e.path, idb: true });
                    } else {
                        let folder = cur.find(x=>x.type==='folder' && x.name===part);
                        if(!folder){ folder={ type:'folder', name: part, contents: [] }; cur.push(folder); }
                        cur = folder.contents;
                    }
                }
            });
            this.tree = root;
            const container = document.getElementById('project-container');
            if (container) this.buildTree(this.tree, container);
            return root;
        },

    buildTree(data, parentElement) {
        parentElement.innerHTML = '';

        data.forEach(item => {
            const row = document.createElement('div');
            row.className = 'proj-item';

            if (item.type === 'folder') {
                row.innerHTML = `<div style="display:flex;align-items:center;"><span class="material-icons">folder</span> ${item.name}</div><span class="material-icons">chevron_right</span>`;

                const nestedContainer = document.createElement('div');
                nestedContainer.className = 'proj-folder';
                // If folder.contents already present, build it; otherwise leave empty until clicked
                if (Array.isArray(item.contents) && item.contents.length>0) this.buildTree(item.contents, nestedContainer);

                row.onclick = (e) => {
                    e.stopPropagation();
                    // If this is a Drive folder, fetch its contents from server
                    if (item.driveFolderId) {
                        const apiBase = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/';
                        fetch(apiBase + 'drive/list?folderId=' + encodeURIComponent(item.driveFolderId), { credentials: 'include' }).then(r=>r.json()).then(files=>{
                            const contents = [];
                            files.forEach(f=>{
                                if (!f) return;
                                if (f.mimeType === 'application/vnd.google-apps.folder') contents.push({ type:'folder', name:f.name, driveFolderId:f.id, contents: [] });
                                else contents.push({ type:'file', name:f.name, path: apiBase + `drive/proxy/${f.id}` });
                            });
                            item.contents = contents;
                            nestedContainer.innerHTML = '';
                            this.buildTree(item.contents, nestedContainer);
                            nestedContainer.classList.add('open');
                            row.querySelector('span:last-child').innerText = 'expand_less';
                        }).catch(err=>{ console.error('Failed to list drive folder', err); });
                    } else {
                        nestedContainer.classList.toggle('open');
                        row.querySelector('span:last-child').innerText = nestedContainer.classList.contains('open') ? 'expand_less' : 'chevron_right';
                    }
                };

                parentElement.appendChild(row);
                parentElement.appendChild(nestedContainer);
            } else if (item.type === 'file') {
                row.innerHTML = `<div style="display:flex;align-items:center;"><span class="material-icons">insert_drive_file</span> ${item.name}</div>`;

                const openBtn = document.createElement('button');
                openBtn.className = 'proj-open-btn icon-btn';
                openBtn.innerHTML = '<span class="material-icons">folder_open</span>';
                openBtn.title = 'Open (replace)';

                const addBtn = document.createElement('button');
                addBtn.className = 'proj-add-btn icon-btn';
                addBtn.innerHTML = '<span class="material-icons">add</span>';
                addBtn.title = 'Add (append)';

                // always show action buttons; use an actions container aligned to the right
                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.gap = '8px';
                actions.style.alignItems = 'center';

                const handleFileAction = (btn, append=false) => {
                    return async (e) => {
                        e.stopPropagation();
                        const prevHTML = btn.innerHTML;
                        btn.innerHTML = '<span class="material-icons">autorenew</span>';
                        try {
                            let fileData = null;
                            if (item.file) {
                                fileData = item.file;
                            } else if (item.idb) {
                                const blob = await IDBStorage.getFile(item.path);
                                if (!blob) throw new Error('not found in idb');
                                fileData = new File([blob], item.name, { type: blob.type });
                            } else if (item.path) {
                                const apiBase = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/';
                                const rawUrl = (item.path.startsWith('http') || item.path.startsWith('/') || item.path.startsWith('file://')) ? item.path : apiBase + item.path;
                                const url = normalizeRemoteFileUrl(rawUrl);
                                if (window.AndroidProjectBridge && typeof window.AndroidProjectBridge.readFileDataUrl === 'function' && (url.startsWith('file://') || url.startsWith('/'))) {
                                    const dataUrl = window.AndroidProjectBridge.readFileDataUrl(item.path || url);
                                    if (dataUrl) {
                                        const response = await fetch(dataUrl);
                                        const blob = await response.blob();
                                        fileData = new File([blob], item.name, { type: blob.type || 'application/octet-stream' });
                                    }
                                }
                                if (!fileData) {
                                    const response = await fetch(url, { cache: 'no-store' });
                                    if (!response.ok) {
                                        throw new Error(`Failed to load ${item.name}: ${response.status}`);
                                    }
                                    const blob = await response.blob();
                                    fileData = new File([blob], item.name, { type: blob.type || 'application/octet-stream' });
                                }
                            }

                            if (!fileData) throw new Error('file could not be read');
                            if (append) {
                                await this.loadAndAppendFile(fileData, true);
                            } else {
                                if (window.App) App._appendMode = false;
                                this.openLocalFile(fileData);
                            }
                            btn.innerHTML = prevHTML;
                        } catch (err) {
                            console.error('Failed to load file:', err);
                            btn.innerHTML = '<span class="material-icons">error</span>';
                        }
                    };
                };

                openBtn.onclick = handleFileAction(openBtn, false);
                addBtn.onclick = handleFileAction(addBtn, true);

                actions.appendChild(openBtn);
                actions.appendChild(addBtn);
                row.appendChild(actions);
                parentElement.appendChild(row);
            }
        });
    },

    openLocalFile(file) {
        // Route CAD files to the existing parser flow so the main viewer can open them correctly.
        const name = (file && file.name) ? file.name.toLowerCase() : '';
        if (
            name.endsWith('.3dd') ||
            name.endsWith('.3dcsl') ||
            name.endsWith('.3dm') ||
            name.endsWith('.dxf') ||
            name.endsWith('.step') ||
            name.endsWith('.stp') ||
            name.endsWith('.igs') ||
            name.endsWith('.iges')
        ) {
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInput.files = dt.files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
        }

        // Fallback: show in simple viewer for non-3D files
        const viewer = document.getElementById('project-file-viewer');
        const filename = document.getElementById('viewer-filename');
        const content = document.getElementById('viewer-content');
        filename.innerText = file.name;
        content.innerHTML = '';

        const textLike = file.type.startsWith('text') || /\.(txt|md|json|csv|xml|html|css|js|csl)$/i.test(file.name);

        if (textLike) {
            const reader = new FileReader();
            reader.onload = () => { content.textContent = reader.result; viewer.style.display = 'block'; };
            reader.onerror = () => { content.textContent = 'Failed to read file.'; viewer.style.display = 'block'; };
            reader.readAsText(file);
        } else {
            if (/^image\//.test(file.type)) {
                const url = URL.createObjectURL(file);
                const img = document.createElement('img');
                img.src = url; img.style.maxWidth = '100%'; img.style.maxHeight = '100%';
                content.appendChild(img);
                viewer.style.display = 'block';
            } else {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(file);
                link.download = file.name;
                link.innerText = 'Download ' + file.name;
                link.style.color = 'var(--accent)';
                content.appendChild(link);
                viewer.style.display = 'block';
            }
        }
    },

    async loadAndAppendFile(file, append=true) {
        try {
            if (!file) throw new Error('no file');
            const name = file.name || 'file';
            const lname = name.toLowerCase();
            if (lname.endsWith('.step') || lname.endsWith('.stp') || lname.endsWith('.igs') || lname.endsWith('.iges') || lname.endsWith('.dxf') || lname.endsWith('.3dm')) {
                if (window.App) App._appendMode = append;
                this.openLocalFile(file);
                return true;
            }

            if (UI && UI.setLoading) UI.setLoading(`Reading ${name}...`);
            const buffer = await file.arrayBuffer();
            const isEncrypted = name.toLowerCase().endsWith('.3dcsl');
            let text;
            if (isEncrypted) {
                const data = new Uint8Array(buffer);
                const decrypted = await decryptAES(data, ENCRYPTION_PASSWORD);
                if (!decrypted) {
                    if (UI && UI.setLoading) UI.setLoading(`Failed to decrypt ${name}`);
                    throw new Error('decrypt failed');
                }
                text = decrypted;
            } else {
                text = new TextDecoder('utf-8').decode(buffer);
            }

            if (!text || !text.includes('I obi')) {
                if (UI && UI.setLoading) UI.setLoading(`Warning: ${name} may not be a valid project file`);
                throw new Error('invalid file');
            }

            if (UI && UI.setLoading) UI.setLoading('Parsing Geometry...');
            // collect parts and add directly to Parser
            const parts = Parser.collectParts(text, name);
            if (parts && parts.length > 0) {
                if (!append && Parser && Parser.fileDataList) Parser.fileDataList = [];
                const prevList = Array.isArray(Parser.fileDataList) ? Parser.fileDataList.slice() : [];
                console.log('Before append, Parser.fileDataList length=', prevList.length);
                // assign combined list to avoid races that clear the array elsewhere
                Parser.fileDataList = prevList.concat([{ name, rawParts: parts }]);
                console.log('After append, Parser.fileDataList length=', Parser.fileDataList.length);
                if (UI && UI.setLoading) UI.setLoading('Building Scene...');
                // give the parser a moment
                setTimeout(() => {
                    try { Parser.buildAllFiles(); } catch (err) { console.error('Build error:', err); }
                    if (UI && UI.setLoading) UI.setLoading(null);
                }, 50);
            }
            return true;
        } catch (err) {
            if (UI && UI.setLoading) UI.setLoading('Error: ' + (err && err.message));
            return Promise.reject(err);
        }
    },

    downloadAll() {
        alert('Download All is not supported in local mode. Open files and download individually.');
    }
};

// Auto-scanning is disabled to avoid slow startup. Projects are loaded only when the user opens the Projects panel.
