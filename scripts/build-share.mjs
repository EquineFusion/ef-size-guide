// build-share.mjs
// Builds ONE self-contained HTML file of the test page, for sharing with colleagues
// (published as a private page on claude.ai). Output: dist/share/index.html
//
// Everything is inlined, because the shared page runs in a locked-down frame that
// only allows its own content: engine + units + widget (JS), widget.css,
// size-chart.json and the product images (as data: URIs).
//
// The real source files are not changed – this only packs them together.
// Usage: npm run build-share   (run `npm run build-data` first if the Excel file changed)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// 1. Data with images embedded as data: URIs.
const data = JSON.parse(read('data/size-chart.json'));
for (const model of data.models) {
  if (!model.image_url || /^https?:|^data:/.test(model.image_url)) continue;
  const file = path.join(root, model.image_url);
  const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
  if (type && fs.existsSync(file)) {
    model.image_url = `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
  } else {
    console.warn(`ADVARSEL: fant ikke bildet ${model.image_url} – plassholder vises.`);
    model.image_url = null;
  }
}

// 2. JS modules merged into one inline module (import lines removed, `export` dropped).
function stripModule(source) {
  return source
    .replace(/^import .*;\s*$/gm, '')
    .replace(/^export (?=(const|let|function|async function|class) )/gm, '');
}
const js = ['src/units.js', 'src/engine.js', 'src/widget.js'].map((f) => `// ---- ${f} ----\n${stripModule(read(f))}`).join('\n');

// 3. The page. (The publishing skeleton adds <!doctype>, <head> and <body> itself.)
const escapeForScript = (s) => s.replace(/<\/script/gi, '<\\/script');
const version = `data ${data.dataVersion} · built ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

const html = `<title>Equine Fusion Size Guide</title>
<meta name="robots" content="noindex">
<style>
:root {
  --page-bg: #f6f5f3;
  --page-text: #1a1a1a;
  --page-muted: #5f5b57;
  --panel: #ffffff;
  --bar: #151413;
  --bar-text: #ffffff;
  --test: #e39112;
  --chip-bg: #ffffff;
  --chip-border: #d8d4cf;
}
body {
  background: var(--page-bg);
  color: var(--page-text);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 16px;
}
.page-header {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.9rem 16px; background: var(--bar); color: var(--bar-text);
}
.brand { font-weight: 800; letter-spacing: 0.06em; font-size: 0.95rem; }
.test-badge {
  padding: 0.15rem 0.5rem; border: 1px solid var(--test); border-radius: 4px;
  color: var(--test); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em;
}
main { max-width: 800px; margin: 0 auto; padding: 20px 16px 48px; display: grid; gap: 20px; }
.tester-note { margin: 0; color: var(--page-muted); font-size: 0.95rem; line-height: 1.5; }
.examples { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.examples-label { font-size: 0.85rem; font-weight: 700; color: var(--page-muted); margin-right: 4px; }
.example {
  min-height: 40px; padding: 0 0.8rem; border: 1px solid var(--chip-border); border-radius: 999px;
  background: var(--chip-bg); color: var(--page-text); font: inherit; font-size: 0.85rem; cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.example:hover { border-color: var(--page-text); }
.example:focus-visible { outline: 3px solid #062a56; outline-offset: 2px; }
.widget-box { padding: 24px 20px; background: var(--panel); border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
details.debug { font-size: 0.85rem; color: var(--page-muted); }
details.debug summary { cursor: pointer; font-weight: 700; min-height: 44px; display: flex; align-items: center; }
details.debug pre {
  margin: 0.4rem 0 0; padding: 0.75rem; max-height: 420px; overflow: auto; background: #1e1e1e; color: #e6e6e6;
  border-radius: 8px; font-size: 0.8rem; white-space: pre-wrap; word-break: break-word;
}
.version { font-size: 0.75rem; color: var(--page-muted); }
${read('src/widget.css')}
</style>

<header class="page-header">
  <span class="brand">EQUINE FUSION</span>
  <span class="test-badge">TEST VERSION</span>
</header>

<main>
  <p class="tester-note">
    This is a test version of the new size guide. Enter a hoof length and width, or tap an example,
    and check that the recommendation makes sense. Please send your feedback to Sven Erik.
  </p>

  <div class="examples" aria-label="Example measurements">
    <span class="examples-label">Examples:</span>
    <button type="button" class="example" data-l="11.8" data-w="11.0" data-u="cm">11.8 × 11.0 cm</button>
    <button type="button" class="example" data-l="7.55" data-w="6.5" data-u="cm">7.55 × 6.5 cm</button>
    <button type="button" class="example" data-l="11.8" data-w="12.4" data-u="cm">Wide hoof 11.8 × 12.4 cm</button>
    <button type="button" class="example" data-l="14" data-w="11" data-u="cm">Narrow hoof 14 × 11 cm</button>
    <button type="button" class="example" data-l="17" data-w="15" data-u="cm">No match 17 × 15 cm</button>
    <button type="button" class="example" data-l="4 5/8" data-w="4 1/4" data-u="in">4 5/8 × 4 1/4 in</button>
  </div>

  <div class="widget-box">
    <div id="size-guide"></div>
  </div>

  <details class="debug">
    <summary>Debug (engine output)</summary>
    <pre id="debug-result">(no calculation yet)</pre>
  </details>
  <p class="version">${version}</p>
</main>

<script type="module">
${escapeForScript(js)}

// ---- test page ----
const SIZE_CHART = ${escapeForScript(JSON.stringify(data))};
const container = document.getElementById('size-guide');
const debug = document.getElementById('debug-result');

mount(container, {
  data: SIZE_CHART,
  loadCss: false,   // CSS is inlined above
  updateUrl: false, // the shared page cannot use the address bar
  share: false,     // "Copy link" would copy the frame's address, not a usable link
  onResult: (result) => { debug.textContent = JSON.stringify(result, null, 2); },
});

// Example buttons: fill in the form and calculate.
for (const button of document.querySelectorAll('.example')) {
  button.addEventListener('click', () => {
    const unitInput = container.querySelector('input[type="radio"][value="' + button.dataset.u + '"]');
    if (unitInput && !unitInput.checked) unitInput.click();
    container.querySelector('input[name="length"]').value = button.dataset.l;
    container.querySelector('input[name="width"]').value = button.dataset.w;
    container.querySelector('form').requestSubmit();
    container.querySelector('.efsg-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
</script>
`;

const outDir = path.join(root, 'dist', 'share');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log(`OK: dist/share/index.html (${Math.round(Buffer.byteLength(html) / 1024)} kB, ${version})`);
