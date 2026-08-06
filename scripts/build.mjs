import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const files = [
  'manifest.json',
  'background.js',
  'content.js',
  'ocr.js',
  'popup.html',
  'popup.css',
  'popup.js'
];

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'vendor'), { recursive: true });

for (const file of files) {
  await cp(join(root, file), join(dist, file));
}

const vendorFiles = [
  ['node_modules/tesseract.js/dist/tesseract.min.js', 'vendor/tesseract.min.js'],
  ['node_modules/tesseract.js/dist/worker.min.js', 'vendor/worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core.wasm.js', 'vendor/tesseract-core.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core.wasm', 'vendor/tesseract-core.wasm']
];

for (const [source, target] of vendorFiles) {
  await cp(join(root, source), join(dist, target));
}

console.log('Extensão criada em dist/. Carregue essa pasta em chrome://extensions.');
