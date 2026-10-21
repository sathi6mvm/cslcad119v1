(function (global) {
  const DEFAULT_DETAIL_SETTINGS = {
    fileSource: true,
    partName: true,
    partNo: false,
    thickness: false,
    grade: false,
    dimensions: true,
    weight: true,
  };

  const DETAIL_FIELDS = [
    { key: 'fileSource', label: 'File' },
    { key: 'partName', label: 'Name' },
    { key: 'partNo', label: 'Part No' },
    { key: 'thickness', label: 'Thickness' },
    { key: 'grade', label: 'Grade' },
    { key: 'dimensions', label: 'Bounding Box' },
    { key: 'weight', label: 'Weight' },
  ];

  function stripFileExtension(name) {
    if (typeof name !== 'string') return '';
    const trimmed = name.trim();
    return trimmed.replace(/\.[^/.\\]+$/, '');
  }

  function normalizeDetailSettings(input = {}) {
    const settings = { ...DEFAULT_DETAIL_SETTINGS };
    for (const field of DETAIL_FIELDS) {
      if (typeof input[field.key] === 'boolean') {
        settings[field.key] = input[field.key];
      }
    }
    return settings;
  }

  function getEnabledDetailEntries(mesh, metrics = {}, settings = DEFAULT_DETAIL_SETTINGS) {
    const currentSettings = normalizeDetailSettings(settings);
    const data = mesh && mesh.userData ? mesh.userData : {};
    const entries = [];

    if (currentSettings.fileSource && data.fileSource) {
      entries.push(stripFileExtension(data.fileSource));
    }

    if (currentSettings.partName && data.partName) {
      entries.push(data.partName);
    }

    if (currentSettings.partNo && data.partNo) {
      entries.push('No: ' + data.partNo);
    }

    if (currentSettings.thickness && data.thickness) {
      entries.push(String(data.thickness) + 'mm');
    }

    if (currentSettings.grade && data.grade) {
      entries.push(data.grade);
    }

    if (currentSettings.dimensions) {
      const L = Number(metrics.L);
      const B = Number(metrics.B);
      const H = Number(metrics.H);
      if (Number.isFinite(L) && Number.isFinite(B) && Number.isFinite(H)) {
        entries.push(`Bounding ${L.toFixed(0)}×${B.toFixed(0)}×${H.toFixed(0)} mm`);
      }
    }

    if (currentSettings.weight && metrics.weightDisplay) {
      entries.push(metrics.weightDisplay);
    }

    return entries;
  }

  const api = {
    DEFAULT_DETAIL_SETTINGS,
    DETAIL_FIELDS,
    normalizeDetailSettings,
    getEnabledDetailEntries,
  };

  global.EntityDetailConfig = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
