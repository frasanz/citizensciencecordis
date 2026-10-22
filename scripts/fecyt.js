// FECYT: Convocatoria de ayudas para el fomento de la cultura cientifica,
// tecnologica y de la innovacion. FECYT no publica los proyectos concedidos en
// ningun formato de datos. Lo que hay son dos cosas, y este modulo usa las dos:
//
// 1. El "Listado de resolucion definitiva - Concedidas" de cada año, un PDF con
//    una tabla por linea o categoria de la convocatoria, enlazado desde la
//    pagina de convocatorias anteriores. De el se sacan la comunidad autonoma,
//    los importes y la categoria en la que se concedio cada ayuda, con el
//    nombre literal que le da la resolucion. Se convierte con `pdftotext
//    -bbox-layout` (poppler) y las tablas se reconstruyen por las coordenadas
//    de cada palabra.
// 2. La FICHA RESUMEN de cada proyecto, a la que apunta el enlace "Ver resumen"
//    de cada fila del PDF (desde 2012). Es una pagina HTML con el titulo, la
//    entidad, su localidad y tipo, el resumen, los descriptores y las fechas de
//    ejecucion. Los enlaces se leen del propio PDF con `pdftohtml -xml`, y son
//    ademas la lista de referencias de cada año: cada enlace tiene que casar
//    con una fila de la tabla y cada fila con un enlace.
//
// La linea propia de ciencia ciudadana existe desde 2018 (linea de actuacion 3;
// desde 2022, categoria d.1), asi que aqui el criterio no es solo la frase:
// tambien la categoria.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const URL_CONVOCATORIAS = 'https://www.convocatoria.fecyt.es/Publico/Convocatoria/ConvocatoriasAnteriores.aspx';
export const PRIMER_ANIO = 2012;   // primer año con ficha resumen por proyecto

// El servidor rechaza las conexiones http en claro (las cierra sin responder),
// y la pagina enlaza muchos PDF y fichas por http.
const aHttps = (u) => u.replace(/^http:\/\//i, 'https://');
const CABECERAS = { 'User-Agent': 'Mozilla/5.0' };

async function bajar(url, intentos = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: CABECERAS });
      if (!res.ok) throw new Error(`FECYT devolvio ${res.status} al pedir ${url}`);
      return res;
    } catch (e) {
      if (i >= intentos) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

// ---------- descarga ----------
const desentidad = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
export const quitarHtml = (s) => desentidad(String(s ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

// Un listado de concedidas por año. Hasta 2015 la resolucion definitiva es un
// unico PDF sin denegadas; desde 2016 hay uno de concedidas y otro de
// denegadas. Antes de 2012 no hay ficha resumen, y no se leen.
export function leerListaListados(html) {
  const vistos = new Map();
  for (const m of html.matchAll(/<a[^>]+href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const texto = quitarHtml(m[2]).replace(/\s+/g, ' ');
    const t = texto.match(/^(?:Listado resoluci[oó]n definitiva\s*-\s*Concedidas\s*-\s*Convocatoria|Resoluci[oó]n definitiva Convocatoria)\s+(\d{4})$/i);
    if (!t) continue;
    const anio = +t[1];
    if (anio < PRIMER_ANIO || vistos.has(anio)) continue;
    const url = aHttps(new URL(m[1], URL_CONVOCATORIAS).href);
    vistos.set(anio, { anio, url, archivo: `concedidas-${anio}.pdf`, texto });
  }
  return [...vistos.values()].sort((a, b) => a.anio - b.anio);
}

export async function listarListados() {
  const res = await bajar(URL_CONVOCATORIAS);
  return leerListaListados(await res.text());
}

export async function descargarPdf(url) {
  const res = await bajar(url);
  return new Uint8Array(await res.arrayBuffer());
}

export async function descargarFicha(url) {
  const res = await bajar(url);
  return await res.text();
}

// Descarga en paralelo, de n en n, conservando el orden.
export async function enParalelo(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

function poppler(programa, args) {
  try {
    return execFileSync(programa, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`FECYT necesita ${programa} (poppler) para leer los PDF: brew install poppler / apt-get install poppler-utils`);
    throw e;
  }
}

// Convierte el PDF a XHTML con las coordenadas de cada palabra. Necesita
// poppler (pdftotext); en macOS `brew install poppler`, en Debian/Ubuntu
// `apt-get install poppler-utils`.
export function pdfABbox(rutaPdf) {
  return poppler('pdftotext', ['-bbox-layout', rutaPdf, '-']);
}

// Enlaces "Ver resumen" del PDF: referencia -> URL de la ficha resumen.
// pdftohtml (poppler) es lo unico que saca las anotaciones de enlace.
export function pdfAEnlaces(rutaPdf) {
  return leerEnlaces(poppler('pdftohtml', ['-xml', '-i', '-stdout', rutaPdf]));
}
export function leerEnlaces(xml) {
  const m = new Map();
  for (const p of xml.matchAll(/<page number="(\d+)"[^>]*>([\s\S]*?)<\/page>/g)) {
    for (const a of p[2].matchAll(/<a href="([^"]*?[?&]RF=(\d+)[^"]*)"/g)) if (!m.has(a[2])) m.set(a[2], { url: aHttps(desentidad(a[1])), pagina: +p[1] });
  }
  return m;
}
// Para los años cuyo PDF no lleva enlaces (2014), la ficha esta en la misma URL.
export const urlFicha = (anio, ref) => `https://www.convocatoria.fecyt.es/Publico/${anio}/Formularios_Solicitud/Informes/Ficha_Resumen.aspx?RF=${ref}`;

// ---------- lectura del XHTML de pdftotext ----------
export function leerBbox(xhtml) {
  const paginas = [];
  for (const p of xhtml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)) {
    const palabras = [];
    for (const w of p[3].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)) {
      const x0 = +w[1], y0 = +w[2], x1 = +w[3], y1 = +w[4];
      palabras.push({ x0, y0, x1, y1, h: Math.round((y1 - y0) * 10) / 10, t: desentidad(w[5]).trim() });
    }
    paginas.push({ ancho: +p[1], alto: +p[2], palabras });
  }
  return paginas;
}

// Agrupa palabras en lineas de texto (misma altura de linea, ordenadas por x).
function lineas(palabras, tol = 1.6) {
  const orden = [...palabras].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const out = [];
  for (const w of orden) {
    const l = out[out.length - 1];
    if (l && Math.abs(l.y - w.y0) <= tol) { l.palabras.push(w); continue; }
    out.push({ y: w.y0, palabras: [w] });
  }
  for (const l of out) { l.palabras.sort((a, b) => a.x0 - b.x0); l.texto = l.palabras.map((w) => w.t).join(' '); }
  return out;
}
const texto = (ws) => lineas(ws).map((l) => l.texto).join(' ').replace(/\s+/g, ' ').trim();

// Valor mas frecuente; en caso de empate, el menor (para que sea determinista).
const moda = (valores, redondeo = 1) => {
  const c = new Map();
  for (const v of valores) { const k = Math.round(v / redondeo) * redondeo; c.set(k, (c.get(k) || 0) + 1); }
  let mejor = null, n = 0;
  for (const [k, v] of [...c].sort((a, b) => a[0] - b[0])) if (v > n) { mejor = k; n = v; }
  return mejor;
};

// Pico de una distribucion de x: el valor con mas palabras a +-2 px, dentro de [desde, hasta).
function pico(xs, desde, hasta) {
  let mejor = null, n = 0;
  for (const x of xs) {
    if (x < desde || x >= hasta) continue;
    const c = xs.filter((y) => Math.abs(y - x) <= 2).length;
    if (c > n) { mejor = x; n = c; }
  }
  return mejor;
}

const aNumero = (t) => (t === '-' ? 0 : Number(t.replace(/€/g, '').replace(/\./g, '').replace(',', '.')));

// Palabras que solo aparecen en la cabecera de columnas (se comparan tal cual,
// con mayusculas: los titulos de 2020 y 2021 van en mayusculas y no chocan).
const VOCAB_CABECERA = /^(de|para|gastos|personal|ejecución|ejecucion|amortización|inventariable|final|total|solicitado|Solicitado|financiación|Financiación|Fiinanciación|concesión|Concesión|Propuesta|Presupuesto|Ppto\.?|Ppto\.Solicitado|Pto|Nota|NOTA|criterios|sustan-|tivos|Sustantivos|Criterios|Tipo|Ayuda|concedida|concedido|CONCEDIDO|Importe|IMPORTE|RESUMEN|Resumen|Ficha|FICHA|Ref\.?|REF\.?|Refe-|rencia|Referencia|Título|TÍTULO|TITULO|Entidad|ENTIDAD|CCAA|Posi-|ción|Posición|Mod\.?|MOD\.?|N|\.|O|orden|Categoría|Total|resolución|Resolución|provisional|en|€)$/;
const ES_CABECERA_REF = (t) => /^(Ref\.?|REF\.?|Refe-|Referencia)$/.test(t);

// ---------- comunidades autonomas ----------
// Nombres oficiales y las variantes con que las escriben FECYT y la AEI.
export const CCAA = [
  ['Andalucía', 'andalucia'], ['Aragón', 'aragon'], ['Asturias', 'asturias', 'principado de asturias', 'pdo asturias', 'pdo. asturias'],
  ['Illes Balears', 'illes balears', 'baleares', 'islas baleares', 'i balears', 'islas baleares (illes balears)'],
  ['Canarias', 'canarias', 'islas canarias'], ['Cantabria', 'cantabria'],
  ['Castilla y León', 'castilla y leon', 'castilla-leon', 'castilla leon'],
  ['Castilla-La Mancha', 'castilla-la mancha', 'castilla la mancha'],
  ['Cataluña', 'cataluna', 'catalunya', 'catalonia'],
  ['Comunidad Valenciana', 'comunidad valenciana', 'c valenciana', 'c. valenciana', 'comunitat valenciana', 'valencia', 'c.valenciana'],
  ['Extremadura', 'extremadura'], ['Galicia', 'galicia'],
  ['Madrid', 'madrid', 'comunidad de madrid'], ['Murcia', 'murcia', 'region de murcia'],
  ['Navarra', 'navarra', 'comunidad foral de navarra', 'nafarroa'],
  ['País Vasco', 'pais vasco', 'euskadi'], ['La Rioja', 'la rioja', 'rioja'],
  ['Ceuta', 'ceuta'], ['Melilla', 'melilla'],
];
export const normalizaTexto = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const CCAA_POR_ALIAS = new Map();
for (const [oficial, ...alias] of CCAA) { CCAA_POR_ALIAS.set(normalizaTexto(oficial), oficial); for (const a of alias) CCAA_POR_ALIAS.set(a, oficial); }
const CCAA_SIN_ESPACIOS = new Map([...CCAA_POR_ALIAS].map(([k, v]) => [k.replace(/[\s.-]/g, ''), v]));
export const ccaaDe = (s) => {
  const n = normalizaTexto(s).replace(/\.$/, '');
  return CCAA_POR_ALIAS.get(n) ?? CCAA_SIN_ESPACIOS.get(n.replace(/[\s.-]/g, '')) ?? null;
};

// ---------- reconstruccion de las tablas ----------
// Devuelve las filas de todas las tablas de concedidas del PDF. Cada fila:
// { ref, titulo, entidad, ccaa, presupuesto, solicitado, importe, categoria,
// pagina, enlace }. `enlaces` (referencia -> { url, pagina }) son los enlaces
// "Ver resumen" del PDF: sirven de lista de referencias del año, y cada uno
// tiene que casar con una fila. Una referencia es tambien cualquier numero de
// cuatro o cinco cifras en la columna Ref (2014 no lleva enlaces, y en 2018
// hay una fila sin el suyo). `avisos` recoge lo que no ha cuadrado.
//
// De la tabla solo son imprescindibles la referencia, la CCAA, los importes y
// la categoria: el titulo y la entidad los da mejor la ficha resumen, y aqui
// se leen solo por si falta.
const EXCLUYE_SECCION = /NO\s+CONCEDID|PRECONCEDID|RENUNC|DESIST|DENEGAD|EXCLUID/i;
export function extraerConcedidas(paginas, enlaces = new Map()) {
  const avisos = [];
  const esRef = (t) => enlaces.has(t) || /^\d{4,5}$/.test(t);
  const paginasUtiles = [];

  // Cuerpo de letra de los datos: el de las referencias enlazadas. Se admite
  // hasta 1.4 puntos de diferencia, porque 2018 y 2024 mezclan cuerpos de 8 y
  // 9 puntos en la misma fila; las cabeceras de seccion (11-12) quedan fuera.
  const hDoc = moda(paginas.flatMap((p) => p.palabras.filter((w) => enlaces.size ? enlaces.has(w.t) : /^\d{4,5}$/.test(w.t)).map((w) => w.h)), 0.1);

  for (let i = 0; i < paginas.length; i++) {
    const pag = paginas[i];
    const cabRef = pag.palabras.find((w) => ES_CABECERA_REF(w.t));
    if (!cabRef) continue;
    const yCols = cabRef.y0;
    // La referencia esta en su columna, debajo de la cabecera: se descartan
    // numeros iguales en otras columnas.
    const cand = pag.palabras.filter((w) => esRef(w.t) && w.y0 > yCols + 4);
    if (!cand.length) continue;
    const refEdge = moda(cand.filter((w) => enlaces.size ? enlaces.has(w.t) : true).map((w) => w.x0)) ?? moda(cand.map((w) => w.x0));
    const refs0 = cand.filter((w) => Math.abs(w.x0 - refEdge) <= 6);
    if (!refs0.length) continue;
    const hCapa = refs0.some((w) => Math.abs(w.h - hDoc) <= 1.4) ? hDoc : moda(refs0.map((w) => w.h), 0.1);
    const capa = pag.palabras.filter((w) => Math.abs(w.h - hCapa) <= 1.4);
    const refs = refs0.filter((w) => Math.abs(w.h - hCapa) <= 1.4);
    if (!refs.length) continue;

    // Etiqueta de la seccion: la linea "... CONCEDIDAS ..." de encima de la
    // cabecera de columnas y las sublineas entre ella y la cabecera (Modalidad,
    // Categoría, d.1 ...). Las paginas de renuncias, desistimientos y denegadas
    // se saltan. Hasta 2015 no hay secciones: la categoria la da la ficha.
    const lns = lineas(pag.palabras.filter((w) => w.y0 < yCols - 4));
    if (lns.some((l) => EXCLUYE_SECCION.test(l.texto))) continue;
    const cab = lns.find((l) => /CONCEDID[AO]S/i.test(l.texto));
    let categoria = '';
    if (cab) {
      const hCab = moda(cab.palabras.map((w) => w.h), 0.1);
      const enCapa = (w) => Math.abs(w.h - hCapa) <= 1.4 || Math.abs(w.h - hCab) <= 0.35;
      const sub = lineas(pag.palabras.filter(enCapa)).filter((l) => l.y > cab.y + 2 && l.y < yCols - 12
        && !/CONCEDID[AO]S|^RESOLUCI|^INFORME|^Código|^https?:|^\d+\s*(\/|de)\s*\d+$/i.test(l.texto)
        && !l.palabras.every((w) => VOCAB_CABECERA.test(w.t)));
      const textos = [cab.texto.replace(/^.*?CONCEDID[AO]S[\s.:]*/i, ''), ...sub.map((l) => l.texto)]
        .map((t) => t.replace(/\s+/g, ' ').replace(/\s*\.\s*$/, '').trim()).filter(Boolean);
      categoria = [...new Set(textos)].join(' · ');
    } else if (!lns.some((l) => /RESOLUCI[OÓ]N\s+DEFINITIVA/i.test(l.texto))) {
      avisos.push(`p${i + 1}: tabla sin cabecera de concedidas ni de resolución definitiva; se salta`);
      continue;
    }

    const centros = [...new Map(refs.map((r) => [r.t, r])).values()].sort((a, b) => a.y0 - b.y0);   // primera aparicion de cada ref
    const desde = centros[0].y0 - 24, hasta = centros[centros.length - 1].y0 + 40;   // la ultima celda no pasa de cuatro lineas
    // El numero de pagina ("1/18", "3 de 25") cae dentro de la zona de la ultima fila.
    const zona = capa.filter((w) => w.y0 >= desde && w.y0 < hasta && w.y0 > yCols + 4);
    // Tambien las frases del pie ("La resolución de concesión definitiva está
    // supeditada...", hasta 2015): lineas sin referencia, de varias palabras,
    // que empiezan a la izquierda de la columna del titulo y siguen como una
    // frase (la segunda palabra pegada a la primera; una celda "Mod." junto al
    // titulo deja un hueco).
    const xTitulo = pico(zona.filter((w) => !esRef(w.t) && !/^[\d.,€-]+$/.test(w.t)).map((w) => w.x0), refEdge + 8, refEdge + 110) ?? refEdge + 8;
    const pie = new Set(lineas(zona).filter((l) => /^(\d+\s*\/\s*\d+|\d+\s+de\s+\d+|P[aá]gina\s+\d+.*|Fecha documento:.*)$/i.test(l.texto)
      || (l.palabras.length >= 4 && l.palabras[0].x0 < xTitulo - 3 && !l.palabras.some((w) => esRef(w.t) && Math.abs(w.x0 - refEdge) <= 6)
        && l.palabras[1].x0 - l.palabras[0].x1 < 10)).flatMap((l) => l.palabras));
    const palabras = zona.filter((w) => !pie.has(w) && !(w.y0 < centros[0].y0 - 3 && VOCAB_CABECERA.test(w.t)));

    // Importes: cifras con decimales, o cifras y guiones seguidos de "€" en la misma linea.
    const euros = palabras.filter((w) => w.t === '€');
    const conEuro = (w) => euros.some((e) => Math.abs(e.y0 - w.y0) < 3 && e.x0 >= w.x1 - 1 && e.x0 - w.x1 < 12);
    const esImporte = (w) => /^\d{1,3}(\.\d{3})*,\d{2}€?$/.test(w.t) || (/^(\d{1,3}(\.\d{3})*€?|-)$/.test(w.t) && (w.t.endsWith('€') || conEuro(w)));
    const importes = palabras.filter(esImporte);
    const cifras = importes.filter((w) => w.t !== '-');
    if (!cifras.length) { avisos.push(`p${i + 1}: sin importes`); continue; }
    const amountsStart = Math.min(...cifras.map((w) => w.x0)) - 4;
    const textuales = palabras.filter((w) => !esImporte(w) && w.t !== '€' && w.x0 < amountsStart && w.x0 > refEdge + 8);

    // Zona de la columna CCAA: la cabecera "CCAA" va centrada sobre la columna
    // y los valores tambien, asi que no hay un borde fiable por coordenadas. Se
    // toma una zona generosa a la izquierda de la cabecera y la CCAA se
    // reconoce por su nombre (ver abajo); lo que sobra es de la entidad.
    const xCab = capa.find((w) => w.t === 'CCAA')?.x0 ?? null;
    const xCcaa = xCab != null ? xCab - 80 : amountsStart - 100;
    // Titulo y entidad, solo por si falta la ficha: bordes izquierdos de las dos columnas.
    const xsTe = textuales.filter((w) => w.x0 < xCcaa).map((w) => w.x0);
    const titleEdge = pico(xsTe, refEdge + 8, refEdge + 110);
    const entityEdge = titleEdge != null ? pico(xsTe, titleEdge + 60, xCcaa - 10) : null;
    const celdas = textuales.filter((w) => w.x0 >= (titleEdge ?? refEdge + 8) - 3);

    // Evidencia de la alineacion vertical de las celdas de varias lineas (ver
    // abajo), columna a columna: celdas con lineas encima de la referencia y
    // ninguna a su altura (centradas) frente a celdas con lineas debajo y
    // ninguna encima (pegadas arriba).
    let evCentrado = 0, evArriba = 0;
    const columnas = [[titleEdge ?? 0, entityEdge ?? xCcaa], [entityEdge ?? xCcaa, xCcaa], [xCcaa, Infinity]];
    for (const r of centros) {
      for (const [x0, x1] of columnas) {
        const cerca = celdas.filter((w) => w.x0 >= x0 - 3 && w.x0 < x1 - 3 && Math.abs(w.y0 - r.y0) < 14);
        const enRef = cerca.some((w) => Math.abs(w.y0 - r.y0) < 3);
        const encima = cerca.some((w) => r.y0 - w.y0 >= 3), debajo = cerca.some((w) => w.y0 - r.y0 >= 3);
        if (encima && !enRef) evCentrado++;
        else if (enRef && debajo && !encima) evArriba++;
      }
    }
    paginasUtiles.push({ n: i + 1, categoria, centros, celdas, importes, refEdge, titleEdge, entityEdge, xCcaa, amountsStart, evCentrado, evArriba, todas: pag.palabras });
  }

  // Alineacion vertical de las celdas de varias lineas: hasta 2021 van
  // centradas en la fila; desde 2022, pegadas arriba. Se decide para todo el
  // documento, porque una pagina de filas de una sola linea no da pistas.
  const centrado = paginasUtiles.reduce((s, p) => s + p.evCentrado, 0) > paginasUtiles.reduce((s, p) => s + p.evArriba, 0);

  const filasCrudas = [];
  for (const p of paginasUtiles) {
    const filaMasCercana = (y) => {
      let f = null, d = Infinity;
      for (const c of p.centros) if (Math.abs(c.y0 - y) < d) { f = c; d = Math.abs(c.y0 - y); }
      return f;
    };
    const filaDeArriba = (y) => { let f = null; for (const c of p.centros) if (c.y0 <= y + 3) f = c; return f; };
    const asignaLinea = centrado ? filaMasCercana : filaDeArriba;
    const filas = new Map(p.centros.map((r) => [r.t, { ref: r.t, y: r.y0, pagina: p.n, categoria: p.categoria, titulo: [], entidad: [], ccaa: [], importes: [] }]));
    for (const l of lineas(p.celdas)) {
      const f = filas.get(asignaLinea(l.y)?.t);
      if (!f) continue;
      for (const w of l.palabras) {
        if (w.x0 >= p.xCcaa) f.ccaa.push(w);
        else if (p.entityEdge != null && w.x0 >= p.entityEdge - 3) f.entidad.push(w);
        else f.titulo.push(w);
      }
    }
    // Los importes van a la altura de la referencia. Los que no tienen fila son
    // la linea TOTAL de cada seccion; cualquier otro caso se avisa.
    for (const l of lineas(p.importes)) {
      const f = filas.get(filaMasCercana(l.y)?.t);
      if (f && Math.abs(f.y - l.y) < 8) f.importes.push(...l.palabras);
      else if (!p.todas.some((w) => Math.abs(w.y0 - l.y) < 6 && /^TOTAL:?$/i.test(w.t))) avisos.push(`p${p.n}: importes sin fila (${l.texto})`);
    }
    if (process.env.FECYT_DEBUG) console.error(`[fecyt] p${p.n} "${p.categoria.slice(0, 40)}" ref=${p.refEdge} titulo=${p.titleEdge} entidad=${p.entityEdge} ccaa=${p.xCcaa} importes=${p.amountsStart} ${centrado ? 'centrado' : 'arriba'} (${p.evCentrado}/${p.evArriba}) filas=${p.centros.length}`);
    filasCrudas.push(...filas.values());
  }

  // Formato de los importes, votado en todo el documento. Tras el presupuesto
  // total y el solicitado hay dos disposiciones: hasta 2017 el concedido va el
  // ultimo y antes su desglose (personal + ejecucion); desde 2018 va el tercero
  // y despues su desglose (dos partidas, tres en 2023).
  const suma = (xs) => xs.reduce((a, b) => a + b, 0);
  const cuadraTercero = (imp) => Math.abs(suma(imp.slice(3)) - imp[2]) <= 1;
  const cuadraUltimo = (imp) => Math.abs(suma(imp.slice(2, -1)) - imp[imp.length - 1]) <= 1;
  let concedidoUltimo = 0, concedidoTercero = 0;
  for (const f of filasCrudas) {
    const imp = f.importes.sort((a, b) => a.x0 - b.x0).map((w) => aNumero(w.t));
    if (imp.length < 5) continue;
    const a = cuadraTercero(imp), b = cuadraUltimo(imp);
    if (a && !b) concedidoTercero++;
    else if (b && !a) concedidoUltimo++;
  }
  const ultimo = concedidoUltimo > concedidoTercero;

  const filas = [];
  for (const f of filasCrudas) {
    // La CCAA son las ultimas palabras por la derecha que formen un nombre
    // conocido. Si no cuadra, se reintenta solo con las que estan a la altura
    // de la fila: en 2015 hay una celda partida entre dos paginas.
    let porX = [...f.ccaa].sort((a, b) => b.x0 - a.x0 || a.y0 - b.y0);
    let ccaa = null, k = 0;
    for (const cerca of [false, true]) {
      if (cerca) porX = porX.filter((w) => Math.abs(w.y0 - f.y) <= 14);
      for (let n = 1; n <= Math.min(4, porX.length); n++) {
        const c = ccaaDe(texto(porX.slice(0, n)));
        if (c) { ccaa = c; k = n; }
      }
      if (ccaa) break;
    }
    const sobra = [...f.ccaa].filter((w) => !porX.slice(0, k).includes(w));
    const imp = f.importes.map((w) => aNumero(w.t));
    let presupuesto = null, solicitado = null, importe = null;
    if (imp.length === 1) importe = imp[0];
    else if (imp.length >= 3) {
      [presupuesto, solicitado] = imp;
      importe = ultimo && imp.length >= 4 ? imp[imp.length - 1] : imp[2];
      if (imp.length >= 5) {
        const cuadra = ultimo ? cuadraUltimo(imp) : cuadraTercero(imp);
        if (!cuadra) avisos.push(`p${f.pagina} ref ${f.ref}: el desglose (${imp.join(', ')}) no cuadra con el importe concedido ${importe}`);
      } else if (imp.length === 4) avisos.push(`p${f.pagina} ref ${f.ref}: cuatro importes (${imp.join(', ')}), falta una celda del desglose; concedido ${importe}`);
    }
    if (imp.length === 2) avisos.push(`p${f.pagina} ref ${f.ref}: solo dos importes (${imp.join(', ')})`);
    if (!imp.length) avisos.push(`p${f.pagina} ref ${f.ref}: sin importes`);
    if (!ccaa) avisos.push(`p${f.pagina} ref ${f.ref}: sin CCAA reconocida en "${texto(f.ccaa)}"`);
    const enlace = enlaces.get(f.ref)?.url ?? null;
    if (enlaces.size && !enlace) avisos.push(`p${f.pagina} ref ${f.ref}: sin enlace "Ver resumen" en el PDF; se usa la URL estándar de la ficha`);
    filas.push({
      ref: f.ref, pagina: f.pagina, categoria: f.categoria, enlace,
      titulo: texto(f.titulo), entidad: texto([...f.entidad, ...sobra]), ccaa: ccaa ?? '',
      presupuesto, solicitado, importe,
    });
  }

  // Cada enlace de una pagina leida tiene que tener su fila, y cada fila su enlace.
  const vistas = new Set(filas.map((f) => f.ref));
  const leidas = new Set(paginasUtiles.map((p) => p.n));
  for (const [ref, e] of enlaces) if (leidas.has(e.pagina) && !vistas.has(ref)) avisos.push(`p${e.pagina} ref ${ref}: tiene enlace "Ver resumen" pero no se ha leído su fila`);
  const repetidas = filas.map((f) => f.ref).filter((r, i, a) => a.indexOf(r) !== i);
  for (const r of new Set(repetidas)) avisos.push(`ref ${r}: aparece en más de una fila`);

  const secciones = [];
  for (const p of paginasUtiles) {
    const u = secciones[secciones.length - 1];
    if (u && u.categoria === p.categoria) u.paginas.push(p.n); else secciones.push({ categoria: p.categoria, paginas: [p.n] });
  }
  return { filas, secciones, avisos };
}

// ---------- ficha resumen ----------
// Campos por el id de su <span>, estables desde 2012.
// El id del valor es el nombre solo o con un prefijo acabado en "_"; el de
// la etiqueta lleva una "L" delante (LTBSolicitudesTitulo) y no vale.
const campoFicha = (html, id) => {
  const m = html.match(new RegExp(`id="(?:[^"]*_)?${id}"[^>]*>([\\s\\S]*?)</span>`));
  return m ? quitarHtml(m[1]) : '';
};
const fechaIso = (s) => { const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
export function leerFicha(html) {
  if (!/FICHA RESUMEN/.test(html)) return null;
  const f = {
    referencia: campoFicha(html, 'lblReferencia'),
    modalidad: campoFicha(html, 'TBSolicitudesModalidad'),
    titulo: campoFicha(html, 'TBSolicitudesTitulo'),
    entidad: campoFicha(html, 'TBEntidadEntidad'),
    centro: campoFicha(html, 'TBCentrosCentro'),
    localidad: campoFicha(html, 'TBCentrosLocalidad'),
    tipoEntidad: campoFicha(html, 'TBEntidadTipoInstitucion'),
    caracter: campoFicha(html, 'TBEntidadNaturalezaJuridica'),
    resumen: campoFicha(html, 'TBSolicitudesResumen'),
    descriptores: campoFicha(html, 'TBSolicitudesTags').replace(/;\s*$/, ''),
    inicio: fechaIso(campoFicha(html, 'TBSolicitudesFechaIni')),
    fin: fechaIso(campoFicha(html, 'TBSolicitudesFechaFin')),
  };
  return f.referencia && f.titulo ? f : null;
}
// La referencia de la ficha (FCT-18-14225) tiene que ser la de la fila y del año.
export const fichaCasa = (ficha, anio, ref) => new RegExp(`-${String(anio).slice(-2)}-0*${ref}$`).test(ficha?.referencia ?? '');

// ---------- integracion ----------
export const ES_CIENCIA_CIUDADANA = /ciencia\s+ciudadana/i;

export function registroFecyt(fila, anio, ficha, url) {
  return {
    id: `FECYT:${anio}-${fila.ref}`,
    financiador: 'FECYT',
    convocatoria: `Fomento de la cultura científica ${anio}`,
    anio,
    referencia: ficha?.referencia || `${anio}/${fila.ref}`,
    titulo: ficha?.titulo || fila.titulo,
    resumen: ficha?.resumen || '',
    palabrasClave: ficha?.descriptores || '',
    categoria: fila.categoria || ficha?.modalidad || '',
    entidad: ficha?.entidad || fila.entidad,
    tipoEntidad: [ficha?.tipoEntidad, ficha?.caracter].filter(Boolean).join(', '),
    cif: '',
    ccaa: fila.ccaa,
    ccaaVia: fila.ccaa ? 'fuente' : 'sin-ccaa',
    localidad: ficha?.localidad || '',
    localizacion: '',
    inicio: ficha?.inicio || '',
    fin: ficha?.fin || '',
    importe: fila.importe ?? 0,
    presupuesto: fila.presupuesto ?? 0,
    fondo: '',
    url,
  };
}
