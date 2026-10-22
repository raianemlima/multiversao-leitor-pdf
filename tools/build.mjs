import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const vendor = path.join(pub, 'vendor');
const fonts = path.join(pub, 'fonts');
await fs.mkdir(vendor, { recursive: true });
await fs.mkdir(fonts, { recursive: true });
const pdfRoot = path.join(root, 'node_modules/pdfjs-dist');
await fs.copyFile(path.join(pdfRoot, 'legacy/build/pdf.min.mjs'), path.join(vendor, 'pdf.min.mjs'));
await fs.copyFile(path.join(pdfRoot, 'legacy/build/pdf.worker.min.mjs'), path.join(vendor, 'pdf.worker.min.mjs'));
await fs.copyFile(path.join(pdfRoot, 'LICENSE'), path.join(vendor, 'PDFJS-LICENSE.txt'));
await fs.copyFile(path.join(root, 'node_modules/lucide/dist/umd/lucide.min.js'), path.join(vendor, 'lucide.min.js'));
await fs.copyFile(path.join(root, 'node_modules/lucide/LICENSE'), path.join(vendor, 'LUCIDE-LICENSE.txt'));
for (const [family, weights] of [['source-sans-3', [400, 600]], ['lora', [400]]]) {
  for (const weight of weights) {
    const name = `${family}-latin-${weight}-normal.woff2`;
    await fs.copyFile(path.join(root, 'node_modules/@fontsource', family, 'files', name), path.join(fonts, name));
  }
  await fs.copyFile(path.join(root, 'node_modules/@fontsource', family, 'LICENSE'), path.join(fonts, `${family}-LICENSE.txt`));
}

// Fontes-padrão e CMaps ficam em um módulo textual para funcionar também
// em prévias com proxy que não permite fetch de binários. Carregamento sob demanda.
const resourceMap = {};
for (const sub of ['standard_fonts', 'cmaps']) {
  for (const name of await fs.readdir(path.join(pdfRoot, sub))) {
    if (!/\.(pfb|ttf|bcmap)$/.test(name)) continue;
    resourceMap[name] = (await fs.readFile(path.join(pdfRoot, sub, name))).toString('base64');
  }
}
await fs.writeFile(path.join(vendor, 'pdf-resources.js'), `export default ${JSON.stringify(resourceMap)};\n`);
async function listFiles(folder, prefix = './') {
  const result = [];
  for (const item of await fs.readdir(folder, { withFileTypes: true })) {
    if (item.name === 'sw.js') continue;
    const relative = `${prefix}${item.name}`;
    if (item.isDirectory()) result.push(...await listFiles(path.join(folder, item.name), `${relative}/`));
    else result.push(relative);
  }
  return result.sort();
}
const assets = await listFiles(pub);
const hash = createHash('sha256');
const template = await fs.readFile(path.join(root, 'tools/sw-template.js'), 'utf8');
hash.update(template);
for (const name of assets) {
  hash.update(name);
  hash.update(await fs.readFile(path.join(pub, name)));
}
const version = hash.digest('hex').slice(0, 12);
await fs.writeFile(path.join(pub, 'sw.js'), template.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(assets)));
console.log(`PWA Multiversão pronta: ${assets.length} recursos offline, versão ${version}. Nenhum PDF de usuário incluído.`);
