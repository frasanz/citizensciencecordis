// Descarga los datasets de CORDIS, calcula los indicadores y deja en web/data/
// el JSON que consume la web mas los CSV descargables.
//
//   node scripts/snapshot.js                    -> HORIZON, H2020 y FP7
//   node scripts/snapshot.js --programas=HORIZON
//   node scripts/snapshot.js --sin-cache
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearAnalisis, crearFiltro, PROGRAMAS } from '../web/src/compute.js';
import { procesarPrograma, descargarPrograma } from './cordis.js';
import { TABLAS } from '../web/src/exportar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(RAIZ, '.cache');
const SALIDA = path.join(RAIZ, 'web', 'data');

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split('=')[1];
const flag = (n) => process.argv.includes(`--${n}`);

const quiero = arg('programas', 'HORIZON,H2020,FP7').split(',').filter(Boolean);
const frase = arg('frase', 'citizen science');
const campos = arg('campos', 'objective,title').split(',');
const usarCache = !flag('sin-cache');

// La fecha que interesa es la del volcado en CORDIS (cabecera Last-Modified),
// no la del fichero local: si no, tras usar la cache la web diria que el dato es
// de hoy cuando en realidad puede tener semanas. Se guarda junto al ZIP.
async function bytesDe(p) {
  const destino = path.join(CACHE, p.archivo);
  const meta = `${destino}.json`;
  if (usarCache && fs.existsSync(destino) && fs.existsSync(meta)) {
    const { ultimaMod } = JSON.parse(fs.readFileSync(meta, 'utf8'));
    const st = fs.statSync(destino);
    console.log(`  ${p.codigo}: cache (${(st.size / 1e6).toFixed(0)} MB, volcado de ${ultimaMod})`);
    return { bytes: new Uint8Array(fs.readFileSync(destino)), ultimaMod };
  }
  process.stdout.write(`  ${p.codigo}: descargando `);
  const r = await descargarPrograma(p.archivo);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(destino, r.bytes);
  fs.writeFileSync(meta, JSON.stringify({ ultimaMod: r.ultimaMod, descargado: new Date().toISOString() }));
  console.log(`${(r.bytes.length / 1e6).toFixed(0)} MB (volcado de ${r.ultimaMod})`);
  return r;
}

console.log(`Filtro: "${frase}" en ${campos.join(' + ')}`);
console.log(`Programas: ${quiero.join(', ')}\n`);

const filtro = crearFiltro({ frase, campos });
const analisis = crearAnalisis({ filtro });
const fuentes = [];

for (const codigo of quiero) {
  const p = PROGRAMAS.find((x) => x.codigo === codigo);
  if (!p) { console.warn(`  aviso: programa desconocido "${codigo}", se omite`); continue; }
  const t0 = Date.now();
  const { bytes, ultimaMod } = await bytesDe(p);
  await procesarPrograma(bytes, p.codigo, analisis);
  fuentes.push({ codigo: p.codigo, etiqueta: p.etiqueta, periodo: p.periodo, archivo: p.archivo, actualizado: ultimaMod });
  console.log(`  ${p.codigo}: procesado en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const r = analisis.resultado();
r.meta.fuentes = fuentes;

fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(path.join(SALIDA, 'indicadores.json'), JSON.stringify(r));
for (const [nombre, fn] of Object.entries(TABLAS)) {
  fs.writeFileSync(path.join(SALIDA, `${nombre}.csv`), fn(r));
}

const kb = (f) => (fs.statSync(path.join(SALIDA, f)).size / 1024).toFixed(0).padStart(6);
console.log(`\n--- resultado ---`);
console.log(`proyectos            ${String(r.resumen.totalProyectos).padStart(6)}`);
console.log(`  ${r.programas.map((p) => `${p.clave}: ${p.proyectos}`).join('  ')}`);
console.log(`organizaciones unicas${String(r.resumen.organizacionesUnicas).padStart(6)}`);
console.log(`participaciones      ${String(r.resumen.participaciones).padStart(6)}`);
console.log(`espanoles            ${String(r.resumen.focoProyectos).padStart(6)}  (${r.resumen.focoPctProyectos.toFixed(1)}%)`);
console.log(`  coordinados        ${String(r.resumen.focoCoordinados).padStart(6)}  (${r.resumen.focoPctCoordinados.toFixed(1)}%)`);
console.log(`  entidades          ${String(r.resumen.focoOrganizaciones).padStart(6)}  (${r.resumen.focoPctOrganizaciones.toFixed(1)}%)`);
console.log(`  aportacion      ${(r.resumen.focoAportacionNeta / 1e6).toFixed(1).padStart(9)} M EUR  (${r.resumen.focoPctAportacion.toFixed(1)}%)`);
console.log(`\n--- ficheros en web/data/ ---`);
for (const f of fs.readdirSync(SALIDA)) console.log(`${kb(f)} KB  ${f}`);
