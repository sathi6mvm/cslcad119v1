(function () {
  'use strict';

  function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function asArray(value) {
    if (value === null || typeof value === 'undefined') return [];
    return Array.isArray(value) ? value : [value];
  }

  function collectPointList(entity) {
    const groups = new Map();

    Object.keys(entity || {}).forEach((key) => {
      const code = Number(key);
      if (!Number.isInteger(code) || code < 10 || code > 39) return;
      const axis = code >= 10 && code < 20 ? 'x' : code >= 20 && code < 30 ? 'y' : code >= 30 && code < 40 ? 'z' : null;
      if (!axis) return;
      const pointIndex = code % 10;
      const current = groups.get(pointIndex) || { x: [], y: [], z: [] };
      current[axis].push(entity[key]);
      groups.set(pointIndex, current);
    });

    const items = [];
    const maxCount = Math.max(...Array.from(groups.keys(), Number), 0);
    for (let i = 0; i <= maxCount; i++) {
      const group = groups.get(i) || { x: [], y: [], z: [] };
      const xs = asArray(group.x[0] !== undefined ? group.x : [group.x]);
      const ys = asArray(group.y[0] !== undefined ? group.y : [group.y]);
      const zs = asArray(group.z[0] !== undefined ? group.z : [group.z]);
      const x = toNumber(xs[0] ?? 0, 0);
      const y = toNumber(ys[0] ?? 0, 0);
      const z = toNumber(zs[0] ?? 0, 0);
      items.push({ x, y, z });
    }

    return items.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  }

  function parseText(text) {
    const raw = String(text || '');
    const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const allEntities = [];
    const blocks = {};
    let current = null;
    let currentBlock = null;

    const flushEntity = () => {
      if (!current || !current.type) return;
      const entity = { ...current };
      const type = String(entity.type || '').trim();

      if (type === 'LINE') {
        const points = collectPointList(entity);
        if (points.length >= 2) {
          entity.vertices = points;
        }
      }

      if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
        const points = collectPointList(entity);
        if (points.length) entity.vertices = points;
      }

      if (type === 'CIRCLE') {
        entity.center = { x: toNumber(entity['10'], 0), y: toNumber(entity['20'], 0), z: toNumber(entity['30'], 0) };
        entity.radius = toNumber(entity['40'], 0);
      }

      if (type === 'ARC') {
        entity.center = { x: toNumber(entity['10'], 0), y: toNumber(entity['20'], 0), z: toNumber(entity['30'], 0) };
        entity.radius = toNumber(entity['40'], 0);
        entity.startAngle = toNumber(entity['50'], 0);
        entity.endAngle = toNumber(entity['51'], 0);
      }

      if (type === 'TEXT' || type === 'MTEXT') {
        entity.text = entity['1'] || entity.text || '';
        entity.position = { x: toNumber(entity['10'], 0), y: toNumber(entity['20'], 0), z: toNumber(entity['30'], 0) };
      }

      if (currentBlock) {
        currentBlock.entities.push(entity);
      } else {
        allEntities.push(entity);
      }

      current = null;
    };

    for (let i = 0; i < lines.length; i += 2) {
      const code = String(lines[i] || '').trim();
      const rawValue = i + 1 < lines.length ? lines[i + 1] : '';
      const value = String(rawValue || '').trim();

      if (code === '0') {
        if (current && current.type) {
          flushEntity();
        }

        const typeName = value.trim();
        if (typeName === 'BLOCK') {
          currentBlock = { name: '', entities: [] };
          current = { type: 'BLOCK' };
          continue;
        }

        if (typeName === 'ENDBLK') {
          if (currentBlock && currentBlock.name) {
            blocks[currentBlock.name] = currentBlock;
          }
          currentBlock = null;
          current = null;
          continue;
        }

        if (typeName && typeName !== 'ENDSEC' && typeName !== 'EOF') {
          current = { type: typeName };
        } else if (typeName === 'EOF' || typeName === 'ENDSEC') {
          current = { type: typeName };
          flushEntity();
          current = null;
        }
        continue;
      }

      if (!current && code === '2' && currentBlock && !currentBlock.name) {
        currentBlock.name = value;
        continue;
      }

      if (!current) {
        continue;
      }

      if (code === '2' && current.type === 'BLOCK' && currentBlock) {
        currentBlock.name = value;
      }

      const key = String(code);
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        const previous = current[key];
        current[key] = Array.isArray(previous) ? previous.concat(value) : [previous, value];
      } else {
        current[key] = value;
      }
    }

    if (current && current.type) {
      flushEntity();
    }

    if (currentBlock && currentBlock.name) {
      blocks[currentBlock.name] = currentBlock;
    }

    return { entities: allEntities, blocks, header: {} };
  }

  class DxfParser {
    parseSync(text) {
      return parseText(text);
    }

    parse(text) {
      return parseText(text);
    }
  }

  const api = {
    DxfParser,
    parseSync: parseText,
    parse: parseText,
    parseText,
  };

  window.DxfParser = DxfParser;
  window.CustomDxfParser = api;
})();
