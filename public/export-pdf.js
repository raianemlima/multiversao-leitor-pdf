import { COLORS } from './schema.js';

const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16));
const bound = (value, min, max) => Math.max(min, Math.min(max, value));
function wrapText(text, maxChars) {
  const lines = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (word.length > maxChars) {
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

async function noteCard(width, height, ink) {
  try {
    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(4, Math.round(width * scale));
    canvas.height = Math.max(4, Math.round(height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff8db';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = ink;
    context.globalAlpha = .55;
    context.lineWidth = 2;
    context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    return await createImageBitmap(canvas);
  } catch {
    return null;
  }
}

const PREFIX = 'pdfjs_internal_editor_multiversao_';

/** Incremental PDF update. Original page streams and encryption stay intact. */
export async function exportAnnotatedPdf(document, pages, pdfjs) {
  const annotated = [...pages.entries()].filter(([, value]) => value.items.length);
  if (!annotated.length) return document.getData();
  const permissions = await document.getPermissions();
  const annotationAllowed = permissions === null
    || permissions?.has?.(pdfjs.PermissionFlag.MODIFY_ANNOTATIONS)
    || permissions?.includes?.(pdfjs.PermissionFlag.MODIFY_ANNOTATIONS);
  if (!annotationAllowed) {
    throw new Error('Este PDF não autoriza gravar anotações. Peça ao responsável uma versão com essa permissão; a proteção não será removida.');
  }
  const keys = [];
  try {
    for (const [pageNumber, data] of annotated) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const point = (x, y) => viewport.convertToPdfPoint(x * viewport.width, y * viewport.height);
      let noteNumber = 0;
      for (const mark of data.items) {
        const color = COLORS[mark.color] ?? COLORS.yellow;
        const common = {
          pageIndex: pageNumber - 1,
          rotation: 0,
          user: 'Multiversão',
          date: new Date().toISOString()
        };
        let annotation;
        if (mark.type === 'highlight') {
          const a = point(mark.x, mark.y);
          const b = point(mark.x + mark.w, mark.y);
          const c = point(mark.x, mark.y + mark.h);
          const d = point(mark.x + mark.w, mark.y + mark.h);
          const points = [a, b, c, d];
          annotation = {
            ...common,
            annotationType: pdfjs.AnnotationEditorType.HIGHLIGHT,
            color: rgb(color.highlight),
            opacity: .45,
            rect: [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))],
            quadPoints: [...a, ...b, ...c, ...d],
            outlines: [[...a, ...b, ...d, ...c]]
          };
        } else if (mark.type === 'pen') {
          const points = mark.points.map(p => point(p.x, p.y));
          if (points.length < 2) continue;
          const thickness = mark.width / 1000 * viewport.width;
          const line = points.flatMap(p => [NaN, NaN, NaN, NaN, ...p]);
          annotation = {
            ...common,
            annotationType: pdfjs.AnnotationEditorType.INK,
            color: rgb(color.ink),
            thickness,
            opacity: 1,
            rect: [Math.min(...points.map(p => p[0])) - thickness, Math.min(...points.map(p => p[1])) - thickness, Math.max(...points.map(p => p[0])) + thickness, Math.max(...points.map(p => p[1])) + thickness],
            paths: { lines: [line], points: [points.flat()] }
          };
        } else if (mark.type === 'note') {
          noteNumber++;
          // O texto da nota fica visível na página: o visualizador do iPhone/iPad
          // não abre comentários pop-up, então "Nota 1" sozinho não bastava.
          const fontSize = 9;
          const lineHeight = fontSize * 1.22;
          const charWidth = fontSize * 0.5;
          const margin = 12;
          const maxWidth = Math.min(230, viewport.width - margin * 2);
          const lines = wrapText(`Nota ${noteNumber}: ${String(mark.text ?? '').trim()}`, Math.max(12, Math.floor((maxWidth - 8) / charWidth)));
          const longest = Math.max(...lines.map(line => line.length));
          const width = Math.min(maxWidth, Math.max(60, longest * charWidth + 10));
          const height = Math.min(viewport.height - margin * 2, lines.length * lineHeight + 6);
          const x = bound(mark.x * viewport.width, margin, viewport.width - width - margin);
          const y = bound(mark.y * viewport.height, margin, viewport.height - height - margin);
          const corners = [
            viewport.convertToPdfPoint(x, y),
            viewport.convertToPdfPoint(x + width, y + height)
          ];
          const noteRect = [Math.min(corners[0][0], corners[1][0]), Math.min(corners[0][1], corners[1][1]), Math.max(corners[0][0], corners[1][0]), Math.max(corners[0][1], corners[1][1])];
          // Fundo claro (carimbo de imagem) desenhado antes do texto, para a nota
          // ficar legível mesmo sobre o texto do PDF em qualquer visualizador.
          const card = await noteCard(width, height, color.ink);
          if (card) {
            const cardKey = `${PREFIX}${pageNumber}_${mark.id}_card`;
            keys.push(cardKey);
            document.annotationStorage.setValue(cardKey, {
              ...common,
              annotationType: pdfjs.AnnotationEditorType.STAMP,
              bitmapId: `multiversao_card_${pageNumber}_${mark.id}_${Date.now()}`,
              bitmap: card,
              isSvg: false,
              rect: noteRect.slice(),
              accessibilityData: { decorative: true, altText: '' }
            });
          }
          annotation = {
            ...common,
            annotationType: pdfjs.AnnotationEditorType.FREETEXT,
            rotation: viewport.rotation,
            color: rgb(color.ink),
            fontSize,
            value: lines.join('\n'),
            popup: {
              contents: mark.text,
              rect: [12, 12, Math.min(250, viewport.width - 12), 160]
            },
            rect: noteRect
          };
        } else continue;
        const key = `${PREFIX}${pageNumber}_${mark.id}`;
        keys.push(key);
        document.annotationStorage.setValue(key, annotation);
      }
    }
    return await document.saveDocument();
  } finally {
    for (const key of keys) document.annotationStorage.remove(key);
  }
}
