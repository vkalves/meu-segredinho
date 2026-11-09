import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const legacyDirectories = ['bianca', 'eliane', 'juju', 'nicolle', 'privame', 'vejamais'];
const rootAssets = ['index.html', 'biancaperfil.jpeg', 'elianeperfil.jpg', 'imagem.jpg', 'jujup.jpg', 'nicollep.jpg'];
const publicExtensions = new Set([
  '.html', '.css', '.js', '.mjs', '.svg', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif',
  '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm', '.json', '.xml', '.txt',
]);
const publicFileFilter = (source) => {
  const extension = path.extname(source).toLowerCase();
  return !extension || publicExtensions.has(extension);
};

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of rootAssets) {
  await cp(path.join(root, name), path.join(output, name), { force: true });
}
for (const name of legacyDirectories) {
  await cp(path.join(root, name), path.join(output, name), {
    recursive: true,
    force: true,
    filter: publicFileFilter,
  });
}
await cp(path.join(root, 'public'), output, { recursive: true, force: true });
console.log('Static output created at dist/.');
