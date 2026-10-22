import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as pdfjs from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { exportAnnotatedPdf } from '../public/export-pdf.js';

const input = process.argv[2];
const output = process.argv[3] || '/home/user/workspace/qa-export-anotado.pdf';
const pdfRoot = new URL('../node_modules/pdfjs-dist/', import.meta.url).pathname;
const bytes = new Uint8Array(await fs.readFile(input));
const doc = await pdfjs.getDocument({
  data: bytes,
  isEvalSupported: false,
  enableScripting: false,
  standardFontDataUrl: `${pdfRoot}standard_fonts/`,
  useSystemFonts: false
}).promise;
const marks = new Map([[3, { items: [
  { id: 'qa-highlight', type: 'highlight', x: .15, y: .2, w: .3, h: .025, color: 'yellow' },
  { id: 'qa-ink', type: 'pen', points: [{ x: .15, y: .25 }, { x: .22, y: .26 }, { x: .35, y: .255 }], width: 4, color: 'blue' },
  { id: 'qa-note', type: 'note', x: .55, y: .3, text: 'Teste de exportação: criança, anotação e revisão.', color: 'green' }
] }]]);
const before = await doc.getPage(3);
const oldAnnotations = await before.getAnnotations();
const textBefore = (await before.getTextContent()).items.map(item => item.str).join(' ');
const saved = await exportAnnotatedPdf(doc, marks, pdfjs);
await fs.writeFile(output, saved);
const reopened = await pdfjs.getDocument({
  data: saved.slice(),
  standardFontDataUrl: `${pdfRoot}standard_fonts/`,
  useSystemFonts: false
}).promise;
const page = await reopened.getPage(3);
const annotations = await page.getAnnotations();
const newAnnotations = annotations.filter(a => a.titleObj?.str === 'Multiversão' && a.subtype !== 'Popup');
assert.equal(reopened.numPages, doc.numPages);
assert.equal(newAnnotations.length, 3);
assert.deepEqual(new Set(newAnnotations.map(a => a.subtype)), new Set(['Highlight', 'Ink', 'FreeText']));
const afterText = (await page.getTextContent()).items.map(item => item.str).join(' ');
assert.ok(afterText.includes(textBefore.slice(0, 80)));
assert.ok(newAnnotations.find(a => a.subtype === 'FreeText').contentsObj.str.includes('criança'));
assert.ok(annotations.some(a => a.subtype === 'Popup' && a.contentsObj.str.includes('revisão')));
const second = await exportAnnotatedPdf(doc, marks, pdfjs);
const secondDoc = await pdfjs.getDocument({ data: second, standardFontDataUrl: `${pdfRoot}standard_fonts/` }).promise;
assert.equal((await (await secondDoc.getPage(3)).getAnnotations()).length, annotations.length);
console.log(JSON.stringify({
  output,
  pages: reopened.numPages,
  annotationsBefore: oldAnnotations.length,
  annotationTypes: newAnnotations.map(a => a.subtype),
  textPreserved: true,
  accentedNotePreserved: true,
  repeatedExportDoesNotDuplicate: true
}, null, 2));
await secondDoc.loadingTask.destroy();
await reopened.loadingTask.destroy();
await doc.loadingTask.destroy();
