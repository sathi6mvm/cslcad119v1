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

const SectionManager = {
  cuts: {
    x: { enabled: false, reverse: false, value: 0 },
    y: { enabled: false, reverse: false, value: 0 },
    z: { enabled: false, reverse: false, value: 0 },
    c: { enabled: false, reverse: false, value: 0 }
  },
  sliderVisible: { x: false, y: false, z: false, c: false },
  _saveTimeout: null,
  _lastActiveCuts: null,

  toggleSliderVisibility(axis, show) {
    this.sliderVisible[axis] = show;
    const quick = document.getElementById(`quick-cut-${axis}`);
    if (quick) quick.checked = show;
    this.updateSliderPanel();
    this.saveToStorage();
  },

  toggleAllCuts() {
    const anyEnabled = this.cuts.x.enabled || this.cuts.y.enabled || this.cuts.z.enabled || this.cuts.c.enabled;
    const anySlider = this.sliderVisible.x || this.sliderVisible.y || this.sliderVisible.z || this.sliderVisible.c;

    if (anyEnabled || anySlider) {
      this._lastActiveCuts = {
        x: this.cuts.x.enabled, y: this.cuts.y.enabled, z: this.cuts.z.enabled, c: this.cuts.c.enabled,
        sx: this.sliderVisible.x, sy: this.sliderVisible.y, sz: this.sliderVisible.z, sc: this.sliderVisible.c
      };

      ['x', 'y', 'z', 'c'].forEach(axis => {
        this.cuts[axis].enabled = false;
        this.sliderVisible[axis] = false;
        const chk = document.getElementById(`cut-${axis}-enable`);
        if (chk) chk.checked = false;
        const quick = document.getElementById(`quick-cut-${axis}`);
        if (quick) quick.checked = false;
      });
    } else if (this._lastActiveCuts) {
      ['x', 'y', 'z', 'c'].forEach(axis => {
        this.cuts[axis].enabled = this._lastActiveCuts[axis];
        this.sliderVisible[axis] = this._lastActiveCuts['s' + axis] || this._lastActiveCuts[axis];
        const chk = document.getElementById(`cut-${axis}-enable`);
        if (chk) chk.checked = this._lastActiveCuts[axis];
        const quick = document.getElementById(`quick-cut-${axis}`);
        if (quick) quick.checked = this.sliderVisible[axis];
      });
    }

    this.apply();
    this.updateSliderPanel();
    this.saveToStorage();
  },

  hasActiveClip() {
    const cp = Viewer.clippingPlanes;
    return cp.xPos.constant < 1000000 || cp.xNeg.constant < 1000000 ||
           cp.yPos.constant < 1000000 || cp.yNeg.constant < 1000000 ||
           cp.zPos.constant < 1000000 || cp.zNeg.constant < 1000000 ||
           cp.custom.constant < 1000000;
  },

  updateRanges() {
    const bbox = Parser.bbox;
    ['x', 'y', 'z'].forEach(axis => {
      const min = Math.floor(bbox.min[axis]);
      const max = Math.ceil(bbox.max[axis]);
      const center = (min + max) / 2;

      const slider = document.getElementById(`cut-slider-${axis}`);
      const numInput = document.getElementById(`cut-${axis}-value`);
      if (slider) { slider.min = min; slider.max = max; slider.step = 0.1; }
      if (numInput) { numInput.min = min; numInput.max = max; numInput.step = 0.1; }

      const cut = this.cuts[axis];
      if (!cut.enabled || cut.value < min || cut.value > max || cut.value === 0) {
        cut.value = center;
      }

      const displayValue = Number(cut.value.toFixed(2));
      if (numInput) numInput.value = displayValue;
      if (slider) slider.value = displayValue;
    });
    this.saveToStorage();
    this.apply();
  },

  getActivePlanes() {
    return Object.values(Viewer.clippingPlanes).filter(plane => plane.constant < 1000000);
  },

  apply() {
    const cp = Viewer.clippingPlanes;
    cp.xPos.constant = Infinity; cp.xNeg.constant = Infinity;
    cp.yPos.constant = Infinity; cp.yNeg.constant = Infinity;
    cp.zPos.constant = Infinity; cp.zNeg.constant = Infinity;

    const offset = Parser.globalOffset;
    const planeMap = { x: { pos: 'xPos', neg: 'xNeg' }, y: { pos: 'yPos', neg: 'yNeg' }, z: { pos: 'zPos', neg: 'zNeg' } };

    ['x', 'y', 'z'].forEach(axis => {
      const cut = this.cuts[axis];
      if (!cut.enabled) return;
      const centeredPos = cut.value - offset[axis];
      if (cut.reverse) cp[planeMap[axis].neg].constant = -centeredPos;
      else cp[planeMap[axis].pos].constant = centeredPos;
    });

    const customCut = this.cuts.c;
    if (!customCut.enabled || !cp.custom.userData || !cp.custom.userData.baseNormal) {
      cp.custom.constant = Infinity;
    } else {
      const isRev = customCut.reverse;
      const offsetValue = customCut.value;
      if (isRev) {
        cp.custom.normal.copy(cp.custom.userData.baseNormal).negate();
        cp.custom.constant = -cp.custom.userData.baseConstant + offsetValue;
      } else {
        cp.custom.normal.copy(cp.custom.userData.baseNormal);
        cp.custom.constant = cp.custom.userData.baseConstant + offsetValue;
      }
    }

    const activePlanes = this.getActivePlanes();
    const expandedPlanes = activePlanes.map(plane => {
      const expandedPlane = plane.clone();
      expandedPlane.constant += 0.05;
      return expandedPlane;
    });
    
    const hasActiveClip = this.hasActiveClip();
    Viewer.renderer.localClippingEnabled = hasActiveClip;

    Parser.modelGroup.children.forEach(mesh => {
      if (mesh.material) {
        mesh.material.clippingPlanes = hasActiveClip ? activePlanes : [];
        mesh.material.clipShadows = false;
        mesh.material.needsUpdate = true;
      }
      mesh.children.forEach(child => {
        if (!child.material) return;
        if (child.name === 'sectionEdges') {
          child.material.clippingPlanes = hasActiveClip ? expandedPlanes : [];
        } else {
          child.material.clippingPlanes = hasActiveClip ? activePlanes : [];
        }
        child.material.clipShadows = false;
        child.material.needsUpdate = true;
      });
    });

    this.updateSectionEdges(activePlanes, hasActiveClip, expandedPlanes);
    this.updateSliderPanel();
  },

  updateSliderPanel() {
    const panel = document.getElementById('cut-slider-panel');
    const container = document.getElementById('cut-slider-rows');
    const visibleAxes = ['x', 'y', 'z', 'c'].filter(axis => this.sliderVisible[axis]);

    if (visibleAxes.length === 0) {
      panel.style.display = 'none';
      container.dataset.visAxes = '';
      return;
    }

    panel.style.display = 'block';
    const newVis = visibleAxes.join(',');
    const newEn = visibleAxes.map(a => this.cuts[a].enabled ? '1' : '0').join(',');
    const newRev = visibleAxes.map(a => this.cuts[a].reverse ? '1' : '0').join(',');

    if (container.dataset.visAxes === newVis && container.dataset.enStates === newEn && container.dataset.revStates === newRev && container.children.length > 0) {
      visibleAxes.forEach(axis => {
        const val = Number(this.cuts[axis].value.toFixed(2));
        const slider = document.getElementById(`cut-slider-${axis}`);
        const valInput = document.getElementById(`cut-slider-${axis}-val`);
        if (slider) slider.value = val;
        if (valInput) {
          if (valInput.tagName === 'INPUT') valInput.value = val;
          else valInput.innerText = val;
        }
        const sideInput = document.getElementById(`cut-${axis}-value`);
        if (sideInput) sideInput.value = val;
      });
      return;
    }

    container.dataset.visAxes = newVis;
    container.dataset.enStates = newEn;
    container.dataset.revStates = newRev;
    let html = '';
    const labels = { x: 'X', y: 'Y', z: 'Z', c: 'Multi' };

    visibleAxes.forEach(axis => {
      const val = Number(this.cuts[axis].value.toFixed(2));
      let min, max;
      if (axis === 'c') {
        const maxDim = (typeof Parser !== 'undefined' && Parser.modelMaxDim) ? Math.ceil(Parser.modelMaxDim) : 10000;
        min = -maxDim; max = maxDim;
      } else {
        min = Math.floor(Parser.bbox.min[axis]); max = Math.ceil(Parser.bbox.max[axis]);
      }
      const isRev = this.cuts[axis].reverse;
      const isEn = this.cuts[axis].enabled;
      const pickAction = axis === 'c' ? "App.setTool('section-custom')" : `App.setPickPlane('${axis}')`;

      html += `
        <div class="cut-slider-row" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; opacity: ${isEn ? '1' : '0.6'}; transition: opacity 0.2s;">
          <label style="display:flex; align-items:center; gap:4px; font-size:13px; font-weight:bold; cursor:pointer; color:var(--accent); min-width:85px;" title="Enable/Disable Cut">
            <input type="checkbox" id="cut-slider-${axis}-enable" ${isEn ? 'checked' : ''}
                   onchange="(function(cb){ document.getElementById('cut-${axis}-enable') ? document.getElementById('cut-${axis}-enable').checked = cb.checked : null; SectionManager.onEnable('${axis}'); })(this)">
            Enable ${labels[axis]}
          </label>

          <label style="display:flex; align-items:center; gap:4px; font-size:11px; cursor:pointer;" title="Reverse Cut">
            <input type="checkbox" id="cut-slider-${axis}-reverse" ${isRev ? 'checked' : ''}
                   onchange="(function(cb){ document.getElementById('cut-${axis}-reverse') ? document.getElementById('cut-${axis}-reverse').checked = cb.checked : null; SectionManager.onEnable('${axis}'); })(this)"
                   ${isEn ? '' : 'disabled'}>
            Rev
          </label>

          <input type="range" id="cut-slider-${axis}" min="${min}" max="${max}" value="${val}" step="0.1"
                 oninput="SectionManager.onSlider('${axis}', this.value)"
                 ${isEn ? '' : 'disabled'} style="flex:1; min-width:60px;">

          <input type="number" id="cut-slider-${axis}-val" value="${val}" step="1"
                 onchange="SectionManager.onValue('${axis}', this.value)"
                 ${isEn ? '' : 'disabled'}
                 style="width:65px; padding:4px; border:1px solid var(--panel-border); border-radius:4px; background:var(--input-bg); color:var(--panel-text); font-family:monospace; font-size:12px; text-align:right;">

          <button class="slider-pick-btn" id="btn-drag-pick-${axis}" onclick="${pickAction}" title="Pick Plane" style="padding:4px 6px;"><span class="material-icons" style="font-size:14px;">ads_click</span></button>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  onEnable(axis) {
    const chk = document.getElementById(`cut-slider-${axis}-enable`);
    if (chk) {
      this.cuts[axis].enabled = chk.checked;
      const sideChk = document.getElementById(`cut-${axis}-enable`);
      if (sideChk) sideChk.checked = chk.checked;
    } else {
      const sideChk = document.getElementById(`cut-${axis}-enable`);
      if (sideChk) this.cuts[axis].enabled = sideChk.checked;
    }

    const rev = document.getElementById(`cut-slider-${axis}-reverse`);
    if (rev) {
      this.cuts[axis].reverse = rev.checked;
      const sideRev = document.getElementById(`cut-${axis}-reverse`);
      if (sideRev) sideRev.checked = rev.checked;
    } else {
      const sideRev = document.getElementById(`cut-${axis}-reverse`);
      if (sideRev) this.cuts[axis].reverse = sideRev.checked;
    }

    this.apply();
    this.updateSliderPanel();
    this.saveToStorage();
  },

  onValue(axis, val) {
    let value = parseFloat(val);
    if (isNaN(value)) value = 0;
    let min, max;
    if (axis === 'c') {
      const maxDim = (typeof Parser !== 'undefined' && Parser.modelMaxDim) ? Math.ceil(Parser.modelMaxDim) : 10000;
      min = -maxDim; max = maxDim;
    } else {
      min = Math.floor(Parser.bbox.min[axis]); max = Math.ceil(Parser.bbox.max[axis]);
    }
    if (value < min) value = min; else if (value > max) value = max;
    this.cuts[axis].value = value;

    const displayValue = Number(value.toFixed(2));
    const sideInput = document.getElementById(`cut-${axis}-value`);
    if (sideInput) sideInput.value = displayValue;

    const slider = document.getElementById(`cut-slider-${axis}`);
    if (slider) slider.value = displayValue;

    const valInput = document.getElementById(`cut-slider-${axis}-val`);
    if (valInput) {
      if (valInput.tagName === 'INPUT') valInput.value = displayValue;
      else valInput.innerText = displayValue;
    }

    this.apply();
    this.saveToStorage();
  },

  onSlider(axis, val) {
    let value = parseFloat(val);
    if (isNaN(value)) value = 0;
    let min, max;
    if (axis === 'c') {
      const maxDim = (typeof Parser !== 'undefined' && Parser.modelMaxDim) ? Math.ceil(Parser.modelMaxDim) : 10000;
      min = -maxDim; max = maxDim;
    } else {
      min = Math.floor(Parser.bbox.min[axis]); max = Math.ceil(Parser.bbox.max[axis]);
    }
    if (value < min) value = min; else if (value > max) value = max;
    this.cuts[axis].value = value;

    const displayValue = Number(value.toFixed(2));
    const sideInput = document.getElementById(`cut-${axis}-value`);
    if (sideInput) sideInput.value = displayValue;

    const slider = document.getElementById(`cut-slider-${axis}`);
    if (slider) slider.value = displayValue;

    const valInput = document.getElementById(`cut-slider-${axis}-val`);
    if (valInput) {
      if (valInput.tagName === 'INPUT') valInput.value = displayValue;
      else valInput.innerText = displayValue;
    }

    this.apply();
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this.saveToStorage(), 500);
  },

  setCustomPlane(normal, point, offset = -0.1) {
    this.cuts.c.enabled = true;
    this.cuts.c.value = offset;
    this.cuts.c.reverse = false;
    this.sliderVisible.c = true;

    const cutNormal = normal.clone().negate();
    Viewer.clippingPlanes.custom.setFromNormalAndCoplanarPoint(cutNormal, point);

    Viewer.clippingPlanes.custom.userData = {
        baseNormal: Viewer.clippingPlanes.custom.normal.clone(),
        baseConstant: Viewer.clippingPlanes.custom.constant
    };

    this.apply();
    this.updateSliderPanel();
  },

  clearCustomPlane() {
    this.cuts.c.enabled = false;
    this.sliderVisible.c = false;
    Viewer.clippingPlanes.custom.constant = Infinity;
    this.apply();
    this.updateSliderPanel();
  },

  updateSectionEdges(activePlanes, hasActiveClip, expandedPlanes = activePlanes) {
    Parser.modelGroup.children.forEach(mesh => {
      mesh.updateMatrixWorld(true);
      let sectionEdges = mesh.getObjectByName('sectionEdges');
      if (!sectionEdges) {
        sectionEdges = new THREE.LineSegments(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ 
            color: 0x000000, 
            linewidth: (typeof ViewEngine !== 'undefined' && ViewEngine.sectionEdgeLineWeight) ? ViewEngine.sectionEdgeLineWeight : (Viewer.thickLineWeight || 1), 
            transparent: true, 
            opacity: 1,
            clippingPlanes: hasActiveClip ? expandedPlanes : []
          })
        );
        sectionEdges.name = 'sectionEdges';
        sectionEdges.visible = false;
        mesh.add(sectionEdges);
      }

      if (sectionEdges.material) {
        sectionEdges.material.clippingPlanes = hasActiveClip ? expandedPlanes : [];
        sectionEdges.material.needsUpdate = true;
      }

      if (!hasActiveClip) {
        sectionEdges.visible = false;
        sectionEdges.geometry.dispose();
        sectionEdges.geometry = new THREE.BufferGeometry();
        return;
      }

      const positions = this.buildSectionEdgePositions(mesh, activePlanes);
      if (positions.length === 0) {
        sectionEdges.visible = false;
        sectionEdges.geometry.dispose();
        sectionEdges.geometry = new THREE.BufferGeometry();
        return;
      }

      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      edgeGeometry.computeBoundingSphere();
      sectionEdges.geometry.dispose();
      sectionEdges.geometry = edgeGeometry;
      sectionEdges.visible = true;
    });
  },

  buildSectionEdgePositions(mesh, activePlanes) {
    const geometry = mesh.geometry;
    if (!geometry || !geometry.attributes.position) return [];
    const position = geometry.attributes.position;
    const index = geometry.index;
    const points = [];
    const worldA = new THREE.Vector3();
    const worldB = new THREE.Vector3();
    const worldC = new THREE.Vector3();
    const localA = new THREE.Vector3();
    const localB = new THREE.Vector3();
    const localC = new THREE.Vector3();

    const edgeIntersection = (p1, d1, p2, d2) => {
      const t = d1 / (d1 - d2);
      return p1.clone().lerp(p2, t);
    };

    const addSegment = (a, b) => {
      points.push(a.x, a.y, a.z, b.x, b.y, b.z);
    };

    const addUnique = (existing, candidate) => {
      for (let i = 0; i < existing.length; i += 3) {
        if (existing[i] === candidate.x && existing[i + 1] === candidate.y && existing[i + 2] === candidate.z) return false;
      }
      existing.push(candidate.x, candidate.y, candidate.z);
      return true;
    };

    const processPlane = (plane, a, b, c) => {
      const dA = plane.distanceToPoint(a);
      const dB = plane.distanceToPoint(b);
      const dC = plane.distanceToPoint(c);
      
      // FIX: If the entire triangle is perfectly coplanar with the cutting plane,
      // skip it. This prevents the "spiderweb" of internal diagonal triangulation lines.
      if (Math.abs(dA) < 1e-5 && Math.abs(dB) < 1e-5 && Math.abs(dC) < 1e-5) {
          return; 
      }

      const found = [];

      if (Math.abs(dA) < 1e-6) addUnique(found, a.clone());
      if (Math.abs(dB) < 1e-6) addUnique(found, b.clone());
      if (Math.abs(dC) < 1e-6) addUnique(found, c.clone());
      if (dA * dB < 0) addUnique(found, edgeIntersection(a, dA, b, dB));
      if (dB * dC < 0) addUnique(found, edgeIntersection(b, dB, c, dC));
      if (dC * dA < 0) addUnique(found, edgeIntersection(c, dC, a, dA));

      if (found.length === 6) {
        addSegment(new THREE.Vector3(found[0], found[1], found[2]), new THREE.Vector3(found[3], found[4], found[5]));
      } else if (found.length === 9) {
        const p0 = new THREE.Vector3(found[0], found[1], found[2]);
        const p1 = new THREE.Vector3(found[3], found[4], found[5]);
        const p2 = new THREE.Vector3(found[6], found[7], found[8]);
        addSegment(p0, p1);
        addSegment(p1, p2);
      }
    };

    const meshMatrix = mesh.matrixWorld;

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        localA.fromBufferAttribute(position, index.getX(i));
        localB.fromBufferAttribute(position, index.getX(i + 1));
        localC.fromBufferAttribute(position, index.getX(i + 2));
        worldA.copy(localA).applyMatrix4(meshMatrix);
        worldB.copy(localB).applyMatrix4(meshMatrix);
        worldC.copy(localC).applyMatrix4(meshMatrix);
        activePlanes.forEach(plane => processPlane(plane, worldA, worldB, worldC));
      }
    } else {
      for (let i = 0; i < position.count; i += 3) {
        localA.fromBufferAttribute(position, i);
        localB.fromBufferAttribute(position, i + 1);
        localC.fromBufferAttribute(position, i + 2);
        worldA.copy(localA).applyMatrix4(meshMatrix);
        worldB.copy(localB).applyMatrix4(meshMatrix);
        worldC.copy(localC).applyMatrix4(meshMatrix);
        activePlanes.forEach(plane => processPlane(plane, worldA, worldB, worldC));
      }
    }

    return points;
  },

  saveToStorage() {
    safeSaveSettings('sectionCuts', this.cuts);
    safeSaveSettings('sectionSlidersVisible', this.sliderVisible);
  },

  loadFromStorage() {
    this.sliderVisible = safeLoadSettings('sectionSlidersVisible', { x: false, y: false, z: false, c: false });
    
    // Auto-disable arbitrary plane picks on load since models can change
    this.cuts.c.enabled = false;
    this.sliderVisible.c = false;

    ['x', 'y', 'z'].forEach(axis => {
      const quick = document.getElementById(`quick-cut-${axis}`);
      if (quick) quick.checked = this.sliderVisible[axis];
    });

    const saved = safeLoadSettings('sectionCuts', null);
    if (saved) {
      for (let axis in saved) {
        if (this.cuts[axis] && axis !== 'c') {
          this.cuts[axis].enabled = saved[axis].enabled || false;
          this.cuts[axis].reverse = saved[axis].reverse || false;
        }
      }
      ['x', 'y', 'z'].forEach(axis => {
        const isEnabled = this.cuts[axis].enabled;
        const sideEnable = document.getElementById(`cut-${axis}-enable`);
        if (sideEnable) sideEnable.checked = isEnabled;
        const sideRev = document.getElementById(`cut-${axis}-reverse`);
        if (sideRev) sideRev.checked = this.cuts[axis].reverse;
      });

      this.apply();
      this.updateSliderPanel();
    }
  }
};

window.SectionManager = SectionManager;
