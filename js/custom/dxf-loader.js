(function () {
  'use strict';

  function getParserCtor() {
    if (typeof window !== 'undefined' && typeof window.DxfParser !== 'undefined') {
      return window.DxfParser;
    }
    return null;
  }

  function parseText(text) {
    const ctor = getParserCtor();
    if (!ctor) {
      throw new Error('DXF parser is not available.');
    }

    try {
      if (typeof ctor === 'function') {
        const parser = new ctor();
        if (typeof parser.parseSync === 'function') return parser.parseSync(text);
        if (typeof parser.parse === 'function') return parser.parse(text);
      }

      if (ctor && typeof ctor.parseSync === 'function') return ctor.parseSync(text);
      if (ctor && typeof ctor.parse === 'function') return ctor.parse(text);
    } catch (err) {
      console.warn('CustomDxfLoader: parser invocation failed.', err);
      throw err;
    }

    throw new Error('DXF parser API is unsupported.');
  }

  window.CustomDxfLoader = {
    getParserCtor,
    parseText,
    parse: parseText,
    ready: true
  };
})();
