import { withTracking } from '../lib/tracking-html.mjs';
import { cp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { internationalJujuHtml } from '../lib/juju-international.mjs';
import { JUJU_LOCALE_PATHS } from '../lib/juju-locale.cjs';
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
const jujuOriginal = await readFile(path.join(root, 'juju/index.html'), 'utf8');
for (const [locale, destination] of Object.entries(JUJU_LOCALE_PATHS)) {
  await writeFile(path.join(output, destination.slice(1)), internationalJujuHtml(jujuOriginal, locale));
}
async function instrument(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    const relative = path.relative(output, file).split(path.sep).join('/');
    if (relative === 'privame/dashboard') continue;
    if (entry.isDirectory()) { await instrument(file); continue; }
    if (!entry.name.endsWith('.html') || relative === 'app-shell.html') continue;
    const site = relative === 'index.html' ? 'principal' : relative.split('/')[0];
    if (['principal', ...legacyDirectories].includes(site)) await writeFile(file, withTracking(await readFile(file,'utf8'),site));
  }
}
await instrument(output);
console.log('Static output created at dist/.');
