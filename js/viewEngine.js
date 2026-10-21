(function () {
  function notifySceneStateChanged() {
    if (window && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('sceneStateChanged'));
    }
  }

  const ViewEngine = {
    edgesVisible: true,
    axesVisible: true,
    shadowsVisible: false,
    sectionEdgesVisible: true,
    sectionEdgeLineWeight: 1.0,
    sectionEdgeColor: '#000000',
    _initialized: false,

    init() {
      if (this._initialized) return;
      window.addEventListener('sceneStateChanged', () => {
        try {
          this.syncUI();
        } catch (error) {
          console.warn('ViewEngine sceneStateChanged error:', error);
        }
      });
      this._initialized = true;
      this.syncUI();
    },

    syncUI() {
      const edgesEl = document.getElementById('style-edges');
      if (edgesEl) edgesEl.classList.toggle('selected', this.edgesVisible);

      const axesEl = document.getElementById('style-axes');
      if (axesEl) axesEl.classList.toggle('selected', this.axesVisible);

      const shadowEl = document.getElementById('shadow-toggle');
      if (shadowEl) shadowEl.classList.toggle('selected', this.shadowsVisible);

      const sectionToggleEl = document.getElementById('enable-section-edge');
      if (sectionToggleEl) sectionToggleEl.checked = this.sectionEdgesVisible;

      const weightInput = document.getElementById('section-edge-weight-input');
      if (weightInput) weightInput.value = String(this.sectionEdgeLineWeight);

      const colorInput = document.getElementById('section-edge-color');
      if (colorInput) colorInput.value = this.sectionEdgeColor;
    },

    setFaceStyle(mode) {
      ['shaded', 'xray', 'wireframe'].forEach((id) => {
        const el = document.getElementById('style-' + id);
        if (el) el.classList.remove('selected');
      });

      const active = document.getElementById('style-' + mode);
      if (active) active.classList.add('selected');

      Parser.modelGroup.children.forEach((mesh) => {
        if (mode === 'wireframe') {
          mesh.material.wireframe = true;
          mesh.material.transparent = false;
        } else if (mode === 'xray') {
          mesh.material.wireframe = false;
          mesh.material.transparent = true;
          mesh.material.opacity = 0.35;
        } else {
          mesh.material.wireframe = false;
          mesh.material.transparent = false;
          mesh.material.opacity = 1;
        }
        mesh.material.needsUpdate = true;
      });
    },

    setShadingModel(isFlat) {
      const smooth = document.getElementById('shade-smooth');
      const flat = document.getElementById('shade-flat');
      if (smooth) smooth.classList.remove('selected');
      if (flat) flat.classList.remove('selected');

      const active = document.getElementById(isFlat ? 'shade-flat' : 'shade-smooth');
      if (active) active.classList.add('selected');

      Parser.modelGroup.children.forEach((mesh) => {
        mesh.material.flatShading = isFlat;
        mesh.material.needsUpdate = true;
      });
    },

    setExplode(val) {
      const factor = parseFloat(val) / 100.0;
      const explodeVal = document.getElementById('explode-val');
      if (explodeVal) explodeVal.innerText = val + '%';

      const mode = document.getElementById('explode-by').value;
      ColorManager.setExplodePartColors(mode === 'part');

      const groups = {};
      Parser.modelGroup.children.forEach((mesh) => {
        const key = mode === 'part' ? mesh.userData.partNo || mesh.uuid : mesh.userData[mode] || 'Unknown';
        if (!groups[key]) groups[key] = { meshes: [], box: new THREE.Box3() };
        groups[key].meshes.push(mesh);

        if (!mesh.userData.basePosition) mesh.userData.basePosition = mesh.position.clone();

        const tempMesh = mesh.clone();
        tempMesh.position.copy(mesh.userData.basePosition);
        tempMesh.updateMatrixWorld(true);
        const mBox = new THREE.Box3().setFromObject(tempMesh);
        groups[key].box.expandByPoint(mBox.min);
        groups[key].box.expandByPoint(mBox.max);
      });

      for (const key in groups) {
        const group = groups[key];
        const groupCenter = group.box.getCenter(new THREE.Vector3());
        let dir = groupCenter.clone().normalize();
        if (dir.lengthSq() === 0) dir.set(0, 0, 1);
        const shift = dir.multiplyScalar(factor * Parser.modelMaxDim * 0.4);

        group.meshes.forEach((m) => {
          m.position.copy(m.userData.basePosition).add(shift);
        });
      }
    },

    toggleEdges() {
      this.edgesVisible = !this.edgesVisible;
      const el = document.getElementById('style-edges');
      if (el) el.classList.toggle('selected', this.edgesVisible);

      Parser.modelGroup.children.forEach((m) => {
        m.children.forEach((child) => {
          if (child.name === 'edges') child.visible = this.edgesVisible && m.visible;
        });
      });

      if (App && App.updateEdgeColors) App.updateEdgeColors();
      notifySceneStateChanged();
    },

    toggleSectionEdgeEnabled() {
      this.sectionEdgesVisible = document.getElementById('enable-section-edge').checked;
      Parser.modelGroup.children.forEach((m) => {
        m.children.forEach((child) => {
          if (child.name === 'sectionEdges') child.visible = this.sectionEdgesVisible && SectionManager.hasActiveClip() && m.visible;
        });
      });
      notifySceneStateChanged();
    },

    updateSectionEdgeLineWeight(val) {
      const w = parseFloat(val) || 1.0;
      this.sectionEdgeLineWeight = w;
      const inp = document.getElementById('section-edge-weight-input');
      if (inp) inp.value = w;
      Parser.modelGroup.children.forEach((m) => {
        m.traverse((child) => {
          if (child.name === 'sectionEdges' && child.material) {
            child.material.linewidth = w;
            child.material.needsUpdate = true;
          }
        });
      });
      notifySceneStateChanged();
    },

    updateSectionEdgeColor() {
      const hex = document.getElementById('section-edge-color').value;
      this.sectionEdgeColor = hex;
      Parser.modelGroup.children.forEach((m) => {
        m.traverse((child) => {
          if (child.name === 'sectionEdges' && child.material) {
            child.material.color.set(hex);
          }
        });
      });
      notifySceneStateChanged();
    },

    toggleAxes() {
      this.axesVisible = !this.axesVisible;
      const el = document.getElementById('style-axes');
      if (el) el.classList.toggle('selected', this.axesVisible);
      if (Viewer.axes) Viewer.axes.visible = this.axesVisible;
      notifySceneStateChanged();
    },

    toggleShadows() {
      this.shadowsVisible = !this.shadowsVisible;
      const shadowToggle = document.getElementById('shadow-toggle');
      if (shadowToggle) shadowToggle.classList.toggle('selected', this.shadowsVisible);

      Viewer.renderer.shadowMap.enabled = this.shadowsVisible;
      if (this.shadowsVisible) {
        Viewer.scene.add(Viewer.sun);
        Viewer.scene.add(Viewer.sunTarget);
      } else {
        Viewer.scene.remove(Viewer.sun);
        Viewer.scene.remove(Viewer.sunTarget);
      }

      Parser.modelGroup.children.forEach((m) => {
        m.castShadow = this.shadowsVisible;
        m.receiveShadow = this.shadowsVisible;
      });
      notifySceneStateChanged();
    }
  };

  window.ViewEngine = ViewEngine;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ViewEngine.init());
  } else {
    ViewEngine.init();
  }
})();
