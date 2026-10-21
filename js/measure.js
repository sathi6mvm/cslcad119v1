// =====================================================
// EDGE GIRTH MEASUREMENT
// =====================================================
class EdgeMeasurer {
  static asVector3(value) {
    if (!value) return new THREE.Vector3();
    if (value.isVector3) return value;
    if (typeof value.clone === 'function' && typeof value.x === 'number' && typeof value.y === 'number' && typeof value.z === 'number') {
      return new THREE.Vector3(value.x, value.y, value.z);
    }
    return new THREE.Vector3(value.x || 0, value.y || 0, value.z || 0);
  }

  static dist(p1, p2) {
    const a = this.asVector3(p1);
    const b = this.asVector3(p2);
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  }

  static projectOnSegment(p, a, b) {
    const pVec = this.asVector3(p);
    const aVec = this.asVector3(a);
    const bVec = this.asVector3(b);
    const ab = { x: bVec.x - aVec.x, y: bVec.y - aVec.y, z: bVec.z - aVec.z };
    const ap = { x: pVec.x - aVec.x, y: pVec.y - aVec.y, z: pVec.z - aVec.z };
    const abSq = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;

    if (abSq === 0) {
      return { point: aVec.clone(), t: 0, distance: this.dist(pVec, aVec) };
    }

    let t = (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / abSq;
    t = Math.max(0, Math.min(1, t));

    const proj = new THREE.Vector3(
      aVec.x + t * ab.x,
      aVec.y + t * ab.y,
      aVec.z + t * ab.z
    );

    return { point: proj, t, distance: this.dist(pVec, proj) };
  }

  static collectEdgeSegments(root = null) {
    const segments = [];
    const visited = new Set();

    const addFromObject = (obj) => {
      if (!obj || !obj.geometry || !obj.visible) return;
      const geo = obj.geometry;
      const posAttr = geo && geo.getAttribute ? geo.getAttribute('position') : null;
      if (!posAttr) return;

      const matrixWorld = obj.matrixWorld || new THREE.Matrix4();
      const index = geo.index || null;
      const getVert = (idx) => new THREE.Vector3().fromBufferAttribute(posAttr, idx).applyMatrix4(matrixWorld);

      const pushSegment = (startIndex, endIndex) => {
        const a = getVert(startIndex);
        const b = getVert(endIndex);
        if (!a || !b) return;
        segments.push([a, b]);
      };

      if (obj.isLineSegments) {
        const count = index ? index.count : posAttr.count;
        for (let i = 0; i < count - 1; i += 2) {
          pushSegment(index ? index.getX(i) : i, index ? index.getX(i + 1) : i + 1);
        }
        return;
      }

      if (obj.isLine || obj.isLineLoop) {
        const count = index ? index.count : posAttr.count;
        for (let i = 0; i < count - 1; i++) {
          pushSegment(index ? index.getX(i) : i, index ? index.getX(i + 1) : i + 1);
        }
        if (obj.isLineLoop && count > 0) {
          pushSegment(index ? index.getX(count - 1) : count - 1, index ? index.getX(0) : 0);
        }
      }
    };

    const targetRoot = root || (Parser && Parser.modelGroup);
    if (!targetRoot) return segments;

    if (targetRoot.traverse) {
      targetRoot.traverse((obj) => {
        if (!obj || !(obj.isLineSegments || obj.isLine || obj.isLineLoop) || !obj.geometry) return;
        const key = obj.uuid || `${obj.name || 'edge'}:${obj.geometry.uuid || Math.random()}`;
        if (visited.has(key)) return;
        visited.add(key);
        addFromObject(obj);
      });
      return segments;
    }

    if (Array.isArray(targetRoot)) {
      targetRoot.forEach((obj) => addFromObject(obj));
      return segments;
    }

    addFromObject(targetRoot);
    return segments;
  }

  static findShortestPath(hitObj, clickA, clickB) {
    const allSegments = this.collectEdgeSegments(Parser && Parser.modelGroup);
    if (!allSegments || allSegments.length === 0) return null;

    const searchRadius = Math.max(2000, clickA.distanceTo(clickB) * 2.0);
    const segments = [];

    allSegments.forEach(seg => {
      const projA = this.projectOnSegment(clickA, seg[0], seg[1]);
      const projB = this.projectOnSegment(clickB, seg[0], seg[1]);
      if (projA.distance <= searchRadius || projB.distance <= searchRadius) {
        segments.push(seg);
      }
    });

    if (segments.length === 0) return null;

    let bestA = { dist: Infinity, proj: null, segIdx: -1 };
    let bestB = { dist: Infinity, proj: null, segIdx: -1 };

    segments.forEach((seg, idx) => {
      const projA = this.projectOnSegment(clickA, seg[0], seg[1]);
      const projB = this.projectOnSegment(clickB, seg[0], seg[1]);

      if (projA.distance < bestA.dist) bestA = { dist: projA.distance, proj: projA.point, segIdx: idx };
      if (projB.distance < bestB.dist) bestB = { dist: projB.distance, proj: projB.point, segIdx: idx };
    });

    if (!bestA.proj || !bestB.proj) return null;

    const uniqueVertices = [];
    const vertexHash = new Map();
    const WELD_TOL = 0.5;

    const getVertId = (v) => {
      const vVec = this.asVector3(v);
      const qx = Math.round(vVec.x / WELD_TOL);
      const qy = Math.round(vVec.y / WELD_TOL);
      const qz = Math.round(vVec.z / WELD_TOL);
      const key = `${qx},${qy},${qz}`;

      if (vertexHash.has(key)) return vertexHash.get(key);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const neighborKey = `${qx + dx},${qy + dy},${qz + dz}`;
            if (vertexHash.has(neighborKey)) {
              const id = vertexHash.get(neighborKey);
              if (vVec.distanceTo(uniqueVertices[id]) <= WELD_TOL) return id;
            }
          }
        }
      }

      const id = uniqueVertices.length;
      uniqueVertices.push(vVec.clone());
      vertexHash.set(key, id);
      return id;
    };

    const graph = new Map();
    const addEdge = (id1, id2, dist) => {
      if (id1 === id2) return;
      if (!graph.has(id1)) graph.set(id1, new Map());
      if (!graph.has(id2)) graph.set(id2, new Map());

      const existing1 = graph.get(id1).get(id2);
      if (existing1 === undefined || dist < existing1) {
        graph.get(id1).set(id2, dist);
        graph.get(id2).set(id1, dist);
      }
    };

    const idStart = getVertId(bestA.proj);
    const idEnd = getVertId(bestB.proj);

    segments.forEach((seg, idx) => {
      const segA = this.asVector3(seg[0]);
      const segB = this.asVector3(seg[1]);
      const segLength = segA.distanceTo(segB);

      const isBestA = idx === bestA.segIdx;
      const isBestB = idx === bestB.segIdx;

      const idV1 = getVertId(segA);
      const idV2 = getVertId(segB);

      if (isBestA && isBestB) {
        addEdge(idV1, idStart, segA.distanceTo(bestA.proj));
        addEdge(idStart, idEnd, bestA.proj.distanceTo(bestB.proj));
        addEdge(idEnd, idV2, bestB.proj.distanceTo(segB));
      } else if (isBestA) {
        addEdge(idV1, idStart, segA.distanceTo(bestA.proj));
        addEdge(idStart, idV2, bestA.proj.distanceTo(segB));
      } else if (isBestB) {
        addEdge(idV1, idEnd, segA.distanceTo(bestB.proj));
        addEdge(idEnd, idV2, bestB.proj.distanceTo(segB));
      } else {
        addEdge(idV1, idV2, segLength);
      }
    });

    const JUMP_RADIUS = 3.0;
    const JUMP_PENALTY = 2.0;
    const grid = new Map();
    const getCell = (v) => `${Math.floor(v.x / JUMP_RADIUS)},${Math.floor(v.y / JUMP_RADIUS)},${Math.floor(v.z / JUMP_RADIUS)}`;

    uniqueVertices.forEach((v, id) => {
      const key = getCell(v);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push({ id, v });
    });

    uniqueVertices.forEach((v, id1) => {
      const cx = Math.floor(v.x / JUMP_RADIUS);
      const cy = Math.floor(v.y / JUMP_RADIUS);
      const cz = Math.floor(v.z / JUMP_RADIUS);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const cell = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
            if (!cell) continue;
            for (const { id: id2, v: v2 } of cell) {
              if (id1 >= id2) continue;
              const dist = v.distanceTo(v2);
              if (dist > WELD_TOL && dist <= JUMP_RADIUS) {
                addEdge(id1, id2, dist * JUMP_PENALTY);
              }
            }
          }
        }
      }
    });

    const distances = new Map();
    const previous = new Map();
    const pq = [];

    for (let i = 0; i < uniqueVertices.length; i++) {
      distances.set(i, Infinity);
      previous.set(i, null);
    }

    distances.set(idStart, 0);
    pq.push({ id: idStart, dist: 0 });

    while (pq.length > 0) {
      pq.sort((a, b) => a.dist - b.dist);
      const current = pq.shift();

      if (current.id === idEnd) break;
      if (current.dist > distances.get(current.id)) continue;

      const neighbors = graph.get(current.id);
      if (!neighbors) continue;

      for (const [neighborId, weight] of neighbors.entries()) {
        const alt = current.dist + weight;

        if (alt < distances.get(neighborId)) {
          previous.set(neighborId, current.id);
          distances.set(neighborId, alt);

          const existing = pq.find(item => item.id === neighborId);
          if (existing) {
            existing.dist = alt;
          } else {
            pq.push({ id: neighborId, dist: alt });
          }
        }
      }
    }

    const path = [];
    let curr = idEnd;

    if (curr !== idStart && previous.get(curr) === null) return null;

    while (curr !== null) {
      path.unshift(uniqueVertices[curr]);
      curr = previous.get(curr);
    }

    return path;
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.EdgeMeasurer = EdgeMeasurer;
}

// =====================================================
// MEASURE TOOL (moved from inline index.html)
// =====================================================
const MeasureTool = {
  mode: 'distance', points: [], girthPoints: [], girthDistances: [], girthChainEnabled: true, markers: [], labels: [], normals: [], edges: [], group: new THREE.Group(), snapCursor: null,
  previewLine: null, previewArc: null, previewLabel: null, lastSnapData: null,
  lastHit: null, measurementLocked: false, axisLock: 'free', angleLock: 'free', ignoreNextPointerUp: false,
  axisColors: {
    free: 0x000000, x: 0xff0000, y: 0x00ff00, z: 0x0000ff,
    lightX: 0xffaaaa, lightY: 0xaaffaa, lightZ: 0xaaaaff
  },
  
  init() {
    Viewer.scene.add(this.group);
    this.snapCursor = new THREE.Group();
    this.snapCursor.renderOrder = 1000;
    this.snapCursor.visible = false;
    const cursorMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false });
    this.cursorDefault = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), cursorMat);
    this.cursorDefault.visible = true;
    this.snapCursor.add(this.cursorDefault);
    const squareGeo = new THREE.PlaneGeometry(1.8, 1.8);
    const squareBorderPts = [
      new THREE.Vector3(-0.9, -0.9, 0), new THREE.Vector3(0.9, -0.9, 0),
      new THREE.Vector3(0.9, 0.9, 0), new THREE.Vector3(-0.9, 0.9, 0)
    ];
    this.cursorEdgeHover = new THREE.Group();
    this.cursorEdgeHover.visible = false;
    this.cursorEdgeHover.add(new THREE.Mesh(squareGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 })));
    this.cursorEdgeHover.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(squareBorderPts), new THREE.LineBasicMaterial({ color: 0x1d4ed8, depthTest: false })));
    this.snapCursor.add(this.cursorEdgeHover);
    Viewer.scene.add(this.snapCursor);

    const cssSize = 140; const dpr = window.devicePixelRatio || 1; const resSize = cssSize * dpr;
    const canvas = document.getElementById('mag-canvas');
    if (canvas) { canvas.width = resSize; canvas.height = resSize; canvas.style.width = cssSize + 'px'; canvas.style.height = cssSize + 'px'; }
    
    this.lastSnapData = null; this.lastHit = null; this.previewLine = null; this.previewLabel = null;
    this.hideReadout(); this.setupReadoutInteractions(); this.setupToolbarInteractions(); this.bindAxisSelect(); this.bindContinuousMeasureToggle();
  },

  bindAxisSelect() {
      const axisSelect = document.getElementById('measure-axis-select');
      if (axisSelect && axisSelect.dataset.bound !== 'true') {
          axisSelect.dataset.bound = 'true';
          axisSelect.addEventListener('click', () => {
              if (typeof App !== 'undefined' && App.tool !== 'measure') App.setTool('measure');
              if (axisSelect.value === this.axisLock) this.setAxisLock(this.axisLock, true);
          });
          axisSelect.addEventListener('change', () => {
              this.setAxisLock(axisSelect.value);
              this.syncContinuousMeasureToggleState();
          });
      }

      const angleSelect = document.getElementById('angle-axis-select');
      if (angleSelect && angleSelect.dataset.bound !== 'true') {
          angleSelect.dataset.bound = 'true';
          angleSelect.addEventListener('click', () => {
              if (typeof App !== 'undefined' && App.tool !== 'angle') App.setTool('angle');
              if (angleSelect.value === this.angleLock) this.setAngleMode(this.angleLock);
          });
          angleSelect.addEventListener('change', () => {
              this.setAngleMode(angleSelect.value);
              this.syncContinuousMeasureToggleState();
          });
      }
  },

  isTapeToolSelected() {
      const axisSelect = document.getElementById('measure-axis-select');
      const value = axisSelect ? axisSelect.value : this.axisLock;
      return ['free', 'x', 'y', 'z'].includes(value);
  },

  syncContinuousMeasureToggleState() {
      const toggle = document.getElementById('tPlusToggle');
      if (!toggle) return;

      const validTape = this.isTapeToolSelected();
      const toolAllowsContinuous = typeof App !== 'undefined' && App && ['measure', 'girth', 'girth-chain'].includes(App.tool);
      const shouldEnable = validTape && toolAllowsContinuous;

      toggle.disabled = !shouldEnable;
      if (!shouldEnable) {
          toggle.checked = false;
          this.girthChainEnabled = false;
          if (typeof App !== 'undefined' && App && App.tool === 'girth-chain') {
              App.setTool('girth');
          }
      } else {
          toggle.checked = !!this.girthChainEnabled;
      }
  },

  bindContinuousMeasureToggle() {
      const toggle = document.getElementById('tPlusToggle');
      if (!toggle || toggle.dataset.bound === 'true') return;
      toggle.dataset.bound = 'true';
      toggle.checked = !!this.girthChainEnabled;
      this.syncContinuousMeasureToggleState();
      
      toggle.addEventListener('change', () => {
          const validTape = this.isTapeToolSelected();
          if (!validTape) {
              toggle.checked = false;
              this.girthChainEnabled = false;
              this.syncContinuousMeasureToggleState();
              return;
          }

          const enabled = !!toggle.checked;
          this.girthChainEnabled = enabled;
          
          // Allow tool switching ONLY if using the specific Girth edge tool
          if (typeof App !== 'undefined' && App && typeof App.setTool === 'function') {
              const currentTool = App.tool;
              if (currentTool === 'girth' || currentTool === 'girth-chain') {
                  App.setTool(enabled ? 'girth-chain' : 'girth');
              }
          }

          // If mid-measurement in tape mode and we turn T+ ON, unlock it to continue
          if (enabled && this.mode === 'distance' && this.measurementLocked && this.points.length > 0) {
              this.measurementLocked = false;
          }
          
          this.updateAxisButtons();
      });
  },

  setAngleMode(axis) {
      this.angleLock = ['free', 'x', 'y', 'z', 's2s', 'l2l'].includes(axis) ? axis : 'free';
      if (typeof App !== 'undefined' && App && typeof App.setTool === 'function') {
          if (App.tool !== 'angle') App.setTool('angle');
      }
      this.updateAxisButtons();
      if (this.measurementLocked || (this.points.length > 0 && (this.angleLock === 's2s' || this.angleLock === 'l2l'))) this.clear();
  },

  setMode(m) {
      this.mode = m; this.clear(); this.points = []; this.girthPoints = []; this.girthDistances = [];
      this.clearPreviewLine(); this.hideReadout();
      
      if (m !== 'angle') this.angleLock = 'free';
      if (!['girth', 'girth-chain', 'angle'].includes(m)) this.axisLock = 'free';
      this.syncContinuousMeasureToggleState();
      this.updateAxisButtons();
      if (['distance', 'girth', 'angle'].includes(m)) this.hideReadout();
  },

  getAxisColor() { return this.axisColors[this.axisLock] || this.axisColors.free; },

  getLineColor(ptA, ptB) {
      const currentLock = this.mode === 'angle' ? this.angleLock : this.axisLock;
      if (currentLock !== 'free') return this.axisColors[currentLock] || this.axisColors.free;
      if (!ptA || !ptB) return this.axisColors.free;
      
      const diff = new THREE.Vector3().subVectors(ptB, ptA);
      const dist = diff.length();
      if (dist === 0) return this.axisColors.free;
      
      const dir = diff.clone().normalize();
      const devX = Math.sqrt(diff.y * diff.y + diff.z * diff.z);
      const devY = Math.sqrt(diff.x * diff.x + diff.z * diff.z);
      const devZ = Math.sqrt(diff.x * diff.x + diff.y * diff.y);

      if (devX <= 1.0 && Math.abs(dir.x) > 0.9) return this.axisColors.x;
      if (devY <= 1.0 && Math.abs(dir.y) > 0.9) return this.axisColors.y;
      if (devZ <= 1.0 && Math.abs(dir.z) > 0.9) return this.axisColors.z;
      if (devX <= 10.0 && Math.abs(dir.x) > 0.9) return this.axisColors.lightX;
      if (devY <= 10.0 && Math.abs(dir.y) > 0.9) return this.axisColors.lightY;
      if (devZ <= 10.0 && Math.abs(dir.z) > 0.9) return this.axisColors.lightZ;
      return this.axisColors.free;
  },

  setAxisLock(axis, force = false) {
      if (this.mode === 'girth' || this.mode === 'girth-chain') {
          if (typeof App !== 'undefined' && App && typeof App.setTool === 'function') App.setTool('measure');
      }

      const normalizedAxis = ['free', 'x', 'y', 'z'].includes(axis) ? axis : 'free';
      const axisSelect = document.getElementById('measure-axis-select');

      if (force && normalizedAxis === this.axisLock && axisSelect) {
          axisSelect.value = '';
          this.axisLock = '';
          const refreshSelection = () => {
              if (!axisSelect) return;
              this.axisLock = normalizedAxis;
              axisSelect.value = normalizedAxis;
              axisSelect.classList.toggle('active', !!normalizedAxis);
              const axisButtons = document.querySelectorAll('#measure-toolbar .measure-btn[data-axis]');
              axisButtons.forEach(btn => btn.classList.remove('active'));
              const activeButton = Array.from(document.querySelectorAll('#measure-toolbar .measure-btn')).find((btn) => btn.dataset && btn.dataset.axis === normalizedAxis);
              if (activeButton) activeButton.classList.add('active');
          };
          if (typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(refreshSelection);
          } else {
              refreshSelection();
          }
          return;
      }

      this.axisLock = normalizedAxis;
      if (axisSelect) {
          axisSelect.value = this.axisLock;
          axisSelect.classList.toggle('active', this.mode === 'distance' || this.mode === 'measure');
      }

      const axisButtons = document.querySelectorAll('#measure-toolbar .measure-btn[data-axis]');
      axisButtons.forEach(btn => btn.classList.remove('active'));
      const activeButton = Array.from(document.querySelectorAll('#measure-toolbar .measure-btn')).find((btn) => btn.dataset && btn.dataset.axis === this.axisLock);
      if (activeButton) activeButton.classList.add('active');

      // FIX: Clear the tool if it is locked OR if we are in the middle of a T+ continuous measurement
      if (this.measurementLocked || this.points.length > 0) {
          this.clear();
      }
  },

  updateAxisButtons() {
      const axisSelect = document.getElementById('measure-axis-select');
      const angleSelect = document.getElementById('angle-axis-select');
      document.querySelectorAll('#measure-toolbar .measure-btn').forEach(btn => btn.classList.remove('active'));

      if (axisSelect) {
          axisSelect.value = this.axisLock || 'free';
          // FIX: Only keep the tape tool active during distance/measure modes
          axisSelect.classList.toggle('active', this.mode === 'distance' || this.mode === 'measure');
      }
      if (angleSelect) {
          angleSelect.value = this.angleLock || 'free';
          angleSelect.classList.toggle('active', this.mode === 'angle');
      }

      const buttons = Array.from(document.querySelectorAll('#measure-toolbar .measure-btn'));
      if (this.mode === 'distance' || this.mode === 'measure') {
          const activeAxisBtn = buttons.find((btn) => btn.dataset && btn.dataset.axis === (this.axisLock || 'free'));
          if (activeAxisBtn) activeAxisBtn.classList.add('active');
      } else if (this.mode === 'girth' || this.mode === 'girth-chain') {
          // FIX: Look at the girthChainEnabled flag to highlight the correct Girth button
          const targetMode = this.girthChainEnabled ? 'girth-chain' : 'girth';
          const modeBtn = buttons.find((btn) => btn.dataset && btn.dataset.mode === targetMode);
          if (modeBtn) modeBtn.classList.add('active');
      } else if (this.mode === 'angle') {
          const angleModeBtn = document.getElementById('angle-axis-select');
          if (angleModeBtn) angleModeBtn.classList.add('active');
      }
  },

  applyAxisLock(point) {
      if (!point) return point;
      if (this.mode === 'angle' && this.points.length > 0 && this.angleLock !== 'free') {
          const locked = point.clone();
          const base = this.points[this.points.length - 1];
          if (this.angleLock === 'x') locked.x = base.x;
          if (this.angleLock === 'y') locked.y = base.y;
          if (this.angleLock === 'z') locked.z = base.z;
          return locked;
      }
      if (this.axisLock === 'free' || this.measurementLocked || this.points.length === 0 || this.mode !== 'distance') return point.clone();
      
      // FIX: Lock relative to the PREVIOUS point in the chain
      const base = this.points[this.points.length - 1].clone(); 
      const locked = point.clone();
      
      if (this.axisLock === 'x') { locked.y = base.y; locked.z = base.z; }
      else if (this.axisLock === 'y') { locked.x = base.x; locked.z = base.z; }
      else if (this.axisLock === 'z') { locked.x = base.x; locked.y = base.y; }
      return locked;
  },

  ensureReadout() {
      if (document.getElementById('measure-readout')) return;
      const panel = document.createElement('div');
      panel.id = 'measure-readout';
      panel.className = 'measure-readout hidden';
      panel.innerHTML = `
        <div class="measure-readout-header">
          <div class="measure-readout-title">
            <span class="drag-handle material-icons" style="margin-right: 4px; font-size: 16px;">drag_indicator</span>
            <span class="material-icons">straighten</span><span>Measure</span>
          </div>
          <button type="button" class="measure-readout-reset">↺</button>
        </div>
        <div class="measure-readout-content"></div>
      `;
      const resetButton = panel.querySelector('.measure-readout-reset');
      if (resetButton) {
          resetButton.addEventListener('pointerdown', e => e.stopPropagation());
          resetButton.addEventListener('click', e => { e.stopPropagation(); this.ignoreNextPointerUp = true; this.clear(); });
      }
      document.body.appendChild(panel);
      this.setupReadoutInteractions();
  },

  setupReadoutInteractions() {
      const panel = document.getElementById('measure-readout');
      if (!panel || panel.dataset.interactive) return;
      panel.dataset.interactive = "true";
      
      let isDragging = false; let startX, startY, startLeft, startTop;
      panel.addEventListener('pointerdown', (e) => {
          // ONLY trigger dragging if clicking on the drag dots
          if (!e.target.closest('.drag-handle')) return;
          
          e.stopPropagation(); isDragging = true;
          startLeft = panel.offsetLeft; startTop = panel.offsetTop; startX = e.clientX; startY = e.clientY;
          panel.style.bottom = 'auto'; panel.style.right = 'auto'; 
          panel.style.left = startLeft + 'px'; panel.style.top = startTop + 'px';
          if (e.pointerId) panel.setPointerCapture(e.pointerId);
      });
      window.addEventListener('pointermove', (e) => {
          if (isDragging) { panel.style.left = `${startLeft + (e.clientX - startX)}px`; panel.style.top = `${startTop + (e.clientY - startY)}px`; }
      });
      window.addEventListener('pointerup', (e) => {
          if (isDragging) { isDragging = false; if (e.pointerId && panel.hasPointerCapture(e.pointerId)) panel.releasePointerCapture(e.pointerId); }
      });
  },

  setupToolbarInteractions() {
      const toolbar = document.getElementById('measure-toolbar');
      if (!toolbar || toolbar.dataset.interactive) return;
      toolbar.dataset.interactive = 'true';
      
      let isDragging = false; let startX, startY, startLeft, startTop;
      toolbar.addEventListener('pointerdown', (e) => {
          // ONLY trigger dragging if clicking on the drag dots
          if (!e.target.closest('.drag-handle')) return;
          
          e.stopPropagation(); isDragging = true;
          startLeft = toolbar.offsetLeft; startTop = toolbar.offsetTop; startX = e.clientX; startY = e.clientY;
          toolbar.style.bottom = 'auto'; toolbar.style.right = 'auto';
          toolbar.style.left = startLeft + 'px'; toolbar.style.top = startTop + 'px';
          if (e.pointerId) toolbar.setPointerCapture(e.pointerId);
      });
      window.addEventListener('pointermove', (e) => {
          if (isDragging) { toolbar.style.left = `${startLeft + (e.clientX - startX)}px`; toolbar.style.top = `${startTop + (e.clientY - startY)}px`; }
      });
      window.addEventListener('pointerup', (e) => {
          if (isDragging) { isDragging = false; if (e.pointerId && toolbar.hasPointerCapture(e.pointerId)) toolbar.releasePointerCapture(e.pointerId); }
      });
  },

  showReadout() {
    this.ensureReadout();
    const p = document.getElementById('measure-readout');
    if (!p) return;
    p.classList.remove('hidden');
    p.style.display = 'block';
    p.style.position = 'absolute';
    p.style.left = 'auto';
    p.style.right = 'clamp(104px, 12vw, 180px)';
    p.style.top = '90px';
    p.style.bottom = 'auto';
  },
  hideReadout() { const p = document.getElementById('measure-readout'); if(p) { p.classList.add('hidden'); p.style.display = 'none'; } },
  toggleCollapse() {
    const readout = document.getElementById('measure-readout');
    const icon = document.getElementById('measure-collapse-icon');
    if (!readout) return;

    readout.classList.toggle('collapsed');
    const isCollapsed = readout.classList.contains('collapsed');

    if (icon) {
      icon.innerText = isCollapsed ? 'expand_more' : 'expand_less';
    }

    readout.style.position = 'absolute';
    readout.style.left = 'auto';
    readout.style.right = 'clamp(104px, 12vw, 180px)';
    readout.style.top = '90px';
    readout.style.bottom = 'auto';
  },

  updateReadout(livePoint = null) {
      this.ensureReadout();
      const content = document.querySelector('#measure-readout .measure-readout-content');
      if (!content) return;

      // FIX: Hide the readout box before the first click across all modes
      if ((this.mode === 'distance' && this.points.length === 0) || 
          (this.mode === 'girth' && this.girthPoints.length === 0) || 
          (this.mode === 'angle' && this.points.length === 0)) {
          this.hideReadout(); 
          return;
      }

      const formatPt = (pt) => {
          if (!pt) return '--';
          const wPt = pt.clone().add(Parser.globalOffset || new THREE.Vector3());
          return `X: ${wPt.x.toFixed(1)}, Y: ${wPt.y.toFixed(1)}, Z: ${wPt.z.toFixed(1)}`;
      };

      if (this.mode === 'angle' && this.angleLock === 's2s') {
          let pt1 = this.points[0] || null;
          let n1 = this.normals && this.normals[0] ? this.normals[0] : null;
          let pt2 = this.points[1] || (this.points.length === 1 && livePoint ? livePoint : null);
          let n2 = this.normals && this.normals[1] ? this.normals[1] : null;

          if (!n2 && this.points.length === 1 && this.lastHit && this.lastHit.face) {
              const normalMatrix = new THREE.Matrix3().getNormalMatrix(this.lastHit.object.matrixWorld);
              n2 = this.lastHit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
          }

          let angleVal = '--';
          if (pt1 && pt2 && n1 && n2) {
              // 1. Calculate the exact intersection line of the two planes
              const u_unnorm = new THREE.Vector3().crossVectors(n1, n2);
              const det = u_unnorm.lengthSq();
              
              if (det < 1e-6) {
                  // Planes are parallel
                  angleVal = (n1.dot(n2) > 0 ? '0.0°' : '180.0°');
              } else {
                  // 2. Find the corner vertex (V) where they intersect
                  const u = u_unnorm.clone().normalize();
                  const mid = new THREE.Vector3().addVectors(pt1, pt2).multiplyScalar(0.5);
                  const d1 = pt1.dot(n1);
                  const d2 = pt2.dot(n2);
                  const d3 = mid.dot(u_unnorm);
                  const cross23 = new THREE.Vector3().crossVectors(n2, u_unnorm);
                  const cross31 = new THREE.Vector3().crossVectors(u_unnorm, n1);
                  const V = new THREE.Vector3()
                      .addScaledVector(cross23, d1)
                      .addScaledVector(cross31, d2)
                      .addScaledVector(u_unnorm, d3)
                      .divideScalar(det);

                  // 3. Find vectors pointing from V towards your physical mouse clicks
                  let v1 = new THREE.Vector3().crossVectors(u, n1).normalize();
                  if (v1.dot(new THREE.Vector3().subVectors(pt1, V)) < 0) v1.negate();

                  let v2dir = new THREE.Vector3().crossVectors(u, n2).normalize();
                  if (v2dir.dot(new THREE.Vector3().subVectors(pt2, V)) < 0) v2dir.negate();

                  // 4. The angle between these two physical surface vectors matches the drawn arc perfectly
                  let arcRad = v1.angleTo(v2dir);
                  angleVal = THREE.MathUtils.radToDeg(arcRad).toFixed(1) + '°';
              }
          }

          content.innerHTML = `
              <div class="measure-readout-row"><span class="measure-readout-tag">S1</span><span>${formatPt(pt1)}</span></div>
              <div class="measure-readout-row"><span class="measure-readout-tag">S2</span><span>${formatPt(pt2)}</span></div>
              <div class="measure-readout-row total"><span class="measure-readout-tag" style="font-size:14px; padding-bottom:2px;">∠</span><span class="measure-readout-value">${angleVal}</span></div>
          `;
          this.showReadout();
          return;
      }

      if (this.mode === 'angle' && this.angleLock === 'l2l') {
          let pt1 = this.points[0] || null;
          let edge1 = this.edges && this.edges[0] ? this.edges[0] : null;
          let pt2 = this.points[1] || (this.points.length === 1 && livePoint ? livePoint : null);
          let edge2 = this.edges && this.edges[1] ? this.edges[1] : null;

          if (!edge2 && this.points.length === 1 && this.lastSnapData && this.lastSnapData.edgeData) {
              edge2 = this.lastSnapData.edgeData;
          }

          let angleVal = '--';
          if (pt1 && pt2 && edge1 && edge2) {
              const P1 = edge1[0], D1 = edge1[1].clone().sub(edge1[0]).normalize();
              const P2 = edge2[0], D2 = edge2[1].clone().sub(edge2[0]).normalize();
              const w0 = P1.clone().sub(P2);
              const a = D1.dot(D1); const b = D1.dot(D2); const c = D2.dot(D2);
              const d = D1.dot(w0); const e = D2.dot(w0); const denom = a * c - b * b;

              if (denom < 1e-6) {
                  angleVal = (D1.dot(D2) > 0 ? '0.0°' : '180.0°');
              } else {
                  const tc = (b * e - c * d) / denom;
                  const sc = (a * e - b * d) / denom;
                  const V = P1.clone().add(D1.clone().multiplyScalar(tc)).add(P2.clone().add(D2.clone().multiplyScalar(sc))).multiplyScalar(0.5);

                  let v1 = D1.clone(); if (v1.dot(pt1.clone().sub(V)) < 0) v1.negate();
                  let v2dir = D2.clone(); if (v2dir.dot(pt2.clone().sub(V)) < 0) v2dir.negate();

                  let arcRad = v1.angleTo(v2dir);
                  angleVal = THREE.MathUtils.radToDeg(arcRad).toFixed(1) + '°';
              }
          }

          content.innerHTML = `
              <div class="measure-readout-row"><span class="measure-readout-tag">L1</span><span>${formatPt(pt1)}</span></div>
              <div class="measure-readout-row"><span class="measure-readout-tag">L2</span><span>${formatPt(pt2)}</span></div>
              <div class="measure-readout-row total"><span class="measure-readout-tag" style="font-size:14px; padding-bottom:2px;">∠</span><span class="measure-readout-value">${angleVal}</span></div>
          `;
          this.showReadout();
          return;
      }

      if (this.mode === 'angle') {
          let ptV = this.points[0] || (livePoint ? livePoint : null);
          let ptA = this.points[1] || (this.points.length === 1 && livePoint ? livePoint : null);
          let ptB = this.points[2] || (this.points.length === 2 && livePoint ? livePoint : null);
          let angleVal = '--';
          if (ptV && ptA && ptB) {
              const v1 = new THREE.Vector3().subVectors(ptA, ptV).normalize();
              const v2 = new THREE.Vector3().subVectors(ptB, ptV).normalize();
              if (v1.lengthSq() > 0 && v2.lengthSq() > 0) angleVal = THREE.MathUtils.radToDeg(v1.angleTo(v2)).toFixed(1) + '°';
          }
          content.innerHTML = `
              <div class="measure-readout-row"><span class="measure-readout-tag">V</span><span>${formatPt(ptV)}</span></div>
              <div class="measure-readout-row"><span class="measure-readout-tag">P1</span><span>${formatPt(ptA)}</span></div>
              <div class="measure-readout-row"><span class="measure-readout-tag">P2</span><span>${formatPt(ptB)}</span></div>
              <div class="measure-readout-row total"><span class="measure-readout-tag" style="font-size:14px; padding-bottom:2px;">∠</span><span class="measure-readout-value">${angleVal}</span></div>
          `;
          this.showReadout();
          return;
      }

      let ptA = null, ptB = null, dist = null;
      if (this.mode === 'girth') {
          if (this.girthPoints.length === 1) { ptA = this.girthPoints[0]; if (livePoint) { ptB = livePoint; dist = ptA.distanceTo(ptB); } }
          else if (this.girthPoints.length >= 2) {
              ptA = this.girthPoints[0]; ptB = livePoint ? livePoint : this.girthPoints[this.girthPoints.length - 1];
              let lockedDist = this.girthDistances.reduce((a, b) => a + b, 0);
              dist = livePoint ? lockedDist + this.girthPoints[this.girthPoints.length - 1].distanceTo(livePoint) : lockedDist;
          }
      } else {
          // Standard Distance / Tape Mode
          if (this.points.length === 1) { 
              ptA = this.points[0]; 
              if (livePoint) { ptB = livePoint; dist = ptA.distanceTo(ptB); } 
          } else if (this.points.length >= 2) { 
              ptA = this.points[0]; 
              ptB = livePoint ? livePoint : this.points[this.points.length - 1];
              
              // Calculate accumulated distance for continuous tape
              let lockedDist = 0;
              for (let i = 0; i < this.points.length - 1; i++) {
                  lockedDist += this.points[i].distanceTo(this.points[i+1]);
              }
              dist = livePoint ? lockedDist + this.points[this.points.length - 1].distanceTo(livePoint) : lockedDist;
          }
      }

      const isContinuous = this.mode === 'girth' || (this.mode === 'distance' && this.girthChainEnabled);
      const hasManyPoints = (this.mode === 'girth' && this.girthPoints.length > 2) || (this.mode === 'distance' && this.points.length > 2);

      content.innerHTML = `
          <div class="measure-readout-row"><span class="measure-readout-tag">A</span><span>${formatPt(ptA)}</span></div>
          <div class="measure-readout-row"><span class="measure-readout-tag">${hasManyPoints ? 'L' : 'B'}</span><span>${formatPt(ptB)}</span></div>
          <div class="measure-readout-row total"><span class="measure-readout-tag">${isContinuous ? 'Σ' : 'C'}</span><span class="measure-readout-value">${dist !== null ? dist.toFixed(2) + ' mm' : '-- mm'}</span></div>
      `;
      this.showReadout();
  },

  getSnappedData(intersect) {
      let snapPoint = intersect.point.clone(); let isVertex = false; let isEdge = false; let snapType = 'point';
      const threshold = Math.min(Math.max(Viewer.camera.position.distanceTo(intersect.point) * 0.035, 10), 28);
      const candidates = [];

      // FIX: Now accepts p1 and p2 endpoints of the edge
      const addCandidate = (pt, type, p1 = null, p2 = null) => {
          if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) return;
          if (this.points.length > 0) { for (let i = 0; i < this.points.length; i++) if (pt.distanceTo(this.points[i]) < 0.1) return; }
          const d = intersect.point.distanceTo(pt);
          if (d <= ((type === 'vertex') ? threshold * 2.0 : threshold)) candidates.push({ p: pt.clone(), d, type, p1, p2 });
      };

      const collectFromObject = (obj) => {
          if (!obj || !obj.geometry || !obj.visible || !obj.geometry.attributes || !obj.geometry.attributes.position) return;
          const pos = obj.geometry.attributes.position; const m = obj.matrixWorld;
          if (obj.isLine || obj.isLineSegments || obj.isLineLoop) {
              for (let i = 0; i < pos.count; i += 2) {
                  const a = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m);
                  const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1).applyMatrix4(m);
                  addCandidate(a, 'vertex', a, b); addCandidate(b, 'vertex', a, b);
                  const dir = new THREE.Vector3().subVectors(b, a);
                  if (!dir.lengthSq()) continue;
                  const t = THREE.MathUtils.clamp(dir.dot(new THREE.Vector3().subVectors(intersect.point, a)) / dir.lengthSq(), 0, 1);
                  addCandidate(a.clone().add(dir.multiplyScalar(t)), 'edge', a, b);
              }
              return;
          }
          for (let i = 0; i < Math.floor(pos.count / 3); i++) {
              const a = new THREE.Vector3().fromBufferAttribute(pos, i * 3).applyMatrix4(m);
              const b = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 1).applyMatrix4(m);
              const c = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 2).applyMatrix4(m);
              addCandidate(a, 'vertex'); addCandidate(b, 'vertex'); addCandidate(c, 'vertex');
              addCandidate(new THREE.Vector3().addVectors(a, b).add(c).multiplyScalar(1 / 3), 'center');
              [[a, b], [b, c], [c, a]].forEach(([p1, p2]) => {
                  const lineDir = new THREE.Vector3().subVectors(p2, p1);
                  if (!lineDir.lengthSq()) return;
                  const t = THREE.MathUtils.clamp(lineDir.dot(new THREE.Vector3().subVectors(intersect.point, p1)) / lineDir.lengthSq(), 0, 1);
                  addCandidate(p1.clone().add(lineDir.multiplyScalar(t)), 'edge', p1, p2);
              });
          }
      };

      if (intersect.object && intersect.object.geometry) collectFromObject(intersect.object);
      if (Parser && Parser.modelGroup) Parser.modelGroup.traverse(obj => { if (obj !== intersect.object) collectFromObject(obj); });

      let edgeData = null;
      if (candidates.length) {
          const priority = { vertex: 0, edge: 1, center: 2 };
          candidates.sort((x, y) => (priority[x.type] ?? 99) - (priority[y.type] ?? 99) || x.d - y.d);
          const best = candidates[0]; snapPoint.copy(best.p); snapType = best.type; 
          if (best.type === 'vertex') isVertex = true; 
          if (best.type === 'edge') isEdge = true;
          if (best.p1 && best.p2) edgeData = [best.p1.clone(), best.p2.clone()];
      }
      return { point: snapPoint, isVertex, isEdge, snapType, edgeData };
  },

  onMove(e, isDragging, isQuickTap = false) {
      if (!Viewer || !Viewer.camera || !Parser || !Parser.modelGroup) return;
      let pointerY = e.clientY - (e.pointerType === 'touch' && !isQuickTap ? 70 : 0);
      const mouse = new THREE.Vector2((e.clientX/window.innerWidth)*2-1, -(pointerY/window.innerHeight)*2+1);
      const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(mouse, Viewer.camera);
      
      const hits = raycaster.intersectObjects(Parser.modelGroup.children, true).filter(hit => {
          if (!hit.object.visible) return false;
          if (hit.object.name === 'sectionEdges') return false;
          if (window.SectionManager && SectionManager.hasActiveClip()) {
              for (const plane of SectionManager.getActivePlanes()) if (plane.distanceToPoint(hit.point) < 0) return false;
          }
          return true;
      });
      
      let snapData = null;
      if (hits.length > 0) {
          const faceHit = hits.find(h => h.face && h.object.name !== 'edges');
          this.lastHit = faceHit || hits[0];
          snapData = this.getSnappedData(this.lastHit);
      } else if (this.points.length === 1 && this.axisLock !== 'free' && this.mode === 'distance') {
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(Viewer.camera.getWorldDirection(new THREE.Vector3()).negate(), this.points[0]);
          const pt = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(plane, pt)) {
              this.lastHit = { point: pt };
              snapData = { point: this.applyAxisLock(pt), isVertex: false, isEdge: false, snapType: 'empty' };
          }
      }

      if (snapData) {
          this.lastSnapData = snapData;

          if (this.snapCursor) {
              this.snapCursor.position.copy(snapData.point);
              const basePoint = hits[0] ? hits[0].point : snapData.point;
              const s = Viewer.camera.position.distanceTo(basePoint) * 0.005;
              this.snapCursor.scale.set(s, s, s); this.snapCursor.lookAt(Viewer.camera.position);
              const faceColor = (this.mode === 'angle' && this.angleLock !== 'free') ? this.axisColors[this.angleLock] : ((this.mode === 'distance' && this.axisLock !== 'free') ? this.axisColors[this.axisLock] : 0x000000);
              const color = snapData.isVertex ? 0x1d4ed8 : snapData.isEdge ? 0x4fc3f7 : faceColor;
              if (this.cursorDefault) this.cursorDefault.material.color.setHex(color);
              const edgeHover = !!snapData && snapData.isEdge && !snapData.isVertex;
              this.cursorDefault.visible = !edgeHover;
              this.cursorEdgeHover.visible = edgeHover;
              this.snapCursor.visible = true;
          }

          const displayPoint = this.applyAxisLock(snapData.point);
          if (this.mode === 'distance') {
              // FIX: Continue showing the preview line as long as measuring isn't locked
              if (this.points.length >= 1 && !this.measurementLocked) {
                  this.updatePreviewLine(displayPoint);
              } else if (this.points.length === 0) {
                  this.updateReadout(displayPoint);
              }
          } else if (this.mode === 'girth') {
              if (this.girthPoints.length <= 1) this.updateReadout(displayPoint);
          } else if (this.mode === 'angle') {
              if (this.points.length > 0 && !this.measurementLocked) {
                  this.updatePreviewLine(displayPoint);
                  this.updateReadout(displayPoint);
              }
          }
          
          const cursor = document.getElementById('measure-cursor');
          if (cursor) {
              cursor.style.left = e.clientX + 'px'; cursor.style.top = pointerY + 'px'; cursor.style.transform = 'translate(-50%, -50%)';
              cursor.innerHTML = '<span class="material-icons">gps_fixed</span>';
              cursor.style.display = (App && ['measure', 'angle', 'girth', 'girth-chain'].includes(App.tool)) ? 'flex' : 'none';
          }
      } else {
          this.lastHit = null; this.lastSnapData = null; if (this.snapCursor) this.snapCursor.visible = false; this.clearPreviewLine();
          if (!this.measurementLocked) this.updateReadout();
      }
  },

  createMeasurementLine(startPoint, endPoint, lineColor) {
      const distance = startPoint.distanceTo(endPoint); if (distance <= 0.001) return null;
      const distToCam = Viewer.camera.position.distanceTo(startPoint);
      const lineRadius = THREE.MathUtils.clamp(distToCam * 0.0015, 0.3, 2.0);
      const group = new THREE.Group(); group.renderOrder = 999;
      const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false); cylGeo.translate(0, 0.5, 0); cylGeo.rotateX(Math.PI / 2);
      const line = new THREE.Mesh(cylGeo, new THREE.MeshBasicMaterial({ color: lineColor, depthTest: false, transparent: true, opacity: 0.9 }));
      line.scale.set(lineRadius, lineRadius, distance); group.add(line); group.position.copy(startPoint); group.lookAt(endPoint); return group;
  },

  createAngleArc(ptV, ptA, ptB, color) {
      const v1 = new THREE.Vector3().subVectors(ptA, ptV);
      const v2 = new THREE.Vector3().subVectors(ptB, ptV);
      const len1 = v1.length();
      const len2 = v2.length();
      if (len1 < 0.001 || len2 < 0.001) return null;

      const u1 = v1.clone().normalize();
      const u2 = v2.clone().normalize();
      const angle = u1.angleTo(u2);
      if (angle < 0.001) return null;

      let normal = new THREE.Vector3().crossVectors(u1, u2).normalize();
      if (normal.lengthSq() < 0.001) {
          normal = Math.abs(u1.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
          normal.cross(u1).normalize();
      }

      const distToCam = Viewer.camera.position.distanceTo(ptV);
      const radius = Math.min(len1 * 0.25, len2 * 0.25, distToCam * 0.08);

      const segments = Math.max(12, Math.floor(angle * 15));
      const points = [];
      const vPerp = new THREE.Vector3().crossVectors(normal, u1).normalize();

      for (let i = 0; i <= segments; i++) {
          const theta = (i / segments) * angle;
          const pt = new THREE.Vector3()
              .copy(ptV)
              .addScaledVector(u1, Math.cos(theta) * radius)
              .addScaledVector(vPerp, Math.sin(theta) * radius);
          points.push(pt);
      }

      const path = new THREE.CatmullRomCurve3(points);
      const lineRadius = THREE.MathUtils.clamp(distToCam * 0.0015, 0.3, 2.0);
      const tubeGeo = new THREE.TubeGeometry(path, segments, lineRadius * 0.8, 8, false);

      const arcMesh = new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({ color: color, depthTest: false, transparent: true, opacity: 0.85 }));
      arcMesh.renderOrder = 998;
      return arcMesh;
  },

  createS2SArc(pt1, pt2, n1, n2, color) {
      const group = new THREE.Group();
      group.renderOrder = 998;

      // 1. Calculate the intersection line of the two planes
      const u_unnorm = new THREE.Vector3().crossVectors(n1, n2);
      const det = u_unnorm.lengthSq();

      // If planes are exactly parallel, just draw a line between the points
      if (det < 1e-6) {
          const line = this.createMeasurementLine(pt1, pt2, color);
          if (line) group.add(line);
          return group;
      }

      const u = u_unnorm.clone().normalize();
      const mid = new THREE.Vector3().addVectors(pt1, pt2).multiplyScalar(0.5);

      const d1 = pt1.dot(n1);
      const d2 = pt2.dot(n2);
      const d3 = mid.dot(u_unnorm);

      const cross23 = new THREE.Vector3().crossVectors(n2, u_unnorm);
      const cross31 = new THREE.Vector3().crossVectors(u_unnorm, n1);

      // 2. Find vertex 'V' on the intersection line closest to where you clicked
      const V = new THREE.Vector3()
          .addScaledVector(cross23, d1)
          .addScaledVector(cross31, d2)
          .addScaledVector(u_unnorm, d3)
          .divideScalar(det);

      // 3. Find perpendicular directions tracing outward along both planes
      let v1 = new THREE.Vector3().crossVectors(u, n1).normalize();
      if (v1.dot(new THREE.Vector3().subVectors(pt1, V)) < 0) v1.negate();

      let v2dir = new THREE.Vector3().crossVectors(u, n2).normalize();
      if (v2dir.dot(new THREE.Vector3().subVectors(pt2, V)) < 0) v2dir.negate();

      // 4. Calculate a clean length for the visual lines
      const dist1 = V.distanceTo(pt1);
      const dist2 = V.distanceTo(pt2);
      const L = Math.max(10, Math.min(dist1, dist2) * 1.2, Viewer.camera.position.distanceTo(V) * 0.2);

      const pA = V.clone().addScaledVector(v1, L);
      const pB = V.clone().addScaledVector(v2dir, L);

      // 5. Draw the lines tracing the planes and the arc connecting them
      const line1 = this.createMeasurementLine(V, pA, color);
      const line2 = this.createMeasurementLine(V, pB, color);
      if (line1) group.add(line1);
      if (line2) group.add(line2);

      const arc = this.createAngleArc(V, pA, pB, color);
      if (arc) group.add(arc);

      return group;
  },

  createL2LArc(pt1, pt2, edge1, edge2, color) {
      const group = new THREE.Group();
      group.renderOrder = 998;

      const P1 = edge1[0], D1 = edge1[1].clone().sub(edge1[0]).normalize();
      const P2 = edge2[0], D2 = edge2[1].clone().sub(edge2[0]).normalize();

      const w0 = P1.clone().sub(P2);
      const a = D1.dot(D1); const b = D1.dot(D2); const c = D2.dot(D2);
      const d = D1.dot(w0); const e = D2.dot(w0);
      const denom = a * c - b * b;

      let tc = 0, sc = 0;
      if (denom > 1e-6) {
          tc = (b * e - c * d) / denom;
          sc = (a * e - b * d) / denom;
      } else {
          const line = this.createMeasurementLine(pt1, pt2, color);
          if (line) group.add(line);
          return group;
      }

      // V is the midpoint between the two closest points on the lines
      const closest1 = P1.clone().add(D1.clone().multiplyScalar(tc));
      const closest2 = P2.clone().add(D2.clone().multiplyScalar(sc));
      const V = closest1.clone().add(closest2).multiplyScalar(0.5);

      // Connect skew lines with a cyan bridge if they don't physically touch
      if (closest1.distanceTo(closest2) > 0.5) {
          const gapLine = this.createMeasurementLine(closest1, closest2, 0x00ffff);
          if (gapLine) group.add(gapLine);
      }

      let v1 = D1.clone();
      if (v1.dot(pt1.clone().sub(V)) < 0) v1.negate();

      let v2dir = D2.clone();
      if (v2dir.dot(pt2.clone().sub(V)) < 0) v2dir.negate();

      const L = Math.max(10, Math.min(V.distanceTo(pt1), V.distanceTo(pt2)) * 1.2, Viewer.camera.position.distanceTo(V) * 0.2);
      const pA = V.clone().addScaledVector(v1, L);
      const pB = V.clone().addScaledVector(v2dir, L);

      const line1 = this.createMeasurementLine(V, pA, color);
      const line2 = this.createMeasurementLine(V, pB, color);
      if (line1) group.add(line1);
      if (line2) group.add(line2);

      const arc = this.createAngleArc(V, pA, pB, color);
      if (arc) group.add(arc);

      return group;
  },

  createVisibleEdgePathLine(pathPoints, pointA, pointB) {
      const lineColor = this.girthChainEnabled ? 0xff8c00 : 0xffffff;
      if (!pathPoints || pathPoints.length < 2) return this.createMeasurementLine(pointA, pointB, lineColor);
      const group = new THREE.Group(); group.renderOrder = 1001;
      const lineRadius = THREE.MathUtils.clamp(Viewer.camera.position.distanceTo(pointA) * 0.0015, 0.3, 2.0);
      for (let i = 0; i < pathPoints.length - 1; i++) {
          const start = EdgeMeasurer.asVector3(pathPoints[i]); const end = EdgeMeasurer.asVector3(pathPoints[i + 1]);
          const segmentLength = start.distanceTo(end); if (segmentLength <= 0.001) continue;
          const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false); cylinder.translate(0, 0.5, 0); cylinder.rotateX(Math.PI / 2);
          const mesh = new THREE.Mesh(cylinder, new THREE.MeshBasicMaterial({ color: lineColor, depthTest: false, transparent: true, opacity: 0.95 }));
          mesh.scale.set(lineRadius, lineRadius, segmentLength); mesh.position.copy(start); mesh.lookAt(end); group.add(mesh);
      }
      return group.children.length ? group : this.createMeasurementLine(pointA, pointB, lineColor);
  },

  updatePreviewLine(targetPoint) {
      if (!this.points.length) return;
      const startPoint = this.mode === 'angle' && this.points.length >= 2 ? this.points[0] : this.points[this.points.length - 1];
      const lineColor = this.getLineColor(startPoint, targetPoint);
      const distance = startPoint.distanceTo(targetPoint);
      
      // Draw standard stretchy line ONLY if not in S2S or L2L mode
      if (!(this.mode === 'angle' && (this.angleLock === 's2s' || this.angleLock === 'l2l'))) {
          if (!this.previewLine) {
              this.previewLine = new THREE.Group(); this.previewLine.renderOrder = 999;
              const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false); cylGeo.translate(0, 0.5, 0); cylGeo.rotateX(Math.PI / 2);
              const lineMesh = new THREE.Mesh(cylGeo, new THREE.MeshBasicMaterial({ depthTest: false, transparent: true, opacity: 0.9 }));
              lineMesh.name = 'line'; this.previewLine.add(lineMesh); this.group.add(this.previewLine);
          }
          this.previewLine.position.copy(startPoint);
          if (distance > 0.001) this.previewLine.lookAt(targetPoint);
          const lineMesh = this.previewLine.getObjectByName('line');
          const lineRadius = THREE.MathUtils.clamp(Viewer.camera.position.distanceTo(startPoint) * 0.0015, 0.3, 2.0);
          lineMesh.scale.set(lineRadius, lineRadius, distance);
          this.previewLine.traverse(child => { if (child.isMesh) child.material.color.setHex(lineColor); });
      } else if (this.previewLine) {
          // Hide standard yellow line in S2S / L2L mode
          this.group.remove(this.previewLine);
          this.previewLine = null;
      }

      if (this.previewArc) {
          this.group.remove(this.previewArc);
          if (this.previewArc.geometry) this.previewArc.geometry.dispose();
          this.previewArc = null;
      }
      
      // Render standard 3-point angle arc OR render mathematical S2S / L2L arc
      if (this.mode === 'angle' && (this.angleLock !== 's2s' && this.angleLock !== 'l2l') && this.points.length === 2) {
          this.previewArc = this.createAngleArc(this.points[0], this.points[1], targetPoint, lineColor);
          if (this.previewArc) this.group.add(this.previewArc);
      } else if (this.mode === 'angle' && this.angleLock === 's2s' && this.points.length === 1) {
          let n1 = this.normals[0];
          let n2 = null;
          if (this.lastHit && this.lastHit.face) {
              const normalMatrix = new THREE.Matrix3().getNormalMatrix(this.lastHit.object.matrixWorld);
              n2 = this.lastHit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
          }
          if (n1 && n2) {
              this.previewArc = this.createS2SArc(this.points[0], targetPoint, n1, n2, lineColor);
              if (this.previewArc) this.group.add(this.previewArc);
          }
      } else if (this.mode === 'angle' && this.angleLock === 'l2l' && this.points.length === 1) {
          let e1 = this.edges[0];
          let e2 = this.lastSnapData ? this.lastSnapData.edgeData : null;
          if (e1 && e2) {
              this.previewArc = this.createL2LArc(this.points[0], targetPoint, e1, e2, lineColor);
              if (this.previewArc) this.group.add(this.previewArc);
          }
      }
  },

  clearPreviewLine() {
      if (this.previewLine) {
          this.group.remove(this.previewLine);
          if (this.previewLine.isGroup) this.previewLine.traverse(child => { if (child.isMesh) child.geometry.dispose(); });
          else if (this.previewLine.geometry) this.previewLine.geometry.dispose();
          this.previewLine = null;
      }
      if (this.previewArc) {
          this.group.remove(this.previewArc);
          if (this.previewArc.geometry) this.previewArc.geometry.dispose();
          this.previewArc = null;
      }
  },

  onClick(snapData) {
    if (!snapData) return;
    snapData.point = this.applyAxisLock(snapData.point);

    // Cache the surface hit data before the automatic reset wipes it out
    const preservedHit = this.lastHit;

    // MASTER RESET: Handles clearing between measurements automatically
    if (this.measurementLocked) { 
        this.clear(); 
        this.measurementLocked = false; 
        
        // Restore the surface data so this click successfully becomes Point 1
        this.lastHit = preservedHit;
    }

    // CREATE MARKERS FOR EVERY CLICK
    const markerColor = snapData.isVertex ? 0x1d4ed8 : snapData.isEdge ? 0x4fc3f7 : this.getAxisColor();
    const baseRadius = THREE.MathUtils.clamp(Viewer.camera.position.distanceTo(snapData.point) * 0.016, 2.2, 5.4);
    const m1 = new THREE.Mesh(new THREE.SphereGeometry(baseRadius * 2.1, 20, 20), new THREE.MeshBasicMaterial({ color: markerColor, transparent: true, opacity: 0.24, depthTest: false, depthWrite: false })); m1.position.copy(snapData.point); m1.renderOrder = 998; this.group.add(m1);
    const m2 = new THREE.Mesh(new THREE.SphereGeometry(baseRadius * 1.45, 20, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false })); m2.position.copy(snapData.point); m2.renderOrder = 999; this.group.add(m2);
    const m3 = new THREE.Mesh(new THREE.SphereGeometry(baseRadius * 0.62, 20, 20), new THREE.MeshBasicMaterial({ color: markerColor, transparent: true, opacity: 1, depthTest: false, depthWrite: false })); m3.position.copy(snapData.point); m3.renderOrder = 1000; this.group.add(m3);
    this.markers.push({ marker: m3, halo: m1, ring: m2 });

    if (this.mode === 'distance') {
        this.points.push(snapData.point.clone());
        
        if (this.points.length === 1) {
            this.updateReadout();
        } else if (this.points.length >= 2) {
            const pA = this.points[this.points.length - 2];
            const pB = this.points[this.points.length - 1];
            
            // Draw the permanent line segment
            const line = this.createMeasurementLine(pA, pB, this.getLineColor(pA, pB));
            if (line) this.group.add(line);
            
            // If T+ is off, lock it so the next click clears it automatically
            if (!this.girthChainEnabled) {
                this.measurementLocked = true; 
                this.clearPreviewLine(); 
            }
            
            this.updateReadout(); 
        }
    } else if (this.mode === 'angle') {
        if (this.angleLock === 's2s') {
            if (!this.lastHit || !this.lastHit.face) {
                if (this.points.length === 0) this.clear();
                return; 
            }
            if (this.points.length === 0) {
                this.normals = [];
            }
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(this.lastHit.object.matrixWorld);
            const worldNormal = this.lastHit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
            
            this.points.push(snapData.point.clone());
            this.normals.push(worldNormal);
            
            const normalLen = Math.max(20, Viewer.camera.position.distanceTo(snapData.point) * 0.12);
            const normalLine = this.createMeasurementLine(snapData.point, snapData.point.clone().add(worldNormal.clone().multiplyScalar(normalLen)), 0xff00ff);
            if (normalLine) this.group.add(normalLine);
            
            if (this.points.length === 1) {
                this.updateReadout();
            } else if (this.points.length === 2) {
                const s2sArc = this.createS2SArc(this.points[0], this.points[1], this.normals[0], this.normals[1], 0xff9800);
                if (s2sArc) this.group.add(s2sArc);
                this.measurementLocked = true; 
                this.updateReadout(); 
                this.clearPreviewLine();
            }
        } else if (this.angleLock === 'l2l') {
            if (!snapData.edgeData) {
                if (this.points.length === 0) this.clear();
                return;
            }
            if (this.points.length === 0) {
                this.edges = [];
            }
            this.points.push(snapData.point.clone());
            this.edges.push(snapData.edgeData);
            
            const edgeLine = this.createMeasurementLine(snapData.edgeData[0], snapData.edgeData[1], 0xff00ff);
            if (edgeLine) this.group.add(edgeLine);
            
            if (this.points.length === 1) {
                this.updateReadout();
            } else if (this.points.length === 2) {
                const l2lArc = this.createL2LArc(this.points[0], this.points[1], this.edges[0], this.edges[1], 0xff9800);
                if (l2lArc) this.group.add(l2lArc);
                this.measurementLocked = true; 
                this.updateReadout(); 
                this.clearPreviewLine();
            }
        } else {
            this.points.push(snapData.point.clone());
            if (this.points.length === 1) this.updateReadout();
            else if (this.points.length === 2) {
                const line1 = this.createMeasurementLine(this.points[0], this.points[1], this.angleLock !== 'free' ? this.axisColors[this.angleLock] : 0xff9800);
                if (line1) this.group.add(line1);
                this.updateReadout();
            } else if (this.points.length === 3) {
                const lineColor = this.angleLock !== 'free' ? this.axisColors[this.angleLock] : 0xff9800;
                const line2 = this.createMeasurementLine(this.points[0], this.points[2], lineColor);
                if (line2) this.group.add(line2);
                const arc = this.createAngleArc(this.points[0], this.points[1], this.points[2], lineColor);
                if (arc) this.group.add(arc);

                this.measurementLocked = true; this.updateReadout(); this.clearPreviewLine();
            }
        }
    } else if (this.mode === 'girth') {
        this.girthPoints.push(snapData.point.clone());
        
        if (this.girthPoints.length === 1) {
            this.updateReadout();
        } else if (this.girthPoints.length >= 2) {
            const pA = this.girthPoints[this.girthPoints.length - 2];
            const pB = this.girthPoints[this.girthPoints.length - 1];
            
            const path = EdgeMeasurer.findShortestPath(this.lastHit ? this.lastHit.object : null, pA, pB);
            this.girthDistances.push(path && path.length >= 2 ? path.slice(0, -1).reduce((sum, p, i) => sum + p.distanceTo(path[i + 1]), 0) : pA.distanceTo(pB));
            const line = this.createVisibleEdgePathLine(path, pA, pB); 
            if (line) this.group.add(line);
            
            // If T+ is off, lock it so the next click clears it automatically
            if (!this.girthChainEnabled) {
                this.measurementLocked = true;
                this.clearPreviewLine();
            }
            
            this.updateReadout(); 
        }
    }
  },

  clear() { 
      this.group.clear(); this.points = []; this.girthPoints = []; this.girthDistances = []; this.markers = []; this.labels = []; this.normals = []; this.edges = [];
      this.clearPreviewLine(); this.lastSnapData = null; this.lastHit = null; this.measurementLocked = false; this.ignoreNextPointerUp = false;
      if (typeof App !== 'undefined' && App && App.touchPointerIds) App.touchPointerIds.clear();
      const panel = typeof document !== 'undefined' ? document.getElementById('measure-readout') : null;
      if (panel) {
          const content = panel.querySelector('.measure-readout-content');
          if (content) content.innerHTML = '<div class="measure-readout-row"><span class="measure-readout-tag">A</span><span>--</span></div><div class="measure-readout-row"><span class="measure-readout-tag">B</span><span>--</span></div><div class="measure-readout-row total"><span class="measure-readout-tag">C</span><span class="measure-readout-value">-- mm</span></div>';
          panel.classList.add('hidden');
          panel.style.display = 'none';
      }
      if (this.snapCursor) this.snapCursor.visible = false;
      const cursor = document.getElementById('measure-cursor'); if (cursor) cursor.style.display = 'none';
  }
};

if (typeof globalThis !== 'undefined') globalThis.MeasureTool = MeasureTool;