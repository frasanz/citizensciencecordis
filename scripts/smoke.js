// Comprobacion de humo: monta index.html en un DOM real, sirve el JSON local y
// verifica que la pagina pinta y que los filtros recalculan sin reventar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(RAIZ, 'web');
const datos = JSON.parse(fs.readFileSync(path.join(WEB, 'data/indicadores.json'), 'utf8'));

const dom = new JSDOM(fs.readFileSync(path.join(WEB, 'index.html'), 'utf8'), {
  url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only',
});
const { window } = dom;
const errores = [];
window.addEventListener('error', (e) => errores.push(e.message));

// stubs de entorno que jsdom no trae
window.fetch = async (u) => String(u).includes('indicadores.json')
  ? { ok: true, status: 200, json: async () => datos }
  : { ok: false, status: 404 };
window.URL.createObjectURL = () => 'blob:x';
window.URL.revokeObjectURL = () => {};
for (const k of ['document', 'fetch', 'Intl', 'Blob', 'URL', 'MouseEvent', 'Event'])
  Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true });
globalThis.window = window;

await import(pathToFileURL(path.join(WEB, 'app.js')).href);
await new Promise((r) => setTimeout(r, 400));

const q = (s) => window.document.querySelector(s);
const comprobaciones = [
  ['cifras pintadas', () => window.document.querySelectorAll('.cifra').length >= 7],
  ['grafico SVG', () => !!q('#grafico svg') && q('#grafico svg').querySelectorAll('rect').length > 10],
  ['tabla de paises', () => q('#p-paises tbody').children.length > 5],
  ['tabla de subprogramas', () => q('#p-familias tbody').children.length > 3],
  ['tabla de entidades', () => q('#p-entidades tbody').children.length > 3],
  ['tabla de proyectos', () => q('#p-proyectos tbody').children.length > 10],
  ['filtros de programa', () => window.document.querySelectorAll('[data-prog]').length >= 2],
  ['selector de pais', () => q('#f-pais').options.length > 20],
  ['filtro por mes', () => {
    const d = q('#f-desde') || q('#f-desde-a');
    return !!d && !!(q('#f-hasta') || q('#f-hasta-a')) && !!q('#f-reset');
  }],
  ['ayuda en cifras y tablas', () => window.document.querySelectorAll('button.ayuda').length >= 15],
  ['pie con fecha', () => q('#pie').textContent.includes('CORDIS')],
  ['sin errores en consola', () => errores.length === 0],
];

let fallos = 0;
const antes = q('.cifra .n').textContent;
for (const [nombre, fn] of comprobaciones) {
  let ok = false, err = '';
  try { ok = fn(); } catch (e) { err = ' — ' + e.message; }
  if (!ok) fallos++;
  console.log(`  ${ok ? 'ok  ' : 'FALLO'} ${nombre}${err}`);
}

// interaccion: desmarcar H2020 debe cambiar el total
const chipH2020 = q('[data-prog="H2020"]');
if (chipH2020) {
  chipH2020.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 200));
  const despues = q('.cifra .n').textContent;
  const cambio = antes !== despues;
  if (!cambio) fallos++;
  console.log(`  ${cambio ? 'ok  ' : 'FALLO'} filtrar programa recalcula (${antes} -> ${despues})`);
}

// tabla de proyectos: columnas nuevas y ordenacion
const cabsProy = [...q('#p-proyectos thead').querySelectorAll('th')].map((t) => t.textContent.trim());
const okCols = ['Inicio', 'Fin', 'Coordina'].every((c) => cabsProy.includes(c))
  && cabsProy.some((c) => c.startsWith('Entidades de'));
if (!okCols) fallos++;
console.log(`  ${okCols ? 'ok  ' : 'FALLO'} columnas de proyectos (${cabsProy.join(', ')})`);

const fila1 = () => q('#p-proyectos tbody tr').textContent;
const mesOk = /\d{2}\/\d{4}/.test(fila1());
if (!mesOk) fallos++;
console.log(`  ${mesOk ? 'ok  ' : 'FALLO'} fechas en formato mes/año`);

const thInicio = [...q('#p-proyectos thead').querySelectorAll('th')].find((t) => t.textContent.trim() === 'Inicio');
const primeraDesc = fila1();
thInicio.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 150));
const primeraAsc = fila1();
const ordenaOk = primeraDesc !== primeraAsc;
if (!ordenaOk) fallos++;
console.log(`  ${ordenaOk ? 'ok  ' : 'FALLO'} ordenar por fecha invierte la tabla`);

// cambio de pais

q('#f-pais').value = 'IT';
q('#f-pais').dispatchEvent(new window.Event('change'));
await new Promise((r) => setTimeout(r, 200));
const italia = q('#p-entidades h2').textContent;
const okIt = italia.includes('Italia');
if (!okIt) fallos++;
console.log(`  ${okIt ? 'ok  ' : 'FALLO'} cambiar de pais repinta ("${italia}")`);

if (errores.length) { console.log('\nerrores:'); errores.forEach((e) => console.log('   ', e)); }
console.log(fallos ? `\n${fallos} FALLOS` : '\ntodo correcto');
process.exit(fallos ? 1 : 0);
