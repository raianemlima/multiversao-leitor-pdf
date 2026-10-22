import { createState, pageAnnotations, COLORS } from './schema.js';

const $ = id => document.getElementById(id);
const state = createState();
const svgNS = 'http://www.w3.org/2000/svg';
const stage = $('page-stage');
const layer = $('annotation-layer');
const workspace = $('workspace');
const canvas = $('pdf-canvas');
let pdfModule;
let resourcePromise;
let documentEpoch = 0;
let renderEpoch = 0;
let renderTask;
let pageRatio = 1.414;
let uid = 0;
let gesture = null;
let noteDraft = null;
let activeNoteId = null;
let confirmationAction = null;
let resizeTimer;

const hints = {
  read: 'Role para ler. Toque nos marcadores para reler as notas.',
  highlight: 'Arraste um retângulo sobre o trecho que deseja grifar.',
  pen: 'Escreva na página com o dedo, mouse ou caneta.',
  note: 'Toque no ponto da página onde deseja adicionar uma nota.',
  eraser: 'Toque em um grifo, traço ou marcador para apagar.'
};

const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const nextId = () => `mark-${++uid}`;
const hasAnnotations = () => [...state.pages.values()].some(p => p.items.length > 0);
const toBytes = base64 => Uint8Array.from(atob(base64), char => char.charCodeAt(0));

function initIcons() {
  window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });
}

function showError(message) {
  $('error-message').textContent = message;
  $('error-banner').hidden = false;
}

function clearError() {
  $('error-banner').hidden = true;
}

function showConfirmation(title, message, label, action) {
  $('confirm-title').textContent = title;
  $('confirm-message').textContent = message;
  $('confirm-accept').textContent = label;
  confirmationAction = action;
  $('confirm-dialog').showModal();
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function engine() {
  if (!pdfModule) {
    pdfModule = import('./vendor/pdf.min.mjs').then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
      return pdfjs;
    });
  }
  return pdfModule;
}

async function resource(name) {
  resourcePromise ??= import('./vendor/pdf-resources.js').then(m => m.default);
  const map = await resourcePromise;
  if (!map[name]) throw new Error(`Recurso de fonte não disponível: ${name}`);
  return toBytes(map[name]);
}

class LocalStandardFontDataFactory {
  async fetch({ filename }) { return resource(filename); }
}

class LocalCMapReaderFactory {
  async fetch({ name }) { return { cMapData: await resource(`${name}.bcmap`), compressionType: 1 }; }
}

function setMode(mode) {
  state.mode = mode;
  state.draft = null;
  gesture = null;
  $('note-bubble').hidden = true;
  layer.dataset.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(button => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('mode-hint').querySelector('span').textContent = hints[mode];
  redrawAnnotations();
}

function setColor(color) {
  state.color = color;
  document.querySelectorAll('[data-color]').forEach(button => {
    const selected = button.dataset.color === color;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function updateControls() {
  const loaded = !!state.document;
  $('toolbar').hidden = !loaded;
  $('reader-controls').hidden = !loaded;
  document.body.classList.toggle('has-document', loaded);
  $('page-number').value = state.page;
  $('page-number').max = state.document?.numPages ?? 1;
  $('page-total').textContent = state.document?.numPages ?? 0;
  $('prev-page').disabled = !loaded || state.page <= 1 || state.rendering;
  $('next-page').disabled = !loaded || state.page >= state.document.numPages || state.rendering;
  $('page-number').disabled = state.rendering;
  $('zoom-out').disabled = state.zoom <= .6 || state.rendering;
  $('zoom-in').disabled = state.zoom >= 2.4 || state.rendering;
  $('zoom-value').textContent = `${Math.round(state.zoom * 100)}%`;
  if (loaded) {
    const marks = pageAnnotations(state);
    $('undo-button').disabled = !marks.undo.length || state.rendering;
    $('redo-button').disabled = !marks.redo.length || state.rendering;
    $('clear-button').disabled = !marks.items.length || state.rendering;
  }
}

function mutateAnnotations(change) {
  const page = pageAnnotations(state);
  const previous = clone(page.items);
  const next = change(clone(page.items));
  if (JSON.stringify(previous) === JSON.stringify(next)) return;
  page.undo.push(previous);
  if (page.undo.length > 100) page.undo.shift();
  page.items = next;
  page.redo = [];
  redrawAnnotations();
  updateControls();
}

function history(direction) {
  const page = pageAnnotations(state);
  const source = page[direction];
  if (!source.length) return;
  const target = direction === 'undo' ? page.redo : page.undo;
  target.push(clone(page.items));
  page.items = source.pop();
  $('note-bubble').hidden = true;
  redrawAnnotations();
  updateControls();
}

function svgElement(name, attributes, text) {
  const node = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderMark(mark, draft = false, noteNumber = 1) {
  const attr = { 'data-annotation-id': mark.id, 'data-testid': `annotation-${mark.type}` };
  const color = COLORS[mark.color] ?? COLORS.yellow;
  let element;
  if (mark.type === 'highlight') {
    element = svgElement('rect', {
      ...attr, class: 'highlight-mark', x: mark.x * 1000, y: mark.y * 1000 * pageRatio,
      width: mark.w * 1000, height: mark.h * 1000 * pageRatio,
      fill: color.highlight, opacity: draft ? .35 : .45, rx: 1.5
    });
  } else if (mark.type === 'pen') {
    const points = mark.points.map(p => `${p.x * 1000},${p.y * 1000 * pageRatio}`).join(' ');
    element = svgElement('polyline', {
      ...attr, points, fill: 'none', stroke: color.ink,
      'stroke-width': mark.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
  } else if (mark.type === 'note') {
    const x = mark.x * 1000;
    const y = mark.y * 1000 * pageRatio;
    element = svgElement('g', {
      ...attr, class: 'note-marker', transform: `translate(${x},${y})`,
      role: 'button', tabindex: '0', 'aria-label': `Nota ${noteNumber}: ${mark.text}`
    });
    element.append(
      svgElement('circle', { r: 19, fill: '#fffbeb', stroke: color.ink, 'stroke-width': 1.4 }),
      svgElement('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': 'Source Sans 3,sans-serif', 'font-size': 19, 'font-weight': 600, fill: color.ink }, noteNumber)
    );
  }
  if (element) {
    if (draft) element.setAttribute('data-draft', 'true');
    layer.append(element);
  }
}

function redrawAnnotations() {
  layer.replaceChildren();
  if (!state.document) return;
  layer.setAttribute('viewBox', `0 0 1000 ${1000 * pageRatio}`);
  let noteNumber = 0;
  for (const mark of pageAnnotations(state).items) {
    if (mark.type === 'note') noteNumber++;
    renderMark(mark, false, noteNumber);
  }
  if (state.draft) renderMark(state.draft, true);
}

async function renderPage() {
  if (!state.document) return;
  const epoch = ++renderEpoch;
  const doc = state.document;
  state.rendering = true;
  if (renderTask) {
    renderTask.cancel();
    try { await renderTask.promise; } catch {}
    renderTask = null;
  }
  $('note-bubble').hidden = true;
  stage.dataset.renderState = 'loading';
  $('render-loading').hidden = false;
  updateControls();
  try {
    const page = await doc.getPage(state.page);
    if (epoch !== renderEpoch || state.document !== doc) return;
    const base = page.getViewport({ scale: 1 });
    const mobile = window.innerWidth <= 720;
    const available = Math.max(240, workspace.clientWidth - (mobile ? 24 : 64));
    const targetWidth = Math.min(920, available) * state.zoom;
    const viewport = page.getViewport({ scale: targetWidth / base.width });
    pageRatio = viewport.height / viewport.width;
    const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (viewport.width * viewport.height)));
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    stage.style.width = `${viewport.width}px`;
    stage.style.height = `${viewport.height}px`;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.setAttribute('aria-label', `Página ${state.page} de ${doc.numPages}`);
    layer.setAttribute('aria-label', `Marcações temporárias da página ${state.page}`);
    redrawAnnotations();
    const localTask = page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
      transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      background: '#ffffff'
    });
    renderTask = localTask;
    await localTask.promise;
    if (epoch !== renderEpoch || state.document !== doc) return;
    renderTask = null;
    stage.dataset.renderState = 'ready';
    const text = await page.getTextContent();
    if (epoch === renderEpoch) $('accessible-page-text').textContent = `Página ${state.page}. ${text.items.map(item => item.str ?? '').join(' ')}`;
  } catch (error) {
    if (error.name === 'RenderingCancelledException' || epoch !== renderEpoch) return;
    stage.dataset.renderState = 'error';
    showError('Não foi possível exibir esta página. Tente outra página ou reabra o arquivo.');
    console.error('Falha ao exibir página:', error.name);
  } finally {
    if (epoch === renderEpoch) {
      state.rendering = false;
      $('render-loading').hidden = true;
      updateControls();
    }
  }
}

async function loadPdf(bytes, name, size) {
  const epoch = ++documentEpoch;
  clearError();
  state.loading = true;
  $('document-loading').hidden = false;
  document.querySelectorAll('[data-open-file],#demo-button').forEach(b => b.disabled = true);
  let task;
  let passwordRequested = false;
  try {
    const pdfjs = await engine();
    task = pdfjs.getDocument({
      data: bytes,
      isEvalSupported: false,
      useWasm: false,
      useSystemFonts: false,
      StandardFontDataFactory: LocalStandardFontDataFactory,
      CMapReaderFactory: LocalCMapReaderFactory,
      cMapPacked: true,
      enableXfa: false
    });
    task.onPassword = () => {
      passwordRequested = true;
      task.destroy().catch(() => {});
    };
    const doc = await task.promise;
    if (epoch !== documentEpoch) { await doc.destroy(); return; }
    if (renderTask) {
      renderTask.cancel();
      try { await renderTask.promise; } catch {}
      renderTask = null;
    }
    ++renderEpoch;
    const old = state.document;
    state.document = doc;
    state.fileName = name;
    state.fileSize = size;
    state.page = 1;
    state.zoom = 1;
    state.pages = new Map();
    state.draft = null;
    state.rendering = false;
    $('file-name').textContent = name;
    $('file-details').textContent = `${doc.numPages} páginas · ${formatSize(size)} · Original intacto`;
    $('empty-state').hidden = true;
    $('reader').hidden = false;
    workspace.scrollTo({ top: 0, left: 0 });
    setMode('read');
    updateControls();
    await renderPage();
    if (old) old.destroy().catch(() => {});
  } catch (error) {
    if (epoch !== documentEpoch) return;
    if (passwordRequested || error.name === 'PasswordException') {
      showError('Este PDF exige uma senha para abrir. Esta versão não desbloqueia arquivos com senha de abertura. Peça ao cursinho uma versão autorizada para leitura.');
    } else {
      showError('Não foi possível abrir este PDF. Ele pode estar incompleto, danificado ou usar uma proteção específica da plataforma. Tente baixar novamente ou escolha outro arquivo.');
    }
    if (task) task.destroy().catch(() => {});
  } finally {
    if (epoch === documentEpoch) {
      state.loading = false;
      $('document-loading').hidden = true;
      document.querySelectorAll('[data-open-file],#demo-button').forEach(b => b.disabled = false);
    }
  }
}

function replaceDocument(action) {
  if (hasAnnotations()) {
    showConfirmation('Trocar de PDF?', 'As marcações desta sessão serão apagadas. O arquivo original continuará intacto.', 'Trocar PDF', action);
  } else action();
}

async function openFile(file) {
  if (!file || state.loading) return;
  if (file.size > 100 * 1024 * 1024) {
    showError('Este arquivo tem mais de 100 MB. Para evitar travamentos no aparelho, escolha um PDF menor.');
    return;
  }
  const header = new TextDecoder('latin1').decode(await file.slice(0, 1024).arrayBuffer());
  if (!header.includes('%PDF-')) {
    showError('Escolha um arquivo PDF válido. Este arquivo não tem o formato esperado.');
    return;
  }
  replaceDocument(async () => {
    try { await loadPdf(new Uint8Array(await file.arrayBuffer()), file.name, file.size); }
    catch { showError('Não foi possível ler o arquivo selecionado. Tente selecioná-lo novamente.'); }
  });
}

async function openDemo() {
  replaceDocument(async () => {
    try {
      const { default: data } = await import('./demo-data.js');
      const bytes = toBytes(data);
      await loadPdf(bytes, 'Guia de leitura · exemplo.pdf', bytes.byteLength);
    } catch { showError('Não foi possível carregar o exemplo. Você ainda pode abrir um PDF do aparelho.'); }
  });
}

async function goToPage(value) {
  if (!state.document || state.rendering) return;
  const page = clamp(Math.round(Number(value) || state.page), 1, state.document.numPages);
  $('page-number').value = page;
  if (page === state.page) return;
  state.page = page;
  state.draft = null;
  gesture = null;
  workspace.scrollTo({ top: 0, left: 0 });
  clearError();
  await renderPage();
}

async function zoomTo(value) {
  if (!state.document || state.rendering) return;
  state.zoom = clamp(Math.round(value * 10) / 10, .6, 2.4);
  await renderPage();
}

function pointFromEvent(event) {
  const rect = layer.getBoundingClientRect();
  return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
}

function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function eraseAt(point, targetId) {
  const items = pageAnnotations(state).items;
  const threshold = 16 / layer.getBoundingClientRect().width;
  const candidate = [...items].reverse().find(mark => {
    if (targetId === mark.id) return true;
    if (mark.type === 'highlight') return point.x >= mark.x && point.x <= mark.x + mark.w && point.y >= mark.y && point.y <= mark.y + mark.h;
    if (mark.type === 'note') return Math.hypot(point.x - mark.x, (point.y - mark.y) * pageRatio) < threshold * 1.7;
    return mark.points.some((p, i) => i && pointSegmentDistance(point, mark.points[i - 1], p) < threshold);
  });
  if (candidate) mutateAnnotations(list => list.filter(m => m.id !== candidate.id));
}

function openNoteEditor(point, existing = null) {
  noteDraft = { point, existingId: existing?.id ?? null };
  $('note-input').value = existing?.text ?? '';
  $('note-dialog-title').textContent = existing ? 'Sua nota de estudo' : 'Uma ideia para lembrar';
  $('note-form').querySelector('[type="submit"]').textContent = existing ? 'Atualizar nota' : 'Adicionar nota';
  $('note-bubble').hidden = true;
  $('note-dialog').showModal();
  $('note-input').focus();
}

function showNote(id) {
  const mark = pageAnnotations(state).items.find(m => m.id === id && m.type === 'note');
  if (!mark) return;
  activeNoteId = id;
  const bubble = $('note-bubble');
  $('note-bubble-text').textContent = mark.text;
  bubble.hidden = false;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  bubble.style.left = `${clamp(mark.x * width + 15, 8, Math.max(8, width - bubble.offsetWidth - 8))}px`;
  bubble.style.top = `${clamp(mark.y * height + 15, 8, Math.max(8, height - bubble.offsetHeight - 8))}px`;
}

layer.addEventListener('pointerdown', event => {
  if (!state.document || state.rendering || !event.isPrimary || event.button > 0) return;
  const point = pointFromEvent(event);
  const targetId = event.target.closest('[data-annotation-id]')?.dataset.annotationId;
  if (state.mode === 'read') return;
  event.preventDefault();
  $('note-bubble').hidden = true;
  if (state.mode === 'eraser') { eraseAt(point, targetId); return; }
  if (state.mode === 'note') { gesture = { type: 'note', start: point, pointerId: event.pointerId }; layer.setPointerCapture(event.pointerId); return; }
  layer.setPointerCapture(event.pointerId);
  gesture = { type: state.mode, start: point, pointerId: event.pointerId };
  state.draft = state.mode === 'highlight'
    ? { id: nextId(), type: 'highlight', ...point, w: 0, h: 0, color: state.color }
    : { id: nextId(), type: 'pen', points: [point], color: state.color, width: state.penWidth * 1.7 };
});

layer.addEventListener('pointermove', event => {
  if (!gesture || gesture.pointerId !== event.pointerId || !state.draft) return;
  event.preventDefault();
  const point = pointFromEvent(event);
  if (gesture.type === 'highlight') {
    Object.assign(state.draft, { x: Math.min(gesture.start.x, point.x), y: Math.min(gesture.start.y, point.y), w: Math.abs(gesture.start.x - point.x), h: Math.abs(gesture.start.y - point.y) });
  } else {
    const samples = event.getCoalescedEvents?.() ?? [event];
    for (const sample of samples.length ? samples : [event]) state.draft.points.push(pointFromEvent(sample));
  }
  redrawAnnotations();
});

layer.addEventListener('pointerup', event => {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const type = gesture.type;
  const point = gesture.start;
  gesture = null;
  if (layer.hasPointerCapture(event.pointerId)) layer.releasePointerCapture(event.pointerId);
  if (type === 'note') { openNoteEditor(point); return; }
  const draft = state.draft;
  state.draft = null;
  if (draft && ((draft.type === 'highlight' && draft.w > .003 && draft.h > .002) || (draft.type === 'pen' && draft.points.length > 1))) {
    mutateAnnotations(list => [...list, draft]);
  } else redrawAnnotations();
});

layer.addEventListener('pointercancel', () => { gesture = null; state.draft = null; redrawAnnotations(); });
layer.addEventListener('click', event => {
  if (state.mode !== 'read') return;
  const marker = event.target.closest('.note-marker');
  if (marker) showNote(marker.dataset.annotationId);
  else $('note-bubble').hidden = true;
});
layer.addEventListener('keydown', event => {
  if (!['Enter', ' '].includes(event.key)) return;
  const marker = event.target.closest('.note-marker');
  if (marker) { event.preventDefault(); showNote(marker.dataset.annotationId); }
});

document.querySelectorAll('[data-open-file]').forEach(button => button.addEventListener('click', () => $('file-input').click()));
$('file-input').addEventListener('change', event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  openFile(file);
});
$('demo-button').addEventListener('click', openDemo);
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
$('dismiss-error').addEventListener('click', clearError);
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', () => setColor(button.dataset.color)));
$('pen-width').addEventListener('change', event => { state.penWidth = Number(event.target.value); });
$('undo-button').addEventListener('click', () => history('undo'));
$('redo-button').addEventListener('click', () => history('redo'));
$('clear-button').addEventListener('click', () => showConfirmation('Limpar esta página?', 'Os grifos, traços e notas desta página serão removidos. Você pode usar Desfazer em seguida.', 'Limpar página', () => mutateAnnotations(() => [])));
$('prev-page').addEventListener('click', () => goToPage(state.page - 1));
$('next-page').addEventListener('click', () => goToPage(state.page + 1));
$('page-number').addEventListener('change', event => goToPage(event.target.value));
$('page-number').addEventListener('keydown', event => { if (event.key === 'Enter') { goToPage(event.target.value); event.target.blur(); } });
$('zoom-in').addEventListener('click', () => zoomTo(state.zoom + .2));
$('zoom-out').addEventListener('click', () => zoomTo(state.zoom - .2));
$('fit-width').addEventListener('click', () => zoomTo(1));
$('confirm-cancel').addEventListener('click', () => { confirmationAction = null; $('confirm-dialog').close(); });
$('confirm-accept').addEventListener('click', () => { const action = confirmationAction; confirmationAction = null; $('confirm-dialog').close(); action?.(); });
$('confirm-dialog').addEventListener('cancel', () => { confirmationAction = null; });
$('cancel-note').addEventListener('click', () => { noteDraft = null; $('note-dialog').close(); });
$('note-dialog').addEventListener('cancel', () => { noteDraft = null; });
$('note-form').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('note-input').value.trim();
  if (!text || !noteDraft) return;
  const draft = noteDraft;
  mutateAnnotations(list => draft.existingId
    ? list.map(m => m.id === draft.existingId ? { ...m, text } : m)
    : [...list, { id: nextId(), type: 'note', x: clamp(draft.point.x, .025, .975), y: clamp(draft.point.y, .02, .98), text, color: state.color }]);
  noteDraft = null;
  $('note-dialog').close();
});
$('close-note-bubble').addEventListener('click', () => { $('note-bubble').hidden = true; });
$('edit-note-button').addEventListener('click', () => {
  const mark = pageAnnotations(state).items.find(m => m.id === activeNoteId);
  if (mark) openNoteEditor({ x: mark.x, y: mark.y }, mark);
});

document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  if (!state.document) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    history(event.shiftKey ? 'redo' : 'undo');
  } else if (event.key === 'ArrowRight') goToPage(state.page + 1);
  else if (event.key === 'ArrowLeft') goToPage(state.page - 1);
  else if (event.key === 'Escape') { $('note-bubble').hidden = true; setMode('read'); }
});

new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.document && !state.loading) renderPage(); }, 150);
}).observe(workspace);

window.addEventListener('pagehide', event => {
  // Evita reter PDF/anotações no cache de navegação de alguns navegadores.
  if (event.persisted) {
    state.pages.clear();
    state.draft = null;
    state.document?.destroy().catch(() => {});
    state.document = null;
    canvas.width = 0;
    canvas.height = 0;
    layer.replaceChildren();
  }
});
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
window.addEventListener('DOMContentLoaded', initIcons);
if (document.readyState !== 'loading') initIcons();
layer.dataset.mode = 'read';
