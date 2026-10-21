// Runtime client configuration. You can override via query string: ?apiBase=http://yourserver:3000/
(function(){
  const params = new URLSearchParams(window.location.search);
  const apiBase = params.get('apiBase') || (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/';
  // Ensure trailing slash
  window.APP_CONFIG = window.APP_CONFIG || {};
  window.APP_CONFIG.apiBase = apiBase.endsWith('/') ? apiBase : apiBase + '/';
})();
