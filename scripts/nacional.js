// Convocatorias españolas: orquesta la descarga y la lectura de AEI, FECYT y
// Fundacion Biodiversidad, aplica el criterio, resuelve la comunidad autonoma
// de cada entidad y devuelve los registros ya normalizados. Lo llama
// snapshot.js; cada fuente vive en su propio modulo.
import fs from 'node:fs';
import path from 'node:path';
import { crearFiltroNacional, FINANCIADORES, claveNombre, tipoDeConvocatoria } from '../web/src/nacional.js';
import { descargarTextoAei, urlCsvAei, leerCsvAei, registroAei, CAMPOS_AEI } from './aei.js';
import { listarListados, descargarPdf, descargarFicha as descargarFichaFecyt, pdfABbox, pdfAEnlaces, leerBbox, extraerConcedidas, leerFicha as leerFichaFecyt, fichaCasa, urlFicha, enParalelo, registroFecyt, ES_CIENCIA_CIUDADANA, ccaaDe, URL_CONVOCATORIAS } from './fecyt.js';
import { PROGRAMAS_FB, listarTipo, listarTerminos, descargarFicha, leerFicha, registroFb, ccaaDeLocalizacion, quitarHtml, BASE_FB } from './biodiversidad.js';

const slug = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

// ---------- comunidad autonoma por el nombre de la entidad ----------
// Solo cuando el nombre apunta a UNA unica comunidad. Se evitan los topónimos
// que tambien son apellidos o nombres comunes (Leon, Cuenca, Palma, Santander).
const NOMBRES_CCAA = {
  'Andalucía': /\b(ANDALUZ[AO]?|ANDALUCIA|SEVILLA|MALAGA|GRANADA|CORDOBA|CADIZ|HUELVA|JAEN|ALMERIA|DONANA)\b/,
  'Aragón': /\b(ARAGON|ARAGONES[A]?|ZARAGOZA|HUESCA|TERUEL)\b/,
  'Asturias': /\b(ASTURIAS|ASTURIAN[AO]|OVIEDO|GIJON)\b/,
  'Illes Balears': /\b(BALEARS?|BALEARES|MALLORCA|MENORCA|IBIZA|EIVISSA|FORMENTERA|PITIUS[AE]S)\b/,
  'Canarias': /\b(CANARIAS?|CANARIO|TENERIFE|LAS PALMAS|GRAN CANARIA|LANZAROTE|FUERTEVENTURA|LA GOMERA|EL HIERRO|LA LAGUNA)\b/,
  'Cantabria': /\b(CANTABRIA|CANTABR[AO])\b/,
  'Castilla y León': /\b(CASTILLA Y LEON|BURGOS|SALAMANCA|VALLADOLID|ZAMORA|PALENCIA|SORIA|SEGOVIA|AVILA)\b/,
  'Castilla-La Mancha': /\b(CASTILLA LA MANCHA|TOLEDO|CIUDAD REAL|GUADALAJARA|ALBACETE)\b/,
  'Cataluña': /\b(CATALUNYA|CATALUNA|CATALAN[AE]?S?|BARCELONA|GIRONA|LLEIDA|TARRAGONA|CATALA)\b/,
  'Comunidad Valenciana': /\b(VALENCIA|VALENCIAN[AO]S?|COMUNITAT VALENCIANA|ALICANTE|ALACANT|CASTELLON|CASTELLO)\b/,
  'Extremadura': /\b(EXTREMADURA|EXTREMEN[AO]S?|BADAJOZ|CACERES)\b/,
  'Galicia': /\b(GALICIA|GALEG[AO]S?|GALLEG[AO]S?|A CORUNA|CORUNA|LUGO|OURENSE|PONTEVEDRA|VIGO|SANTIAGO DE COMPOSTELA)\b/,
  'Madrid': /\b(MADRID|MADRILEN[AO]S?)\b/,
  'Murcia': /\b(MURCIA|MURCIAN[AO]S?|CARTAGENA)\b/,
  'Navarra': /\b(NAVARRA|NAFARROA|PAMPLONA)\b/,
  'País Vasco': /\b(EUSKADI|EUSKAL|VASC[AO]S?|BIZKAIA|VIZCAYA|GIPUZKOA|GUIPUZCOA|ARABA|ALAVA|BILBAO|DONOSTIA|SAN SEBASTIAN|VITORIA GASTEIZ)\b/,
  'La Rioja': /\b(LA RIOJA|RIOJAN[AO]S?|LOGRONO)\b/,
};
export function ccaaPorNombre(entidad) {
  const n = claveNombre(entidad);
  const casan = Object.entries(NOMBRES_CCAA).filter(([, re]) => re.test(n)).map(([c]) => c);
  return casan.length === 1 ? casan[0] : null;
}

// datos/ccaa-entidades.csv: nombre;ccaa;fuente. La unica tabla que edita una persona.
export function leerTablaCcaa(ruta) {
  const m = new Map();
  if (!fs.existsSync(ruta)) return m;
  for (const l of fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1)) {
    const [nombre, ccaa] = l.split(';');
    const c = ccaa && ccaaDe(ccaa.trim());
    if (nombre && c) m.set(claveNombre(nombre), c);
  }
  return m;
}
export function escribirPendientesCcaa(ruta, pendientes) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, ['nombre;ccaa;fuente', ...[...pendientes].sort().map((n) => `${n};;`), ''].join('\n'));
}

// ---------- orquestacion ----------
export async function procesarNacional({ raiz, cache, usarCache, quiero, filtro = crearFiltroNacional(), log = console.log }) {
  const ayudas = [];
  const fuentes = [];
  const avisos = [];
  const leer = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const conCache = async (f, bajar) => {
    if (usarCache && fs.existsSync(f)) return leer(f);
    const v = await bajar();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(v));
    return v;
  };

  // ---- AEI ----
  if (quiero.includes('AEI')) {
    const t0 = Date.now();
    const dir = path.join(cache, 'aei');
    fs.mkdirSync(dir, { recursive: true });
    const candidatos = new Map();   // referencia -> { fila, campos: Set }
    let descargado = null;
    let consultas = 0;
    for (const campo of Object.keys(CAMPOS_AEI)) {
      for (const frase of filtro.definicion.frases) {
        const f = path.join(dir, `${campo}-${slug(frase)}.json`);
        const { csv, fecha } = await conCache(f, async () => {
          consultas++;
          return { csv: await descargarTextoAei(urlCsvAei(campo, frase)), fecha: new Date().toISOString() };
        });
        descargado = descargado && descargado > fecha ? descargado : fecha;
        for (const fila of leerCsvAei(csv)) {
          if (!fila.Referencia) continue;
          let c = candidatos.get(fila.Referencia);
          if (!c) candidatos.set(fila.Referencia, c = { fila, campos: new Set() });
          c.campos.add(campo);
        }
      }
    }
    let aceptadas = 0;
    const porVia = new Map();
    for (const { fila, campos } of candidatos.values()) {
      const rec = registroAei(fila, null);
      let via = filtro(rec);
      // Las palabras clave no vienen en el CSV: si solo casa por ellas, se acepta anotandolo.
      if (!via && campos.has('palabras-clave')) via = 'palabras-clave';
      if (!via) { avisos.push(`AEI ${fila.Referencia}: el buscador lo devuelve por ${[...campos].join('/')} pero la frase no aparece en título ni resumen; se omite`); continue; }
      rec.via = via;
      ayudas.push(rec);
      aceptadas++;
      porVia.set(via, (porVia.get(via) || 0) + 1);
    }
    fuentes.push({ codigo: 'AEI', etiqueta: 'AEI', nombre: 'Buscador de ayudas concedidas de la AEI', url: 'https://www.aei.gob.es/ayudas-concedidas/buscador-ayudas-concedidas',
      actualizado: descargado, leidos: candidatos.size, aceptados: aceptadas });
    log(`  AEI: ${candidatos.size} candidatos del buscador${consultas ? ` (${consultas} consultas)` : ' (cache)'}, ${aceptadas} cumplen el criterio (${[...porVia].map(([v, n]) => `${v} ${n}`).join(', ')}) en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  // ---- FECYT ----
  // El listado de concedidas de cada año (PDF) da la CCAA, los importes y la
  // categoria; la ficha resumen de cada proyecto (HTML, enlazada desde el PDF)
  // da el titulo, la entidad, el resumen, los descriptores y las fechas.
  if (quiero.includes('FECYT')) {
    const t0 = Date.now();
    const dir = path.join(cache, 'fecyt');
    fs.mkdirSync(path.join(dir, 'fichas'), { recursive: true });
    const lista = await conCache(path.join(dir, 'listados.json'), async () => ({ listados: await listarListados(), fecha: new Date().toISOString() }));
    let leidas = 0, aceptadas = 0, bajados = 0, fichasBajadas = 0, sinFicha = 0;
    const porVia = new Map();
    const anios = [];
    for (const r of lista.listados) {
      const pdf = path.join(dir, r.archivo);
      if (!usarCache || !fs.existsSync(pdf)) { fs.writeFileSync(pdf, await descargarPdf(r.url)); bajados++; }
      const bbox = `${pdf}.bbox.html`, enl = `${pdf}.enlaces.json`;
      const viejo = (f) => !fs.existsSync(f) || fs.statSync(f).mtimeMs < fs.statSync(pdf).mtimeMs;
      if (viejo(bbox)) fs.writeFileSync(bbox, pdfABbox(pdf));
      if (viejo(enl)) fs.writeFileSync(enl, JSON.stringify([...pdfAEnlaces(pdf)]));
      const enlaces = new Map(JSON.parse(fs.readFileSync(enl, 'utf8')));
      const { filas, avisos: av } = extraerConcedidas(leerBbox(fs.readFileSync(bbox, 'utf8')), enlaces);
      for (const a of av) avisos.push(`FECYT ${r.anio}: ${a}`);
      leidas += filas.length;

      // Fichas: todas, porque el criterio se aplica sobre el resumen. Solo se
      // guarda en cache la que es de verdad la de esa solicitud.
      let k = 0;
      const fichas = await enParalelo(filas, 6, async (fila) => {
        const url = fila.enlace ?? urlFicha(r.anio, fila.ref);
        const f = path.join(dir, 'fichas', `${r.anio}-${fila.ref}.html`);
        let html = usarCache && fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
        if (html == null) {
          // Algun enlace apunta a la ruta del area de usuario (2012): se
          // reintenta con la URL publica de la ficha.
          try { html = await descargarFichaFecyt(url); } catch (e) {
            if (url === urlFicha(r.anio, fila.ref)) { avisos.push(`FECYT ${r.anio} ref ${fila.ref}: no se ha podido bajar la ficha (${e.message})`); return { url, ficha: null }; }
            try { html = await descargarFichaFecyt(urlFicha(r.anio, fila.ref)); } catch (e2) { avisos.push(`FECYT ${r.anio} ref ${fila.ref}: no se ha podido bajar la ficha (${e.message}; ni ${e2.message})`); return { url, ficha: null }; }
          }
          fichasBajadas++;
          process.stdout.write(`\r  FECYT ${r.anio}: fichas ${++k}/${filas.length} `);
        }
        const ficha = leerFichaFecyt(html);
        if (!ficha) { avisos.push(`FECYT ${r.anio} ref ${fila.ref}: la ficha no tiene el formato esperado (${url})`); return { url, ficha: null }; }
        if (!fichaCasa(ficha, r.anio, fila.ref)) { avisos.push(`FECYT ${r.anio} ref ${fila.ref}: la ficha es de otra solicitud (${ficha.referencia}; ${url})`); return { url, ficha: null }; }
        if (!fs.existsSync(f) || !usarCache) fs.writeFileSync(f, html);
        return { url, ficha };
      });
      if (k) process.stdout.write('\n');

      let n = 0;
      filas.forEach((fila, i) => {
        const { url, ficha } = fichas[i];
        if (!ficha) sinFicha++;
        const rec = registroFecyt(fila, r.anio, ficha, url);
        // Titulo o resumen; si no, la linea de ciencia ciudadana de la
        // convocatoria; si no, los descriptores de la ficha (el filtro se
        // aplica sobre ellos como si fueran un titulo).
        let via = filtro(rec);
        if (!via && ES_CIENCIA_CIUDADANA.test(rec.categoria)) via = 'categoria';
        if (!via && rec.palabrasClave && filtro({ titulo: rec.palabrasClave })) via = 'palabras-clave';
        if (!via) return;
        rec.via = via;
        ayudas.push(rec);
        aceptadas++; n++;
        porVia.set(via, (porVia.get(via) || 0) + 1);
      });
      anios.push(`${r.anio}: ${filas.length} concedidas, ${n} de ciencia ciudadana`);
    }
    fuentes.push({ codigo: 'FECYT', etiqueta: 'FECYT', nombre: 'Listados de concedidas de la convocatoria de fomento de la cultura científica y ficha resumen de cada proyecto', url: URL_CONVOCATORIAS,
      actualizado: lista.fecha, leidos: leidas, aceptados: aceptadas, anios: lista.listados.map((r) => r.anio) });
    log(`  FECYT: ${lista.listados.length} listados de concedidas (${lista.listados[0]?.anio}-${lista.listados[lista.listados.length - 1]?.anio})${bajados ? ` (${bajados} descargados)` : ' (cache)'}, ${leidas} ayudas concedidas, ${fichasBajadas} fichas descargadas${sinFicha ? `, ${sinFicha} sin ficha` : ''}, ${aceptadas} de ciencia ciudadana (${[...porVia].map(([v, n]) => `${v} ${n}`).join(', ')}) en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    for (const a of anios) log(`    ${a}`);
  }

  // ---- Fundacion Biodiversidad ----
  if (quiero.includes('FB')) {
    const t0 = Date.now();
    const dir = path.join(cache, 'biodiversidad');
    fs.mkdirSync(path.join(dir, 'fichas'), { recursive: true });
    const terminosRaw = await conCache(path.join(dir, 'terminos.json'), async () => ({
      financiacion: [...await listarTerminos('financiaci_n')], lineas: [...await listarTerminos('lineas_actuacion_tematicas')],
    }));
    const terminos = { financiacion: new Map(terminosRaw.financiacion), lineas: new Map(terminosRaw.lineas) };
    let leidas = 0, descargado = null, bajadas = 0;
    const candidatos = new Map();   // id -> entrada
    for (const tipo of Object.keys(PROGRAMAS_FB)) {
      const { entradas, buscador, fecha } = await conCache(path.join(dir, `${tipo}.json`), async () => {
        process.stdout.write(`  Fundación Biodiversidad: ${tipo} `);
        const entradas = await listarTipo(tipo, (n, total) => process.stdout.write(`\r  Fundación Biodiversidad: ${tipo} ${n} `));
        // El buscador de la web tambien indexa campos que la API no devuelve
        // (objetivos): sus resultados se suman como candidatos.
        const buscador = new Set();
        for (const frase of filtro.definicion.frases) {
          const res = await fetch(`${BASE_FB}/wp-json/wp/v2/${tipo}?per_page=100&search=${encodeURIComponent(frase)}&_fields=id`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (res.ok) for (const d of await res.json()) buscador.add(d.id);
        }
        console.log();
        return { entradas, buscador: [...buscador], fecha: new Date().toISOString() };
      });
      descargado = descargado && descargado > fecha ? descargado : fecha;
      leidas += entradas.length;
      for (const e of entradas) if (filtro({ titulo: e.titulo, resumen: e.descripcion }) || buscador.includes(e.id)) candidatos.set(e.id, e);
    }
    let aceptadas = 0, descartadas = 0;
    const porVia = new Map();
    for (const e of candidatos.values()) {
      const f = path.join(dir, 'fichas', `${e.id}.html`);
      if (!usarCache || !fs.existsSync(f)) { fs.writeFileSync(f, await descargarFicha(e.url)); bajadas++; }
      const ficha = leerFicha(fs.readFileSync(f, 'utf8'));
      const rec = registroFb(e, ficha, terminos);
      const via = filtro(rec);
      // El buscador de la web casa palabra a palabra ("ciencia" y "ciudadana"
      // sueltas): lo que devuelve sin la frase exacta no cumple el criterio.
      if (!via) { descartadas++; continue; }
      rec.via = via;
      ayudas.push(rec);
      aceptadas++;
      porVia.set(via, (porVia.get(via) || 0) + 1);
    }
    fuentes.push({ codigo: 'FB', etiqueta: 'Fundación Biodiversidad', nombre: 'Buscador de proyectos de la Fundación Biodiversidad (API de su web)', url: 'https://fundacion-biodiversidad.es/buscador-de-proyectos/',
      actualizado: descargado, leidos: leidas, aceptados: aceptadas });
    log(`  Fundación Biodiversidad: ${leidas} fichas leídas, ${candidatos.size} candidatas${bajadas ? ` (${bajadas} fichas descargadas)` : ''}, ${aceptadas} cumplen el criterio (${[...porVia].map(([v, n]) => `${v} ${n}`).join(', ')}), ${descartadas} del buscador sin la frase exacta, en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  // ---- comunidad autonoma: cadena de fuentes ----
  // fuente (AEI, FECYT) -> cruce por nombre con AEI/FECYT -> localizacion de la
  // ficha (Fundacion Biodiversidad) -> localidad de la entidad (ficha de FECYT)
  // -> nombre de la entidad -> tabla manual.
  const porNombre = new Map();
  for (const a of ayudas) {
    if (a.ccaaVia !== 'fuente' || !a.ccaa) continue;
    const k = claveNombre(a.entidad);
    const e = porNombre.get(k);
    if (!e) porNombre.set(k, a.ccaa);
    else if (e !== a.ccaa) porNombre.set(k, null);   // mismo nombre con dos CCAA: mejor sin que mal
  }
  const manual = leerTablaCcaa(path.join(raiz, 'datos', 'ccaa-entidades.csv'));
  const pendientes = new Set();
  const vias = new Map();
  for (const a of ayudas) {
    if (!a.ccaa) {
      const k = claveNombre(a.entidad);
      const cruce = porNombre.get(k);
      const loc = a.localizacion ? ccaaDeLocalizacion(a.localizacion) : null;
      const localidad = a.localidad ? ccaaPorNombre(a.localidad) : null;
      const nombre = ccaaPorNombre(a.entidad);
      if (cruce) { a.ccaa = cruce; a.ccaaVia = 'cruce'; }
      else if (loc) { a.ccaa = loc; a.ccaaVia = 'localizacion'; }
      else if (localidad) { a.ccaa = localidad; a.ccaaVia = 'localidad'; }
      else if (nombre) { a.ccaa = nombre; a.ccaaVia = 'nombre'; }
      else if (manual.get(k)) { a.ccaa = manual.get(k); a.ccaaVia = 'manual'; }
      else { a.ccaa = ''; a.ccaaVia = 'sin-ccaa'; if (a.entidad) pendientes.add(a.entidad); }
    }
    vias.set(a.ccaaVia, (vias.get(a.ccaaVia) || 0) + 1);
  }
  escribirPendientesCcaa(path.join(raiz, 'datos', 'ccaa-entidades-pendientes.csv'), pendientes);
  log(`  CCAA de la entidad por vía: ${[...vias].map(([v, n]) => `${v} ${n}`).join(', ')}`);
  if (pendientes.size) log(`  ${pendientes.size} entidades sin CCAA -> datos/ccaa-entidades-pendientes.csv`);

  for (const a of ayudas) a.tipo = a.financiador === 'AEI' ? tipoDeConvocatoria(a.convocatoria) : 'proyecto';

  ayudas.sort((a, b) => (b.anio || 0) - (a.anio || 0) || a.id.localeCompare(b.id));
  return { ayudas, fuentes, avisos };
}
