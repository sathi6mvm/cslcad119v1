(function () {
  function notifySceneStateChanged() {
    if (window && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('sceneStateChanged'));
    }
  }

  function safeLoadSettings(key, def) {
    if (typeof window !== 'undefined' && typeof window.loadSettings === 'function') {
      return window.loadSettings(key, def);
    }
    return def;
  }

  function safeSaveSettings(key, value) {
    if (typeof window !== 'undefined' && typeof window.saveSettings === 'function') {
      window.saveSettings(key, value);
    }
  }

  const ColorManager = {
    colorMaps: { Prefix: {}, Grade: {}, Thickness: {}, MidAssy: {}, SubAssy: {}, PartNumber: {} },
    currentMode: 'PartNumber',
    listVisible: true,
    explodeOverride: false,
    savedMode: null,
    _initialized: false,

    init() {
      if (this._initialized) return;
      this.currentMode = safeLoadSettings('colorMode', this.currentMode);
      window.addEventListener('sceneStateChanged', () => {
        try {
          this.renderUI();
        } catch (error) {
          console.warn('ColorManager sceneStateChanged error:', error);
        }
      });
      this._initialized = true;
      this.renderUI();
    },

    rebuild() {
      const maps = { Prefix: {}, Grade: {}, Thickness: {}, MidAssy: {}, SubAssy: {}, PartNumber: {} };
      Parser.modelGroup.children.forEach((mesh) => {
        const ud = mesh.userData;
        const catMap = {
          Prefix: ud.prefix || 'GENERIC',
          Grade: ud.grade || 'NoGrade',
          Thickness: ud.thickness || 'NoThk',
          MidAssy: ud.midAssy || 'NoMidAssy',
          SubAssy: ud.subAssy || 'NoSubAssy',
          PartNumber: ud.partNo || mesh.uuid || 'Unknown'
        };
        for (const cat in catMap) {
          const val = catMap[cat];
          if (!maps[cat][val]) maps[cat][val] = [];
          maps[cat][val].push(mesh);
        }
      });
      for (const cat in maps) {
        const items = Object.keys(maps[cat]);
        items.forEach((item) => {
          if (!this.colorMaps[cat][item]) {
            let hash = 0;
            for (let i = 0; i < item.length; i++) {
              hash = item.charCodeAt(i) + ((hash << 5) - hash);
            }
            const hue = ((hash % 360) / 360 + 0.5) % 1.0;
            const color = new THREE.Color().setHSL(hue, 0.85, 0.55);
            this.colorMaps[cat][item] = color.getHexString();
          }
        });
      }
      const select = document.getElementById('colorModeSelect');
      if (select) select.value = this.currentMode;
      if (!this.explodeOverride) {
        this.applyMode(this.currentMode);
      } else {
        this.applyPartNumberColors();
      }
      this.renderUI();
    },

    getColorForKey(key) {
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        hash = key.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue = ((hash % 360) / 360 + 0.5) % 1.0;
      return new THREE.Color().setHSL(hue, 0.8, 0.55);
    },

    applyMode(mode) {
      this.currentMode = mode;
      safeSaveSettings('colorMode', mode);
      const map = this.colorMaps[mode] || {};
      Parser.modelGroup.children.forEach((mesh) => {
        const ud = mesh.userData;
        let color;
        if (mode === 'NativeColor') {
          color = ud && ud.originalColor ? ud.originalColor.clone() : new THREE.Color(0x808080);
        } else {
          let val;
          switch (mode) {
            case 'Prefix': val = ud.prefix || 'GENERIC'; break;
            case 'Grade': val = ud.grade || 'NoGrade'; break;
            case 'Thickness': val = ud.thickness || 'NoThk'; break;
            case 'MidAssy': val = ud.midAssy || 'NoMidAssy'; break;
            case 'SubAssy': val = ud.subAssy || 'NoSubAssy'; break;
            case 'PartNumber': val = ud.partNo || 'Unknown'; break;
            default: val = 'Unknown';
          }
          const hex = map[val] || '808080';
          color = new THREE.Color('#' + hex);
        }
        if (color.getHSL({}).l < 0.15) {
          color.setHSL(color.getHSL({}).h, 0.8, 0.5);
        }
        mesh.userData.originalColor.copy(color);
        if (!Selection.selectedNodes.includes(mesh)) {
          mesh.material.color.copy(color);
        }
      });
      notifySceneStateChanged();
      if (App && App.updateEdgeColors) App.updateEdgeColors();
    },

    applyPartNumberColors() {
      this.explodeOverride = true;
      this.currentMode = 'PartNumber';
      const select = document.getElementById('colorModeSelect');
      if (select) select.value = 'PartNumber';
      Parser.modelGroup.children.forEach((mesh) => {
        const key = mesh.userData.partNo || mesh.uuid;
        const color = this.getColorForKey(key);
        mesh.userData.originalColor.copy(color);
        if (!Selection.selectedNodes.includes(mesh)) {
          mesh.material.color.copy(color);
        }
      });
      notifySceneStateChanged();
      if (App && App.updateEdgeColors) App.updateEdgeColors();
    },

    restoreMode() {
      if (this.explodeOverride) {
        this.explodeOverride = false;
        const restoreMode = this.savedMode || 'PartNumber';
        this.savedMode = null;
        this.applyMode(restoreMode);
      }
    },

    setExplodePartColors(enabled) {
      if (enabled) {
        if (!this.explodeOverride) {
          this.savedMode = this.currentMode;
        }
        this.applyPartNumberColors();
      } else {
        this.restoreMode();
      }
    },

    onModeChange() {
      const select = document.getElementById('colorModeSelect');
      this.currentMode = select.value;
      safeSaveSettings('colorMode', this.currentMode);
      this.applyMode(this.currentMode);
      this.renderUI();
    },

    renderUI() {
      const container = document.getElementById('color-mapping-list');
      if (!container) return;
      if (!this.listVisible) {
        container.innerHTML = '';
        return;
      }
      const mode = this.currentMode;
      const map = this.colorMaps[mode] || {};
      let html = '';
      const sorted = Object.keys(map).sort();
      if (sorted.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;opacity:0.6;">No items to display</div>';
        return;
      }
      sorted.forEach((item) => {
        const hex = map[item] || '808080';
        const meshes = this.getMeshesForItem(mode, item);
        const anyVisible = meshes.some((m) => m && m.visible);
        html += `
          <div class="color-row" data-mode="${mode}" data-item="${item}">
            <span class="color-label" title="${item}" onclick="ColorManager.selectItem('${mode}', '${item}')">${item}</span>
            <span class="eye-icon material-icons" onclick="ColorManager.toggleItemVisibility('${mode}', '${item}')">${anyVisible ? 'visibility' : 'visibility_off'}</span>
            <input type="color" class="color-picker-small" value="#${hex}" onchange="ColorManager.updateColor('${mode}', '${item}', this.value)" onclick="event.stopPropagation()">
          </div>
        `;
      });
      container.innerHTML = html;
    },

    getMeshesForItem(mode, item) {
      const result = [];
      if (!Parser || !Parser.modelGroup || !Parser.modelGroup.children) return result;
      Parser.modelGroup.children.forEach((mesh) => {
        if (!mesh || !mesh.userData) return;
        const ud = mesh.userData;
        let val;
        switch (mode) {
          case 'Prefix': val = ud.prefix || 'GENERIC'; break;
          case 'Grade': val = ud.grade || 'NoGrade'; break;
          case 'Thickness': val = ud.thickness || 'NoThk'; break;
          case 'MidAssy': val = ud.midAssy || 'NoMidAssy'; break;
          case 'SubAssy': val = ud.subAssy || 'NoSubAssy'; break;
          default: val = 'Unknown';
        }
        if (val === item) result.push(mesh);
      });
      return result;
    },

    toggleItemVisibility(mode, item) {
      const meshes = this.getMeshesForItem(mode, item);
      if (meshes.length === 0) return;
      const anyVisible = meshes.some((m) => m.visible);
      const target = !anyVisible;
      meshes.forEach((m) => {
        m.visible = target;
        m.children.forEach((child) => {
          if (child.name === 'edges') child.visible = target && ViewEngine.edgesVisible;
          if (child.name === 'sectionEdges') child.visible = target && ViewEngine.sectionEdgesVisible && SectionManager.hasActiveClip();
        });
      });
      notifySceneStateChanged();
      if (App && App.updateEdgeColors) App.updateEdgeColors();
      this.renderUI();
    },

    selectItem(mode, item) {
      const meshes = this.getMeshesForItem(mode, item);
      if (meshes.length === 0) return;
      Selection.clearSelection();
      meshes.forEach((m) => Selection.addNode(m));
      Camera.frameObject(meshes);
    },

    updateColor(mode, item, newHex) {
      if (newHex.startsWith('#')) newHex = newHex.substring(1);
      this.colorMaps[mode][item] = newHex;
      this.applyMode(mode);
      this.renderUI();
      notifySceneStateChanged();
      if (App && App.updateEdgeColors) App.updateEdgeColors();
    },

    toggleList() {
      this.listVisible = !this.listVisible;
      const icon = document.querySelector('.color-toggle-header .toggle-icon');
      if (icon) {
        icon.innerText = this.listVisible ? 'expand_less' : 'expand_more';
      }
      this.renderUI();
    }
  };

  window.ColorManager = ColorManager;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ColorManager.init());
  } else {
    ColorManager.init();
  }
})();
