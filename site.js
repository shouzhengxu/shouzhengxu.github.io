(() => {
  const root = document.documentElement;
  const languageButtons = [...document.querySelectorAll('[data-language-toggle]')];
  let language = 'en';
  try {
    const requested = new URLSearchParams(location.search).get('lang');
    language = (requested || localStorage.getItem('sx-language')) === 'zh' ? 'zh' : 'en';
  } catch { /* The English version also works when browser storage is unavailable. */ }
  const setLanguage = (lang, updateURL = true) => {
    language = lang === 'zh' ? 'zh' : 'en';
    if (languageButtons.length) root.lang = language === 'zh' ? 'zh-CN' : 'en';
    languageButtons.forEach(button => {
      button.textContent = language === 'zh' ? 'EN' : '中文';
      button.setAttribute('aria-label', language === 'zh' ? 'Switch to English' : '切换为中文');
      button.setAttribute('lang', language === 'zh' ? 'en' : 'zh-CN');
    });
    document.querySelectorAll('[data-label-en][data-label-zh]').forEach(element => {
      element.setAttribute('aria-label', element.dataset[language === 'zh' ? 'labelZh' : 'labelEn']);
    });
    document.querySelectorAll('[data-alt-en][data-alt-zh]').forEach(element => {
      element.setAttribute('alt', element.dataset[language === 'zh' ? 'altZh' : 'altEn']);
    });
    if (document.querySelector('.cv-shell')) document.title = language === 'zh' ? '个人简历 · 徐守正' : 'Curriculum Vitae · Shouzheng Xu';
    try { localStorage.setItem('sx-language', language); } catch { /* Storage is optional. */ }
    if (updateURL) {
      const url = new URL(location.href);
      url.searchParams.set('lang', language);
      history.replaceState(null, '', url);
    }
    document.querySelectorAll('a[href]').forEach(link => {
      const raw = link.getAttribute('href');
      if (!/^(index|experience|cv)\.html(?:[?#]|$)/.test(raw)) return;
      const url = new URL(raw, location.href);
      url.searchParams.set('lang', language);
      link.setAttribute('href', `${url.pathname.split('/').pop()}${url.search}${url.hash}`);
    });
    document.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: language } }));
  };
  window.SiteLanguage = { get: () => language, set: setLanguage };
  languageButtons.forEach(button => button.addEventListener('click', () => setLanguage(language === 'en' ? 'zh' : 'en')));
  setLanguage(language, false);

  const navigationLinks = [...document.querySelectorAll('nav a[href^="#"]')];
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navigationLinks.forEach(link => {
          const active = link.hash === `#${entry.target.id}`;
          link.classList.toggle('active', active);
          if (active) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-15% 0px -65% 0px' });
    navigationLinks.forEach(link => {
      const target = document.querySelector(link.hash);
      if (target) observer.observe(target);
    });
  }
  document.querySelector('[data-print]')?.addEventListener('click', () => window.print());
})();
