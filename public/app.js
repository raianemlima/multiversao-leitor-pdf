import { createState, pageAnnotations, COLORS } from './schema.js';
import { exportAnnotatedPdf } from './export-pdf.js';
import { initializePwa, installPwa, pwaStatus, isPreview, storeReading, getStoredReading, clearStoredReading } from './pwa.js';

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
const MAX_CANVAS_PIXELS = 5_000_000;
let persistQueue = Promise.resolve();
let persistRequested = 0;
let exportFile = null;
let savedLocally = false;
let nativeNotes = new Map();
let textLines = [];

const hints = {
  read: 'Role para ler. Toque nos marcadores para reler as notas.',
  highlight: 'Passe o dedo sobre o texto para grifar. O grifo se ajusta às linhas.',
  pen: 'Escreva na página com o dedo, mouse ou caneta.',
  note: 'Toque no ponto da página onde deseja adicionar uma nota.',
  eraser: 'Toque em um grifo, traço ou marcador para apagar.'
};

const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const nextId = () => `mark-${++uid}`;
const hasAnnotations = () => [...state.pages.values()].some(p => p.items.length > 0);
const toBytes = base64 => Uint8Array.from(atob(base64), char => char.charCodeAt(0));
async function destroyDocument(document) {
  if (!document) return;
  if (document.loadingTask?.destroy) await document.loadingTask.destroy();
  else await document.destroy?.();
}

function initIcons() {
  window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });
}
document.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
  img.hidden = true;
  const fallback = document.createElement('span');
  fallback.textContent = 'Multiversão';
  fallback.className = 'brand-fallback';
  img.after(fallback);
}));

function showError(message, kind = 'general') {
  $('error-banner').dataset.kind = kind;
  $('error-message').textContent = message;
  $('error-banner').hidden = false;
}

function clearError() {
  $('error-banner').hidden = true;
  delete $('error-banner').dataset.kind;
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

// PDF.js 6 usa uma única fábrica binária para fontes-padrão e CMaps.
class LocalBinaryDataFactory {
  constructor() {}
  async fetch({ kind, filename }) {
    if (kind !== 'standardFontDataUrl' && kind !== 'cMapUrl') throw new Error(`Recurso não incluído: ${kind}`);
    return resource(filename);
  }
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
  const busy = state.loading || state.rendering || state.exporting;
  $('toolbar').hidden = !loaded;
  $('reader-controls').hidden = !loaded;
  document.body.classList.toggle('has-document', loaded);
  $('export-button').hidden = !loaded;
  $('export-button').disabled = busy;
  $('export-button').querySelector('span').textContent = state.exporting ? 'Gerando…' : 'Salvar PDF';
  $('page-number').value = state.page;
  $('page-number').max = state.document?.numPages ?? 1;
  $('page-total').textContent = state.document?.numPages ?? 0;
  $('prev-page').disabled = !loaded || state.page <= 1 || busy;
  $('next-page').disabled = !loaded || state.page >= state.document.numPages || busy;
  $('page-number').disabled = !loaded || busy;
  $('zoom-out').disabled = !loaded || state.zoom <= .6 || busy;
  $('zoom-in').disabled = !loaded || state.zoom >= 2.4 || busy;
  $('fit-width').disabled = !loaded || busy;
  $('pen-width').disabled = !loaded || busy;
  document.querySelectorAll('[data-mode],[data-color]').forEach(button => { button.disabled = !loaded || busy; });
  document.querySelectorAll('[data-open-file],#demo-button').forEach(button => { button.disabled = state.loading || state.exporting; });
  $('clear-local-button').disabled = state.loading || state.exporting;
  $('zoom-value').textContent = `${Math.round(state.zoom * 100)}%`;
  if (loaded) {
    const marks = pageAnnotations(state);
    $('undo-button').disabled = !marks.undo.length || busy;
    $('redo-button').disabled = !marks.redo.length || busy;
    $('clear-button').disabled = !marks.items.length || busy;
  }
}

function persistReading(includeOriginal = false) {
  if (!state.document || !pwaStatus().localAccess) return;
  const ticket = ++persistRequested;
  savedLocally = false;
  $('temporary-notice').textContent = 'Guardando a leitura no aparelho…';
  persistQueue = persistQueue.then(async () => {
    const saved = await storeReading(state, includeOriginal);
    if (ticket !== persistRequested) return;
    savedLocally = saved;
    $('temporary-notice').textContent = saved
      ? 'Leitura guardada no aparelho. Salve o PDF como backup.'
      : 'Não foi possível guardar localmente. Use Salvar PDF.';
    await refreshResumeButton();
  }).catch(() => {
    if (ticket !== persistRequested) return;
    savedLocally = false;
    $('temporary-notice').textContent = 'Use Salvar PDF para guardar suas marcações.';
  });
}

async function refreshResumeButton() {
  const stored = await getStoredReading();
  $('resume-button').hidden = !stored;
  $('clear-local-button').hidden = !stored;
  $('resume-label').textContent = stored ? `Retomar: ${stored.name}` : 'Retomar última leitura';
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
  state.revision = Math.max(Date.now(), (state.revision || 0) + 1);
  redrawAnnotations();
  updateControls();
  persistReading();
}

function history(direction) {
  const page = pageAnnotations(state);
  const source = page[direction];
  if (!source.length) return;
  const target = direction === 'undo' ? page.redo : page.undo;
  target.push(clone(page.items));
  page.items = source.pop();
  state.revision = Math.max(Date.now(), (state.revision || 0) + 1);
  $('note-bubble').hidden = true;
  redrawAnnotations();
  updateControls();
  persistReading();
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
    const markerScale = 1000 / Math.max(layer.clientWidth, 240);
    const markerRadius = 22 * markerScale;
    element = svgElement('g', {
      ...attr, class: 'note-marker', transform: `translate(${x},${y})`,
      role: 'button', tabindex: '0', 'aria-label': `Nota ${noteNumber}: ${mark.text}`
    });
    element.append(
      svgElement('circle', { r: markerRadius, fill: '#fffbeb', stroke: color.ink, 'stroke-width': 1.2 * markerScale }),
      svgElement('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': 'Source Sans 3,sans-serif', 'font-size': 17 * markerScale, 'font-weight': 600, fill: color.ink }, noteNumber)
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
  for (const mark of nativeNotes.values()) {
    const scale = 1000 / Math.max(layer.clientWidth, 240);
    const target = svgElement('g', {
      class: 'note-marker native-note-target',
      'data-annotation-id': mark.id,
      role: 'button', tabindex: '0', 'aria-label': mark.text,
      transform: `translate(${mark.x * 1000},${mark.y * 1000 * pageRatio})`
    });
    target.append(svgElement('rect', { x: -8 * scale, y: -8 * scale, width: 60 * scale, height: 44 * scale, fill: 'transparent' }));
    layer.append(target);
  }
  if (state.draft?.parts) for (const part of state.draft.parts) renderMark({ ...state.draft, ...part }, true);
  else if (state.draft) renderMark(state.draft, true);
}

async function renderPage() {
  if (!state.document) return;
  const epoch = ++renderEpoch;
  const doc = state.document;
  nativeNotes = new Map();
  textLines = [];
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
    const idealRatio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
    stage.style.width = `${viewport.width}px`;
    stage.style.height = `${viewport.height}px`;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.setAttribute('aria-label', `Página ${state.page} de ${doc.numPages}`);
    layer.setAttribute('aria-label', `Marcações da página ${state.page}`);
    redrawAnnotations();
    // Safari/iPad limita a memória de canvas: se falhar, tenta de novo com menos pixels.
    let lastError;
    let drawn = false;
    for (const ratio of [...new Set([idealRatio, Math.min(idealRatio, 1), Math.min(idealRatio, .75)])]) {
      if (epoch !== renderEpoch || state.document !== doc) return;
      try {
        canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
        canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
        const context = canvas.getContext('2d');
        context.setTransform(1, 0, 0, 1, 0, 0);
        const localTask = page.render({
          canvasContext: context,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
          background: '#ffffff'
        });
        renderTask = localTask;
        await localTask.promise;
        if (renderTask === localTask) renderTask = null;
        drawn = true;
        break;
      } catch (error) {
        if (renderTask) renderTask = null;
        if (error?.name === 'RenderingCancelledException' || epoch !== renderEpoch) throw error;
        lastError = error;
        console.warn('Nova tentativa de exibir a página com resolução menor:', error?.name, error?.message);
      }
    }
    if (!drawn) throw lastError || new Error('Falha ao desenhar a página');
    if (epoch !== renderEpoch || state.document !== doc) return;
    stage.dataset.renderState = 'ready';
    if ($('error-banner').dataset.kind === 'render') clearError();
    // A página já está visível: libera o toque sem esperar texto e notas.
    state.rendering = false;
    $('render-loading').hidden = true;
    updateControls();
    // Texto acessível e notas nativas são complementares: falhas aqui não bloqueiam a leitura.
    try {
      const text = await page.getTextContent();
      if (epoch === renderEpoch) {
        $('accessible-page-text').textContent = `Página ${state.page}. ${text.items.map(item => item.str ?? '').join(' ')}`;
        textLines = buildTextLines(text.items, viewport);
      }
    } catch (error) {
      console.warn('Texto acessível indisponível nesta página:', error?.name, error?.message);
    }
    try {
      const annotations = await page.getAnnotations();
      if (epoch === renderEpoch) {
        for (const annotation of annotations) {
          if (annotation.subtype !== 'FreeText' || annotation.titleObj?.str !== 'Multiversão' || !annotation.popupRef || !annotation.contentsObj?.str) continue;
          const a = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]);
          const b = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3]);
          const rect = [...a, ...b];
          const id = `native-${annotation.id}`;
          nativeNotes.set(id, { id, x: Math.min(rect[0], rect[2]) / viewport.width, y: Math.min(rect[1], rect[3]) / viewport.height, text: annotation.contentsObj.str, readOnly: true });
        }
        redrawAnnotations();
      }
    } catch (error) {
      console.warn('Notas do PDF indisponíveis nesta página:', error?.name, error?.message);
    }
  } catch (error) {
    if (error?.name === 'RenderingCancelledException' || epoch !== renderEpoch) return;
    stage.dataset.renderState = 'error';
    showError('Não foi possível exibir esta página. Tente outra página ou reabra o arquivo.', 'render');
    console.error('Falha ao exibir página:', error?.name, error?.message);
  } finally {
    if (epoch === renderEpoch) {
      state.rendering = false;
      $('render-loading').hidden = true;
      updateControls();
    }
  }
}

async function loadPdf(bytes, name, size, restored = null) {
  const epoch = ++documentEpoch;
  clearError();
  state.loading = true;
  stage.dataset.renderState = 'loading';
  updateControls();
  $('document-loading').hidden = false;
  document.querySelectorAll('[data-open-file],#demo-button').forEach(b => b.disabled = true);
  let task;
  let passwordRequested = false;
  const originalBytes = bytes.slice();
  try {
    const pdfjs = await engine();
    task = pdfjs.getDocument({
      data: bytes,
      isEvalSupported: false,
      enableScripting: false,
      useWasm: false,
      useSystemFonts: false,
      BinaryDataFactory: LocalBinaryDataFactory,
      useWorkerFetch: false,
      cMapPacked: true,
      enableXfa: false
    });
    task.onPassword = () => {
      passwordRequested = true;
      task.destroy().catch(() => {});
    };
    const doc = await task.promise;
    if (epoch !== documentEpoch) { await destroyDocument(doc); return; }
    if (renderTask) {
      renderTask.cancel();
      try { await renderTask.promise; } catch {}
      renderTask = null;
    }
    ++renderEpoch;
    const old = state.document;
    state.document = doc;
    state.originalBytes = originalBytes;
    state.revision = Math.max(Date.now(), Number(restored?.revision) || 0);
    state.fileName = name;
    state.fileSize = size;
    state.page = restored ? Math.max(1, Math.min(Number(restored.page) || 1, doc.numPages)) : 1;
    state.zoom = 1;
    state.pages = restored
      ? new Map(restored.pages.map(([page, value]) => [Number(page), { items: value.items, undo: [], redo: [] }]))
      : new Map();
    uid = Math.max(uid, ...[...state.pages.values()].flatMap(v => v.items.map(m => Number(String(m.id).split('-').pop()) || 0)));
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
    savedLocally = !!restored;
    persistReading(true);
    if (old) destroyDocument(old).catch(() => {});
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
      updateControls();
    }
  }
}

function replaceDocument(action) {
  if (hasAnnotations()) {
    showConfirmation('Trocar de PDF?', 'O app guarda apenas a última leitura. Use Salvar PDF antes de trocar para manter uma cópia das marcações atuais. O original continua intacto.', 'Trocar PDF', action);
  } else action();
}

async function openFile(file) {
  if (!file || state.loading || state.exporting) return;
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
  persistReading();
}

async function zoomTo(value) {
  if (!state.document || state.rendering) return;
  state.zoom = clamp(Math.round(value * 10) / 10, .6, 2.4);
  await renderPage();
}

async function createExport() {
  if (!state.document || state.exporting) return;
  clearError();
  state.exporting = true;
  updateControls();
  try {
    const bytes = await exportAnnotatedPdf(state.document, state.pages, await engine());
    const baseName = state.fileName.replace(/\.pdf$/i, '').replace(/[\/\\<>:"|?*\u0000-\u001f]/g, '-');
    exportFile = new File([bytes], `${baseName}-anotado.pdf`, { type: 'application/pdf' });
    $('export-details').textContent = `${exportFile.name} · ${formatSize(exportFile.size)} · ${state.document.numPages} páginas. O original não foi alterado.`;
    $('export-result').textContent = '';
    $('save-device-button').disabled = isPreview();
    $('share-device-button').hidden = isPreview() || !(navigator.canShare?.({ files: [exportFile] }));
    $('export-context-message').textContent = isPreview()
      ? 'A cópia foi gerada, mas esta prévia bloqueia o salvamento de arquivos. Abra o endereço próprio do PWA para baixar ou salvar em Arquivos, sem enviar o PDF ao servidor.'
      : 'No Android, baixe a cópia para Downloads. No iPad, use Compartilhar / Arquivos quando disponível e escolha Salvar em Arquivos. As notas ficam em comentários com marcador “Nota”, sem cobrir o texto com parágrafos.';
    $('export-dialog').showModal();
  } catch (error) {
    showError(error.message?.includes('autoriza')
      ? error.message
      : 'Não foi possível gerar a cópia anotada. Seu original e suas marcações continuam disponíveis. Tente novamente ou peça ao responsável um PDF que permita anotações.');
  } finally {
    state.exporting = false;
    updateControls();
  }
}

async function saveExport() {
  if (!exportFile || isPreview()) return;
  try {
    // Somente no contexto próprio do PWA. Nunca tentar Blob/download no iframe.
    const url = URL.createObjectURL(exportFile);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exportFile.name;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    $('export-result').textContent = 'Cópia entregue ao navegador. Confira Downloads ou use Compartilhar para salvar em Arquivos.';
  } catch (error) {
    $('export-result').textContent = error.name === 'AbortError'
      ? 'Salvamento cancelado. A cópia continua pronta.'
      : 'O navegador não concluiu o salvamento. Tente Compartilhar / Arquivos.';
  }
}

// Agrupa os trechos de texto da página em linhas (coordenadas 0–1 da página).
function buildTextLines(items, viewport) {
  const boxes = [];
  for (const item of items) {
    if (!item.str?.trim() || !item.transform || !item.width) continue;
    const [a, b, c, d, e, f] = item.transform;
    if (Math.abs(b) > .01 * Math.abs(a) || Math.abs(c) > .01 * Math.abs(d)) continue; // texto girado
    const size = Math.hypot(c, d) || item.height || 10;
    const p1 = viewport.convertToViewportPoint(e, f - size * .22);
    const p2 = viewport.convertToViewportPoint(e + item.width, f + size * .88);
    const x0 = Math.min(p1[0], p2[0]) / viewport.width, x1 = Math.max(p1[0], p2[0]) / viewport.width;
    const y0 = Math.min(p1[1], p2[1]) / viewport.height, y1 = Math.max(p1[1], p2[1]) / viewport.height;
    if (x1 - x0 <= 0 || y1 - y0 <= 0 || y1 - y0 > .2) continue;
    boxes.push({ x0, x1, y0, y1 });
  }
  const ratio = viewport.height / viewport.width;
  boxes.sort((m, n) => (m.y0 + m.y1) - (n.y0 + n.y1) || m.x0 - n.x0);
  const lines = [];
  for (const box of boxes) {
    const center = (box.y0 + box.y1) / 2;
    // Mesma altura e perto na horizontal; um vão grande indica outra coluna.
    const maxGap = (box.y1 - box.y0) * ratio * 1.3;
    const line = lines.find(l => center > l.y0 && center < l.y1
      && Math.abs((l.y1 - l.y0) - (box.y1 - box.y0)) < (l.y1 - l.y0) * .8
      && box.x0 - l.x1 < maxGap && l.x0 - box.x1 < maxGap);
    if (line) {
      line.x0 = Math.min(line.x0, box.x0); line.x1 = Math.max(line.x1, box.x1);
      line.y0 = Math.min(line.y0, box.y0); line.y1 = Math.max(line.y1, box.y1);
      line.boxes.push(box);
    } else lines.push({ ...box, boxes: [box] });
  }
  return lines.sort((m, n) => m.y0 - n.y0);
}

function lineNear(point) {
  let best = null, bestDistance = Infinity;
  for (const line of textLines) {
    const dy = point.y < line.y0 ? line.y0 - point.y : point.y > line.y1 ? point.y - line.y1 : 0;
    const dx = point.x < line.x0 ? line.x0 - point.x : point.x > line.x1 ? point.x - line.x1 : 0;
    const distance = dy * 3 + dx;
    if (distance < bestDistance) { bestDistance = distance; best = line; }
  }
  return bestDistance < .045 ? best : null;
}

// Grifo como marca-texto: do ponto inicial ao final, seguindo as linhas do texto.
function snapHighlight(start, end) {
  let first = lineNear(start), last = lineNear(end);
  if (!first || !last) return null;
  let a = start, b = end;
  if (last.y0 < first.y0 || (last === first && end.x < start.x)) { [first, last] = [last, first]; [a, b] = [b, a]; }
  const pad = .004;
  const parts = [];
  const colX0 = Math.min(first.x0, last.x0), colX1 = Math.max(first.x1, last.x1);
  for (const line of textLines) {
    if (line.y0 < first.y0 - 1e-6 || line.y0 > last.y0 + 1e-6) continue;
    if (line !== first && line !== last && (line.x1 <= colX0 || line.x0 >= colX1)) continue; // outra coluna
    let x0 = line.x0, x1 = line.x1;
    if (line === first) x0 = Math.max(x0, Math.min(a.x, line.x1));
    if (line === last) x1 = Math.min(x1, Math.max(b.x, line.x0));
    if (x1 - x0 < .004) continue;
    parts.push({ x: clamp(x0 - pad, 0, 1), y: line.y0, w: Math.min(1, x1 + pad) - clamp(x0 - pad, 0, 1), h: line.y1 - line.y0 });
  }
  return parts.length ? parts : null;
}

function updateHighlightDraft(point) {
  const start = gesture.start;
  const parts = snapHighlight(start, point);
  if (parts) Object.assign(state.draft, { parts, x: parts[0].x, y: parts[0].y, w: parts[0].w, h: parts[0].h });
  else {
    // Sem texto detectável (página digitalizada): faixa com altura mínima de uma linha.
    const minH = .018;
    const y = Math.min(start.y, point.y), h = Math.abs(start.y - point.y);
    Object.assign(state.draft, { parts: null, x: Math.min(start.x, point.x), w: Math.abs(start.x - point.x),
      y: h < minH ? clamp((start.y + point.y) / 2 - minH / 2, 0, 1 - minH) : y, h: Math.max(h, minH) });
  }
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
  const mark = pageAnnotations(state).items.find(m => m.id === id && m.type === 'note') || nativeNotes.get(id);
  if (!mark) return;
  activeNoteId = id;
  const bubble = $('note-bubble');
  $('note-bubble-text').textContent = mark.text;
  $('edit-note-button').hidden = !!mark.readOnly;
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
    ? { id: nextId(), type: 'highlight', ...point, w: 0, h: 0, color: state.color, parts: null }
    : { id: nextId(), type: 'pen', points: [point], color: state.color, width: state.penWidth * 1.7 };
});

let redrawFrame = 0;
function scheduleRedraw() {
  if (redrawFrame) return;
  redrawFrame = requestAnimationFrame(() => { redrawFrame = 0; redrawAnnotations(); });
}

layer.addEventListener('pointermove', event => {
  if (!gesture || gesture.pointerId !== event.pointerId || !state.draft) return;
  event.preventDefault();
  const point = pointFromEvent(event);
  if (gesture.type === 'highlight') {
    updateHighlightDraft(point);
  } else {
    const samples = event.getCoalescedEvents?.() ?? [event];
    const points = state.draft.points;
    for (const sample of samples.length ? samples : [event]) {
      const next = pointFromEvent(sample);
      const prev = points[points.length - 1];
      if (!prev || Math.hypot(next.x - prev.x, next.y - prev.y) > .0012) points.push(next);
    }
  }
  scheduleRedraw();
});

layer.addEventListener('pointerup', event => {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const type = gesture.type;
  const point = gesture.start;
  gesture = null;
  if (layer.hasPointerCapture(event.pointerId)) layer.releasePointerCapture(event.pointerId);
  if (type === 'note') { openNoteEditor(point); return; }
  if (redrawFrame) { cancelAnimationFrame(redrawFrame); redrawFrame = 0; }
  const draft = state.draft;
  state.draft = null;
  if (draft?.type === 'highlight' && draft.parts?.length) {
    const { parts, ...base } = draft;
    mutateAnnotations(list => [...list, ...parts.map((part, i) => ({ ...base, ...part, id: i ? nextId() : base.id }))]);
  } else if (draft && ((draft.type === 'highlight' && draft.w > .006 && draft.h > .002) || (draft.type === 'pen' && draft.points.length > 1))) {
    delete draft.parts;
    mutateAnnotations(list => [...list, draft]);
  } else redrawAnnotations();
});

// iPhone/iPad: impede seleção de texto, lupa e menu de pressão longa ao desenhar.
for (const type of ['touchstart', 'touchmove']) {
  layer.addEventListener(type, event => {
    if (state.mode !== 'read' && event.touches.length === 1) event.preventDefault();
  }, { passive: false });
}
layer.addEventListener('contextmenu', event => { if (state.mode !== 'read') event.preventDefault(); });
document.addEventListener('selectstart', event => {
  if (!event.target.closest?.('input, textarea, #accessible-page-text')) event.preventDefault();
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
$('pwa-button').addEventListener('click', () => $('pwa-dialog').showModal());
$('install-button').addEventListener('click', async () => {
  try { await installPwa(); }
  catch { $('pwa-explanation').textContent = 'Use o menu do navegador para adicionar o app à tela inicial.'; }
});
$('resume-button').addEventListener('click', async () => {
  const stored = await getStoredReading(true);
  if (!stored?.bytes) { showError('A leitura local não está mais disponível. Escolha o PDF no aparelho.'); await refreshResumeButton(); return; }
  await loadPdf(stored.bytes, stored.name, stored.size, stored);
});
$('clear-local-button').addEventListener('click', () => {
  $('pwa-dialog').close();
  showConfirmation('Apagar leitura deste aparelho?', 'A cópia local do PDF e suas marcações serão removidas do armazenamento do app. PDFs já baixados em Arquivos/Downloads não serão apagados.', 'Apagar leitura local', async () => {
    ++persistRequested;
    await persistQueue;
    await clearStoredReading();
    savedLocally = false;
    ++documentEpoch;
    ++renderEpoch;
    renderTask?.cancel();
    const old = state.document;
    state.document = null;
    state.loading = false;
    state.rendering = false;
    state.exporting = false;
    state.originalBytes = null;
    state.pages.clear();
    state.page = 1;
    nativeNotes.clear();
    layer.replaceChildren();
    canvas.width = 0;
    canvas.height = 0;
    $('document-loading').hidden = true;
    $('render-loading').hidden = true;
    $('file-name').textContent = 'Seu espaço de leitura';
    $('file-details').textContent = 'Sem cadastro. Sem alterar o original.';
    $('reader').hidden = true;
    $('empty-state').hidden = false;
    updateControls();
    destroyDocument(old).catch(() => {});
    await refreshResumeButton();
    $('temporary-notice').textContent = 'Leitura local apagada. Seus PDFs em Arquivos/Downloads não foram alterados.';
  });
});
$('export-button').addEventListener('click', createExport);
$('save-device-button').addEventListener('click', saveExport);
$('share-device-button').addEventListener('click', async () => {
  if (!exportFile || isPreview()) return;
  try {
    await navigator.share({ files: [exportFile], title: 'PDF anotado · Multiversão' });
    $('export-result').textContent = 'Arquivo entregue ao destino escolhido.';
  } catch (error) {
    $('export-result').textContent = error.name === 'AbortError' ? 'Compartilhamento cancelado.' : 'Não foi possível compartilhar. Tente Baixar PDF.';
  }
});
$('dismiss-error').addEventListener('click', clearError);
document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
  // Alguns navegadores suprimem o click de compatibilidade logo após desenhar
  // com toque. A escolha idempotente do modo também responde ao pointerup.
  button.addEventListener('pointerup', event => {
    if (event.pointerType === 'touch') setMode(button.dataset.mode);
  });
});
document.querySelectorAll('[data-color]').forEach(button => {
  button.addEventListener('click', () => setColor(button.dataset.color));
  button.addEventListener('pointerup', event => {
    if (event.pointerType === 'touch') setColor(button.dataset.color);
  });
});
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
    : [...list, {
      id: nextId(), type: 'note',
      x: clamp(draft.point.x, 24 / stage.clientWidth, 1 - 24 / stage.clientWidth),
      y: clamp(draft.point.y, 24 / stage.clientHeight, 1 - 24 / stage.clientHeight),
      text, color: state.color
    }]);
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

let observedWidth = 0;
new ResizeObserver(entries => {
  // No iPhone/iPad a barra do Safari muda só a altura ao rolar; isso não exige redesenhar.
  const width = Math.round(entries[0]?.contentRect.width || workspace.clientWidth);
  if (Math.abs(width - observedWidth) < 2) return;
  observedWidth = width;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.document && !state.loading) renderPage(); }, 150);
}).observe(workspace);

initializePwa(async status => {
  $('pwa-label').textContent = status.message;
  $('preview-notice').hidden = !status.preview;
  $('install-button').hidden = !status.canInstall;
  if (status.preview) {
    $('pwa-explanation').textContent = 'Você está na prévia de demonstração. Para instalar e usar offline, este PWA precisa ser disponibilizado em um endereço próprio HTTPS. Nenhum PDF de aluno será publicado junto com o app.';
    $('temporary-notice').textContent = 'Prévia: marcações em memória. Salvamento no PWA próprio.';
  }
  await refreshResumeButton();
});
window.addEventListener('beforeunload', event => {
  if (!isPreview() && pwaStatus().localAccess && state.document && hasAnnotations() && !savedLocally) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('DOMContentLoaded', initIcons);
if (document.readyState !== 'loading') initIcons();
layer.dataset.mode = 'read';
