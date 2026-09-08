// Comprobacion de humo: monta index.html en un DOM real, sirve el JSON local y
// verifica que la pagina pinta y que los filtros recalculan sin reventar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(RAIZ, 'web');
const datos = JSON.parse(fs.readFileSync(path.join(WEB, 'data/indicadores.json'), 'utf8'));
const nacional = JSON.parse(fs.readFileSync(path.join(WEB, 'data/nacional.json'), 'utf8'));

const dom = new JSDOM(fs.readFileSync(path.join(WEB, 'index.html'), 'utf8'), {
  url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only',
});
const { window } = dom;
const errores = [];
window.addEventListener('error', (e) => errores.push(e.message));

// stubs de entorno que jsdom no trae
window.fetch = async (u) => String(u).includes('indicadores.json')
  ? { ok: true, status: 200, json: async () => datos }
  : String(u).includes('nacional.json')
    ? { ok: true, status: 200, json: async () => nacional }
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
  ['LIFE entre los programas', () => !!q('[data-prog="LIFE"]')],
  ['participaciones sin pais avisadas', () => /sin país/.test(q('.cifras').textContent)],
  ['enlace a la ficha de LIFE', () => [...window.document.querySelectorAll('#p-proyectos a')].some((a) => a.href.includes('webgate.ec.europa.eu/life'))],
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

// buscador de socio: escribir sugiere, elegir filtra, quitar restaura
q('#f-pais').value = 'ES';
q('#f-pais').dispatchEvent(new window.Event('change'));
await new Promise((r) => setTimeout(r, 200));
const totalAntes = q('.cifra .n').textContent;
const caja = q('#f-socio');
caja.value = 'ibercívis';           // con acento: la busqueda debe ignorarlo
caja.dispatchEvent(new window.Event('input'));
const sugerencias = [...window.document.querySelectorAll('#f-socio-lista [data-i]')];
const sugiereOk = sugerencias.length > 0 && /IBERCIVIS/i.test(sugerencias[0].textContent);
if (!sugiereOk) fallos++;
console.log(`  ${sugiereOk ? 'ok  ' : 'FALLO'} el buscador de socio sugiere (${sugerencias.length} opciones)`);

sugerencias[0]?.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 200));
const totalSocio = q('.cifra .n').textContent;
const notaProy = q('#p-proyectos .nota').textContent;
const cabsSocio = [...q('#p-proyectos thead').querySelectorAll('th')].map((t) => t.textContent.trim());
const filtraOk = totalSocio !== totalAntes && /IBERCIVIS/i.test(notaProy)
  && cabsSocio.some((c) => c.startsWith('Papel de')) && !!q('#f-socio-quitar');
if (!filtraOk) fallos++;
console.log(`  ${filtraOk ? 'ok  ' : 'FALLO'} elegir socio filtra y añade su papel (${totalAntes} -> ${totalSocio})`);

q('#f-socio-quitar').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 200));
const restauraOk = q('.cifra .n').textContent === totalAntes && !!q('#f-socio');
if (!restauraOk) fallos++;
console.log(`  ${restauraOk ? 'ok  ' : 'FALLO'} quitar el socio restaura el total`);

// desde la tabla de entidades tambien se elige socio
const enlaceEnt = q('#p-entidades [data-socio]');
enlaceEnt.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 200));
const desdeTablaOk = q('.cifra .n').textContent !== totalAntes && !!q('#f-socio-quitar');
if (!desdeTablaOk) fallos++;
console.log(`  ${desdeTablaOk ? 'ok  ' : 'FALLO'} pulsar una entidad de la tabla la elige como socio`);

// ---------- pestaña de convocatorias españolas ----------
// Se abre al pulsar la pestaña (carga nacional.json entonces) y tiene sus
// propios filtros, cifras y tablas.
const clic = (n) => n.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const espera = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const okEuropaVisible = !q('#vista-europa').hidden && q('#vista-espana').hidden;
if (!okEuropaVisible) fallos++;
console.log(`  ${okEuropaVisible ? 'ok  ' : 'FALLO'} la pestaña europea es la portada`);

clic(q('#pestana-espana'));
await espera(400);
const okCambio = q('#vista-europa').hidden && !q('#vista-espana').hidden && q('#pestana-espana').getAttribute('aria-selected') === 'true'
  && window.location.hash === '#espana';
if (!okCambio) fallos++;
console.log(`  ${okCambio ? 'ok  ' : 'FALLO'} la pestaña española se muestra y va en la URL (${window.location.hash})`);

const comprobacionesEs = [
  ['cifras españolas', () => q('#cifras-es').querySelectorAll('.cifra').length === 4],
  ['grafico español', () => !!q('#grafico-es svg') && q('#grafico-es svg').querySelectorAll('rect').length > 5],
  ['tabla de CCAA', () => q('#p-ccaa tbody').children.length > 5],
  ['tabla de convocatorias', () => q('#p-convocatorias tbody').children.length > 3],
  ['tabla de entidades', () => q('#p-entidades-es tbody').children.length > 3],
  ['trazabilidad con dos tablas', () => q('#p-vias').querySelectorAll('table').length === 2],
  ['tabla de ayudas', () => q('#p-ayudas tbody').children.length > 10],
  ['los tres financiadores', () => ['AEI', 'FECYT', 'FB'].every((c) => !!q(`[data-fin="${c}"]`))],
  ['filtro de CCAA', () => q('#f-ccaa').options.length > 10],
  ['filtro de años', () => !!q('#f-anio-desde') && !!q('#f-anio-hasta') && !!q('#f-anio-reset')],
  ['filtro de vía', () => window.document.querySelectorAll('[data-via]').length >= 3],
  ['enlaces a las tres fuentes en la tabla', () => {
    const hrefs = [...q('#p-ayudas').querySelectorAll('a')].map((a) => a.href);
    return hrefs.some((h) => h.includes('aei.gob.es')) && hrefs.some((h) => h.includes('fecyt.es')) && hrefs.some((h) => h.includes('fundacion-biodiversidad.es'));
  }],
  ['ayuda en cifras y tablas españolas', () => q('#vista-espana').querySelectorAll('button.ayuda').length >= 12],
  ['pie con las fuentes', () => /AEI/.test(q('#pie-es').textContent) && /FECYT/.test(q('#pie-es').textContent)],
  ['sin errores en consola', () => errores.length === 0],
];
for (const [nombre, fn] of comprobacionesEs) {
  let ok = false, err = '';
  try { ok = fn(); } catch (e) { err = ' — ' + e.message; }
  if (!ok) fallos++;
  console.log(`  ${ok ? 'ok  ' : 'FALLO'} ${nombre}${err}`);
}

// interaccion: quitar un financiador cambia el total
const totalEs = () => q('#cifras-es .cifra .n').textContent;
const antesEs = totalEs();
clic(q('[data-fin="AEI"]'));
await espera();
const despuesEs = totalEs();
const okFin = antesEs !== despuesEs;
if (!okFin) fallos++;
console.log(`  ${okFin ? 'ok  ' : 'FALLO'} quitar un financiador recalcula (${antesEs} -> ${despuesEs})`);
clic(q('[data-fin="AEI"]'));
await espera();

// desplegar el detalle de una ayuda
clic(q('#p-ayudas .desplegar'));
await espera();
const okDetalle = !!q('#p-ayudas .fila-detalle') && /Entra por/.test(q('#p-ayudas .fila-detalle').textContent);
if (!okDetalle) fallos++;
console.log(`  ${okDetalle ? 'ok  ' : 'FALLO'} el detalle de una ayuda se despliega`);

// buscador de entidad
const cajaEs = q('#f-entidad');
cajaEs.value = 'zaragoza';
cajaEs.dispatchEvent(new window.Event('input'));
const sugEs = [...window.document.querySelectorAll('#f-entidad-lista [data-i]')];
const okSug = sugEs.length > 0 && /zaragoza/i.test(sugEs[0].textContent);
if (!okSug) fallos++;
console.log(`  ${okSug ? 'ok  ' : 'FALLO'} el buscador de entidad sugiere (${sugEs.length} opciones)`);
sugEs[0]?.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
await espera();
const okEnt = totalEs() !== antesEs && !!q('#f-entidad-quitar') && /zaragoza/i.test(q('#p-ayudas .nota').textContent);
if (!okEnt) fallos++;
console.log(`  ${okEnt ? 'ok  ' : 'FALLO'} elegir una entidad filtra (${antesEs} -> ${totalEs()})`);
clic(q('#f-entidad-quitar'));
await espera();
const okRest = totalEs() === antesEs;
if (!okRest) fallos++;
console.log(`  ${okRest ? 'ok  ' : 'FALLO'} quitar la entidad restaura el total`);

// filtro de CCAA
q('#f-ccaa').value = 'Aragón';
q('#f-ccaa').dispatchEvent(new window.Event('change'));
await espera();
const okCcaa = totalEs() !== antesEs && [...q('#p-ccaa tbody').children].length === 1;
if (!okCcaa) fallos++;
console.log(`  ${okCcaa ? 'ok  ' : 'FALLO'} filtrar por CCAA deja solo esa comunidad (${totalEs()})`);

// volver a la pestaña europea
clic(q('#pestana-europa'));
await espera();
const okVuelta = !q('#vista-europa').hidden && q('#vista-espana').hidden && window.location.hash === '#europa';
if (!okVuelta) fallos++;
console.log(`  ${okVuelta ? 'ok  ' : 'FALLO'} volver a la pestaña europea`);

if (errores.length) { console.log('\nerrores:'); errores.forEach((e) => console.log('   ', e)); }
console.log(fallos ? `\n${fallos} FALLOS` : '\ntodo correcto');
process.exit(fallos ? 1 : 0);
