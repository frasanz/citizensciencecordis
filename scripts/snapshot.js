// Descarga los datasets de CORDIS, calcula los indicadores y deja en web/data/
// el JSON que consume la web mas los CSV descargables.
//
//   node scripts/snapshot.js                    -> HORIZON, H2020, FP7 y LIFE
//   node scripts/snapshot.js --programas=HORIZON
//   node scripts/snapshot.js --sin-cache
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearAnalisis, crearFiltro, PROGRAMAS } from '../web/src/compute.js';
import { procesarPrograma, descargarPrograma } from './cordis.js';
import {
  descargarProyectosLife, buscarCandidatosLife, descargarFicha, leerFicha, descargarFts, leerFts,
  registroProyecto, registroBaseLegal, registrosParticipacion, leerTablaManual, escribirPendientes,
  claveNombre, grantDe,
} from './life.js';
import { TABLAS } from '../web/src/exportar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(RAIZ, '.cache');
const SALIDA = path.join(RAIZ, 'web', 'data');

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split('=')[1];
const flag = (n) => process.argv.includes(`--${n}`);

const quiero = arg('programas', 'HORIZON,H2020,FP7,LIFE').split(',').filter(Boolean);
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

// Nombre legal -> pais y PIC, con TODAS las organizaciones de CORDIS. Sirve para
// dar pais a los socios de LIFE, que desde 2021 vienen solo con el nombre legal
// del registro de participantes (el mismo que usa CORDIS). Un nombre visto con
// dos paises distintos se descarta: mejor sin pais que con uno equivocado.
const nombresCordis = new Map();
const recogerNombre = (r) => {
  for (const n of [r.name, r.shortName]) {
    if (!n || !r.country) continue;
    const k = claveNombre(n);
    const e = nombresCordis.get(k);
    if (!e) nombresCordis.set(k, { pais: r.country, pic: r.organisationID || '' });
    else if (e.pais !== r.country) e.pais = null;
  }
};

for (const codigo of quiero) {
  const p = PROGRAMAS.find((x) => x.codigo === codigo);
  if (!p) { console.warn(`  aviso: programa desconocido "${codigo}", se omite`); continue; }
  if (!p.archivo) continue;                       // LIFE va despues, necesita los nombres de CORDIS
  const t0 = Date.now();
  const { bytes, ultimaMod } = await bytesDe(p);
  await procesarPrograma(bytes, p.codigo, analisis, quiero.includes('LIFE') ? recogerNombre : null);
  fuentes.push({ codigo: p.codigo, etiqueta: p.etiqueta, periodo: p.periodo, archivo: p.archivo, actualizado: ultimaMod });
  console.log(`  ${p.codigo}: procesado en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

if (quiero.includes('LIFE')) await procesarLife();

// ---------- LIFE ----------
// Volcado completo por la API de CINEA, fichas HTML de los candidatos para leer
// la descripcion, y pais de los socios por la cadena ficha -> CORDIS -> FTS ->
// forma juridica -> tabla manual (datos/life-paises.csv).
async function procesarLife() {
  const p = PROGRAMAS.find((x) => x.codigo === 'LIFE');
  const dir = path.join(CACHE, 'life');
  fs.mkdirSync(path.join(dir, 'fichas'), { recursive: true });
  const t0 = Date.now();

  const conCache = async (nombre, bajar) => {
    const f = path.join(dir, nombre);
    if (usarCache && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    const v = await bajar();
    fs.writeFileSync(f, JSON.stringify(v));
    return v;
  };

  const { proyectos, descargado } = await conCache('proyectos.json', async () => {
    process.stdout.write('  LIFE: descargando proyectos ');
    const lista = await descargarProyectosLife((n, total) => process.stdout.write(`\r  LIFE: descargando proyectos ${n}/${total} `));
    console.log();
    return { proyectos: lista, descargado: new Date().toISOString() };
  });
  const candidatos = new Set(await conCache('candidatos.json', async () => [...await buscarCandidatosLife(frase)]));
  console.log(`  LIFE: ${proyectos.length} proyectos (volcado de ${descargado.slice(0, 10)}), ${candidatos.size} candidatos por el buscador`);

  // Fichas de los candidatos: se guardan una a una, solo se bajan las nuevas.
  const fichas = new Map();
  let bajadas = 0;
  for (const x of proyectos) {
    if (!candidatos.has(x.projectId)) continue;
    const f = path.join(dir, 'fichas', `${x.projectId}.html`);
    if (!usarCache || !fs.existsSync(f)) {
      fs.writeFileSync(f, await descargarFicha(x.projectPublicPageFriendlyUrl));
      bajadas++;
    }
    fichas.set(x.projectId, leerFicha(fs.readFileSync(f, 'utf8')));
  }
  if (bajadas) console.log(`  LIFE: ${bajadas} fichas descargadas`);

  // FTS: solo los años en que rellena el numero de proyecto (desde 2025).
  const grants = new Map();
  for (const x of proyectos) { const g = grantDe(x.reference); if (g && candidatos.has(x.projectId)) grants.set(g, x.projectId); }
  const ftsPorProyecto = new Map();
  fs.mkdirSync(path.join(CACHE, 'fts'), { recursive: true });
  for (let anio = 2025; anio <= new Date().getUTCFullYear(); anio++) {
    const f = path.join(CACHE, 'fts', `${anio}_FTS_dataset_en.csv`);
    let bytes = null;
    if (usarCache && fs.existsSync(f)) bytes = new Uint8Array(fs.readFileSync(f));
    else {
      process.stdout.write(`  FTS ${anio}: descargando `);
      bytes = await descargarFts(anio);
      if (!bytes) { console.log('no publicado todavia'); continue; }
      fs.writeFileSync(f, bytes);
      console.log(`${(bytes.length / 1e6).toFixed(0)} MB`);
    }
    for (const [g, lista] of leerFts(bytes, new Set(grants.keys()))) {
      const id = grants.get(g);
      ftsPorProyecto.set(id, [...(ftsPorProyecto.get(id) ?? []), ...lista]);
    }
  }

  const manual = leerTablaManual(path.join(RAIZ, 'datos', 'life-paises.csv'));
  const cordis = new Map([...nombresCordis].filter(([, e]) => e.pais));
  const pendientes = new Set();
  const vias = new Map();
  let aceptados = 0;

  for (const x of proyectos) {
    const ficha = fichas.get(x.projectId);
    const rec = registroProyecto(x, ficha?.descripcion);
    analisis.proyecto(rec, 'LIFE');
    analisis.baseLegal(registroBaseLegal(x));
    if (!ficha || !filtro(rec)) continue;
    aceptados++;
    for (const s of registrosParticipacion(x, ficha, { cordis, fts: ftsPorProyecto.get(x.projectId) ?? null, manual })) {
      analisis.participacion(s);
      vias.set(s.paisVia, (vias.get(s.paisVia) || 0) + 1);
      if (s.paisVia === 'sin-pais') pendientes.add(s.name);
    }
  }
  escribirPendientes(path.join(RAIZ, 'datos', 'life-paises-pendientes.csv'), pendientes);

  fuentes.push({ codigo: 'LIFE', etiqueta: p.etiqueta, periodo: p.periodo, archivo: 'LIFE public database (CINEA)', actualizado: descargado });
  console.log(`  LIFE: ${aceptados} proyectos cumplen el criterio; pais de los socios por via: ${
    [...vias].map(([v, n]) => `${v} ${n}`).join(', ')}`);
  if (pendientes.size) console.log(`  LIFE: ${pendientes.size} entidades sin pais -> datos/life-paises-pendientes.csv`);
  console.log(`  LIFE: procesado en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
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
