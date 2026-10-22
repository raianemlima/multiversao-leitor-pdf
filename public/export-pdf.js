import { COLORS } from './schema.js';

const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16));
const bound = (value, min, max) => Math.max(min, Math.min(max, value));
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
          const value = `Nota ${noteNumber}`;
          const width = 40;
          const fontSize = 10;
          const height = 17;
          const x = bound(mark.x * viewport.width, 12, viewport.width - width - 12);
          const y = bound(mark.y * viewport.height, 12, viewport.height - height - 12);
          const corners = [
            viewport.convertToPdfPoint(x, y),
            viewport.convertToPdfPoint(x + width, y + height)
          ];
          annotation = {
            ...common,
            annotationType: pdfjs.AnnotationEditorType.FREETEXT,
            rotation: viewport.rotation,
            color: rgb(color.ink),
            fontSize,
            value,
            popup: {
              contents: mark.text,
              rect: [12, 12, Math.min(250, viewport.width - 12), 160]
            },
            rect: [Math.min(corners[0][0], corners[1][0]), Math.min(corners[0][1], corners[1][1]), Math.max(corners[0][0], corners[1][0]), Math.max(corners[0][1], corners[1][1])]
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
