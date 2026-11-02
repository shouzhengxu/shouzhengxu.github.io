/* Private Umami dashboard; this module never adds visible page elements. */
(() => {
  'use strict';
  const websiteId = '0223cc0e-524c-4cb7-b827-04cc9ff2960b'; // Public site ID, not an access credential.
  const hostname = 'shouzhengxu.github.io';
  if (location.hostname !== hostname || !websiteId) return;
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  try {
    if (localStorage.getItem('umami.disabled') === '1') return;
  } catch { /* Analytics can work without access to browser storage. */ }

  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  const titles = {
    '/': 'Home · Shouzheng Xu',
    '/cv.html': 'CV · Shouzheng Xu',
    '/experience.html': 'Particle experience · Shouzheng Xu'
  };
  if (!titles[path]) return;

  // Keep the referring site, without sending query strings or fragments.
  let referrer = '';
  try {
    const source = new URL(document.referrer);
    if (source.protocol === 'https:' || source.protocol === 'http:') {
      referrer = source.origin === location.origin
        ? source.origin + (source.pathname === '/index.html' ? '/' : source.pathname)
        : source.origin;
    }
  } catch { /* Direct visits have no referrer. */ }

  const tracker = document.createElement('script');
  tracker.src = 'https://cloud.umami.is/script.js';
  tracker.async = true;
  tracker.dataset.websiteId = websiteId;
  tracker.dataset.domains = hostname;
  // One view per document load, unaffected by language and chapter URL updates.
  tracker.dataset.autoTrack = 'false';
  tracker.dataset.doNotTrack = 'true';
  tracker.addEventListener('load', () => {
    if (typeof window.umami?.track !== 'function') return;
    try {
      Promise.resolve(window.umami.track(props => ({
        ...props, url: path, title: titles[path], referrer
      }))).catch(() => {});
    } catch { /* A blocked analytics service must never affect the page. */ }
  }, {once:true});
  document.head.append(tracker);
})();
