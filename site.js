(() => {
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
