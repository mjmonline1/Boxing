// Copyright (c) 2026 ITLR Assets. All rights reserved.
(() => {
  const THEMES = ['dark', 'light', 'boxing'];
  const LABELS = { dark: '🌙 Dark', light: '☀️ Light', boxing: '🥊 Boxing' };

  function current() {
    return localStorage.getItem('theme') || 'dark';
  }

  function apply(theme) {
    document.documentElement.dataset.theme = theme === 'dark' ? '' : theme;
    localStorage.setItem('theme', theme);
    document.querySelectorAll('.theme-btn').forEach(btn => {
      const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
      btn.textContent = LABELS[next];
      btn.title = `Switch to ${next} mode`;
    });
  }

  function cycle() {
    const idx  = THEMES.indexOf(current());
    apply(THEMES[(idx + 1) % THEMES.length]);
  }

  document.addEventListener('DOMContentLoaded', () => {
    apply(current());
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', cycle);
    });
  });
})();
