// Docs page chrome — not part of LookCalendar itself.
// Copy-button + syntax highlighting for code blocks live in api-docs.js (LookDocs) now, exactly
// like LookUI's own docs: a plain .demo-usage <pre> for ordinary usage snippets, the fancier
// .api-code treatment only inside the #api reference section. This file is just the small
// scrolling log box several demos use.
(function () {
  window.DocsDemo = {
    log(el, ...parts) {
      const line = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
      el.textContent = `${line}\n${el.textContent}`.split('\n').slice(0, 12).join('\n');
    },
  };
})();
