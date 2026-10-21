(function () {
  function notifySceneStateChanged() {
    if (window && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('sceneStateChanged'));
    }
  }

  const Outliner = {
    data: {},
    _initialized: false,

    init() {
      if (this._initialized) return;
      window.addEventListener('sceneStateChanged', () => {
        try {
          this.syncUI();
        } catch (error) {
          console.warn('Outliner sceneStateChanged error:', error);
        }
      });
      this._initialized = true;
      this.syncUI();
    },

    build() {
      this.data = {};
      Parser.modelGroup.children.forEach((mesh) => {
        const meta = mesh.userData;
        const block = meta.midAssy || 'Assembly';
        const sub = meta.subAssy || 'Subassembly';
        const part = meta.partName || 'Part';
        if (!this.data[block]) this.data[block] = {};
        if (!this.data[block][sub]) this.data[block][sub] = [];
        this.data[block][sub].push({ name: part, mesh: mesh });
      });
      this.render();
    },

    render() {
      let html = '';
      for (const block in this.data) {
        const blockId = 'b_' + block.replace(/[^a-zA-Z0-9]/g, '_');
        const safeBlock = encodeURIComponent(block);
        let firstMeshColor = 'cccccc';
        outerLoop: for (const sub in this.data[block]) {
          if (this.data[block][sub].length > 0) {
            firstMeshColor = this.data[block][sub][0].mesh.userData.originalColor.getHexString();
            break outerLoop;
          }
        }
        html += `
          <div class="outliner-item" data-node-type="block" data-node-id="${blockId}" data-block="${safeBlock}">
            <div class="outliner-left" onclick="Outliner.toggle('${blockId}')" ondblclick="Outliner.isolate('block', '${safeBlock}')">
              <span class="material-icons" id="icon-${blockId}">folder</span>
              <span class="outliner-label">${block}</span>
            </div>
            <div class="outliner-right">
              <input type="color" class="outliner-color-picker" value="#${firstMeshColor}" onchange="Outliner.changeColor('block', '${safeBlock}', null, this.value, event)" onclick="event.stopPropagation()">
              <span class="material-icons outliner-vis-icon vis-icon-block" data-block="${safeBlock}" onclick="Outliner.toggleVisibility('block', '${safeBlock}', null, event)">visibility</span>
            </div>
          </div>
          <div id="${blockId}" style="display:none;">`;

        for (const sub in this.data[block]) {
          const subId = blockId + '_s_' + sub.replace(/[^a-zA-Z0-9]/g, '_');
          const safeSub = encodeURIComponent(sub);
          let subMeshColor = this.data[block][sub].length > 0 ? this.data[block][sub][0].mesh.userData.originalColor.getHexString() : 'cccccc';
          html += `
            <div class="outliner-item" data-node-type="sub" data-node-id="${subId}" data-block="${safeBlock}" data-sub="${safeSub}">
              <div class="outliner-left sub" onclick="Outliner.toggle('${subId}')" ondblclick="Outliner.isolate('sub', '${safeBlock}', '${safeSub}')">
                <span class="material-icons" id="icon-${subId}">folder_open</span>
                <span class="outliner-label">${sub}</span>
              </div>
              <div class="outliner-right">
                <input type="color" class="outliner-color-picker" value="#${subMeshColor}" onchange="Outliner.changeColor('sub', '${safeBlock}', '${safeSub}', this.value, event)" onclick="event.stopPropagation()">
                <span class="material-icons outliner-vis-icon vis-icon-sub" data-block="${safeBlock}" data-sub="${safeSub}" onclick="Outliner.toggleVisibility('sub', '${safeBlock}', '${safeSub}', event)">visibility</span>
              </div>
            </div>
            <div id="${subId}" style="display:none;">`;

          this.data[block][sub].forEach((item) => {
            const meshColor = item.mesh.userData.originalColor.getHexString();
            html += `
              <div class="outliner-item part-item" data-node-type="part" data-node-id="${item.mesh.uuid}" data-mesh-uuid="${item.mesh.uuid}">
                <div class="outliner-left part" onclick="App.selectMeshByUUID('${item.mesh.uuid}')" ondblclick="Outliner.isolate('part', '${item.mesh.uuid}')">
                  <span class="material-icons">architecture</span>
                  <span class="outliner-label">${item.name}</span>
                </div>
                <div class="outliner-right">
                  <input type="color" class="outliner-color-picker color-picker-part" data-uuid="${item.mesh.uuid}" value="#${meshColor}" onchange="Outliner.changeColor('part', '${item.mesh.uuid}', null, this.value, event)" onclick="event.stopPropagation()">
                  <span class="material-icons outliner-vis-icon vis-icon-part" data-uuid="${item.mesh.uuid}" onclick="Outliner.toggleVisibility('part', '${item.mesh.uuid}', null, event)">${item.mesh.visible ? 'visibility' : 'visibility_off'}</span>
                </div>
              </div>`;
          });
          html += '</div>';
        }
        html += '</div>';
      }

      const content = document.getElementById('outliner-content');
      if (content) {
        content.innerHTML = html || '<div class="panelItem" style="justify-content:center;color:var(--panel-text);opacity:0.6;">Load a file to view assembly.</div>';
      }
      this.syncUI();
    },

    isolate(type, param1, param2) {
      const meshesToIsolate = [];
      let label = '';
      try {
        if (type === 'block') {
          const block = decodeURIComponent(param1);
          label = block;
          if (this.data[block]) {
            for (const sub in this.data[block]) {
              if (this.data[block][sub]) {
                this.data[block][sub].forEach(item => { if (item && item.mesh) meshesToIsolate.push(item.mesh); });
              }
            }
          }
        } else if (type === 'sub') {
          const block = decodeURIComponent(param1);
          const sub = decodeURIComponent(param2);
          label = sub;
          if (this.data[block] && this.data[block][sub]) {
            this.data[block][sub].forEach(item => { if (item && item.mesh) meshesToIsolate.push(item.mesh); });
          }
        } else if (type === 'part') {
          const uuid = param1;
          if (Parser && Parser.modelGroup) {
            const mesh = Parser.modelGroup.children.find(m => m.uuid === uuid);
            if (mesh) {
              meshesToIsolate.push(mesh);
              label = mesh.userData.partName || 'Part';
            }
          }
        }

        if (meshesToIsolate.length > 0) {
          App.isolateNode(type, param1, label, meshesToIsolate);
        }
      } catch (error) {
        console.warn('Isolate error:', error);
      }
    },

    toggle(id) {
      const el = document.getElementById(id);
      if (!el) return;
      const icon = document.getElementById('icon-' + id);
      if (el.style.display === 'none' || el.style.display === '') {
        el.style.display = 'block';
        if (icon) icon.innerText = icon.innerText === 'folder' ? 'folder_open' : 'folder_open';
      } else {
        el.style.display = 'none';
        if (icon) icon.innerText = icon.innerText === 'folder_open' ? 'folder' : 'folder';
      }
    },

    changeColor(type, param1, param2, colorHex, event) {
      if (event) event.stopPropagation();
      try {
        const c = new THREE.Color(colorHex);
        if (type === 'block') {
          const block = decodeURIComponent(param1);
          if (!this.data[block]) return;
          for (const sub in this.data[block]) {
            if (this.data[block][sub]) {
              this.data[block][sub].forEach((item) => {
                if (item && item.mesh) this.setMeshColor(item.mesh, c);
              });
            }
          }
        } else if (type === 'sub') {
          const block = decodeURIComponent(param1);
          const sub = decodeURIComponent(param2);
          if (this.data[block] && this.data[block][sub]) {
            this.data[block][sub].forEach((item) => {
              if (item && item.mesh) this.setMeshColor(item.mesh, c);
            });
          }
        } else if (type === 'part') {
          const uuid = param1;
          const mesh = Parser.modelGroup.children.find((m) => m.uuid === uuid);
          if (mesh) this.setMeshColor(mesh, c);
        }
        notifySceneStateChanged();
        if (App && App.updateEdgeColors) App.updateEdgeColors();
      } catch (error) {
        console.warn('Color change error:', error);
      }
    },

    setMeshColor(mesh, color) {
      mesh.userData.originalColor.copy(color);
      if (!Selection.selectedNodes.includes(mesh)) {
        mesh.material.color.copy(color);
      }
    },

    toggleVisibility(type, param1, param2, event) {
      if (event) event.stopPropagation();
      const meshesToToggle = [];
      try {
        if (type === 'block') {
          const block = decodeURIComponent(param1);
          if (!this.data[block]) return;
          for (const sub in this.data[block]) {
            if (this.data[block][sub]) {
              this.data[block][sub].forEach((item) => {
                if (item && item.mesh) meshesToToggle.push(item.mesh);
              });
            }
          }
        } else if (type === 'sub') {
          const block = decodeURIComponent(param1);
          const sub = decodeURIComponent(param2);
          if (this.data[block] && this.data[block][sub]) {
            this.data[block][sub].forEach((item) => {
              if (item && item.mesh) meshesToToggle.push(item.mesh);
            });
          }
        } else if (type === 'part') {
          const uuid = param1;
          if (Parser && Parser.modelGroup) {
            const mesh = Parser.modelGroup.children.find((m) => m.uuid === uuid);
            if (mesh) meshesToToggle.push(mesh);
          }
        }

        if (meshesToToggle.length > 0) {
          const anyVisible = meshesToToggle.some((m) => m && m.visible);
          const targetVisibility = !anyVisible;
          meshesToToggle.forEach((m) => {
            if (m) {
              m.visible = targetVisibility;
              if (m.children) {
                m.children.forEach((child) => {
                  if (child && child.name === 'edges') {
                    child.visible = targetVisibility && ViewEngine.edgesVisible;
                  }
                  if (child && child.name === 'sectionEdges') {
                    child.visible = targetVisibility && ViewEngine.sectionEdgesVisible && SectionManager.hasActiveClip();
                  }
                });
              }
            }
          });
        }

        notifySceneStateChanged();
        if (App && App.updateEdgeColors) App.updateEdgeColors();
      } catch (error) {
        console.warn('Toggle visibility error:', error);
      }
    },

    syncUI() {
      const ids = document.querySelectorAll('.vis-icon-part');
      ids.forEach((el) => {
        const uuid = el.getAttribute('data-uuid');
        const mesh = Parser.modelGroup.children.find((m) => m.uuid === uuid);
        if (mesh) el.innerText = mesh.visible ? 'visibility' : 'visibility_off';
      });

      document.querySelectorAll('.vis-icon-sub').forEach((el) => {
        const block = decodeURIComponent(el.getAttribute('data-block'));
        const sub = decodeURIComponent(el.getAttribute('data-sub'));
        const meshes = this.data[block]?.[sub] || [];
        const anyVisible = meshes.some((item) => item.mesh.visible);
        el.innerText = anyVisible ? 'visibility' : 'visibility_off';
      });

      document.querySelectorAll('.vis-icon-block').forEach((el) => {
        const block = decodeURIComponent(el.getAttribute('data-block'));
        let anyVisible = false;
        for (const sub in this.data[block] || {}) {
          if (this.data[block][sub].some((item) => item.mesh.visible)) {
            anyVisible = true;
            break;
          }
        }
        el.innerText = anyVisible ? 'visibility' : 'visibility_off';
      });

      document.querySelectorAll('.color-picker-part').forEach((el) => {
        const uuid = el.getAttribute('data-uuid');
        const mesh = Parser.modelGroup.children.find((m) => m.uuid === uuid);
        if (mesh) el.value = '#' + mesh.userData.originalColor.getHexString();
      });
    }
  };

  window.Outliner = Outliner;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Outliner.init());
  } else {
    Outliner.init();
  }
})();
