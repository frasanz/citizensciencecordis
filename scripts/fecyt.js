// FECYT: Convocatoria de ayudas para el fomento de la cultura cientifica,
// tecnologica y de la innovacion. FECYT no publica los proyectos concedidos en
// ningun formato de datos: solo el PDF de la resolucion definitiva de cada año,
// con una tabla por categoria. Este modulo baja esos PDF, los convierte con
// `pdftotext -bbox-layout` (poppler) y reconstruye las tablas a partir de las
// coordenadas de cada palabra.
//
// Lo que se saca de cada fila: referencia, titulo, entidad, comunidad autonoma,
// presupuesto total, presupuesto solicitado e importe concedido. Y la categoria
// de la convocatoria en la que se concedio, con el nombre literal que le da la
// resolucion. Desde 2020 la convocatoria tiene una linea propia de ciencia
// ciudadana, asi que aqui el criterio no es solo la frase: tambien la categoria.
//
// La resolucion no trae descripcion de los proyectos. Solo el titulo.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const URL_RESOLUCIONES = 'https://www.convocatoria.fecyt.es/publico/Resolucion/resolucion.aspx';

// ---------- descarga ----------
export async function listarResoluciones() {
  const res = await fetch(URL_RESOLUCIONES, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`FECYT devolvio ${res.status} al pedir la lista de resoluciones`);
  const html = await res.text();
  const vistos = new Map();
  for (const m of html.matchAll(/href="([^"]*Resolucion_definitiva_convocatoria_[^"]*?(\d{4})\.pdf)"/gi)) {
    const anio = +m[2];
    if (vistos.has(anio)) continue;
    const url = new URL(m[1], URL_RESOLUCIONES).href;
    vistos.set(anio, { anio, url, archivo: `resolucion-${anio}.pdf` });
  }
  return [...vistos.values()].sort((a, b) => a.anio - b.anio);
}

export async function descargarPdf(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`FECYT devolvio ${res.status} al pedir ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

// Convierte el PDF a XHTML con las coordenadas de cada palabra. Necesita
// poppler (pdftotext); en macOS `brew install poppler`, en Debian/Ubuntu
// `apt-get install poppler-utils`.
export function pdfABbox(rutaPdf) {
  try {
    return execFileSync('pdftotext', ['-bbox-layout', rutaPdf, '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('FECYT necesita pdftotext (poppler) para leer las resoluciones en PDF: brew install poppler / apt-get install poppler-utils');
    throw e;
  }
}

// ---------- lectura del XHTML de pdftotext ----------
const desentidad = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

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

const ES_REF = (t) => /^\d{5}$/.test(t);
const ES_IMPORTE = (t) => /^\d{1,3}(\.\d{3})*,\d{2}$/.test(t) || t === '-';
const aNumero = (t) => (t === '-' ? 0 : Number(t.replace(/\./g, '').replace(',', '.')));

// Palabras que solo aparecen en la cabecera de columnas (se comparan tal cual,
// con mayusculas: los titulos de 2020 y 2021 van en mayusculas y no chocan).
const VOCAB_CABECERA = /^(de|para|gastos|personal|ejecución|ejecucion|amortización|inventariable|final|total|solicitado|Solicitado|financiación|Financiación|Fiinanciación|concesión|Concesión|Propuesta|Presupuesto|Pto|Nota|NOTA|criterios|sustan-|tivos|Sustantivos|Criterios|Tipo|Ayuda|concedida|RESUMEN|Resumen|Ref\.|Referencia|Título|Entidad|CCAA|Posición|N|\.|O|orden|Categoría|Total|resolución|Resolución|provisional|en|€)$/;

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
const CCAA_SIN_ESPACIOS = new Map([...CCAA_POR_ALIAS].map(([k, v]) => [k.replace(/[\s.]/g, ''), v]));
export const ccaaDe = (s) => {
  const n = normalizaTexto(s).replace(/\.$/, '');
  return CCAA_POR_ALIAS.get(n) ?? CCAA_SIN_ESPACIOS.get(n.replace(/[\s.]/g, '')) ?? null;
};

// ---------- reconstruccion de las tablas ----------
// Devuelve las filas de todas las secciones "SOLICITUDES CONCEDIDAS" del PDF.
// Cada fila: { ref, titulo, entidad, ccaa, presupuesto, solicitado, importe,
// categoria, pagina }. `avisos` recoge lo que no ha cuadrado, para revisarlo.
export function extraerConcedidas(paginas) {
  const avisos = [];
  const secciones = [];   // paginas consecutivas con la misma cabecera de seccion

  // Capa de datos: el PDF de 2021 trae todo el texto duplicado en dos cuerpos
  // de letra distintos, y cada pagina tiene que leerse de la misma capa que las
  // demas o las columnas no casan. Se elige una vez para todo el documento: el
  // cuerpo mas frecuente entre las referencias de cinco digitos.
  const hDoc = moda(paginas.flatMap((p) => p.palabras.filter((w) => ES_REF(w.t)).map((w) => w.h)), 0.1);

  for (let i = 0; i < paginas.length; i++) {
    const pag = paginas[i];
    const lns = lineas(pag.palabras);
    const cab = lns.find((l) => /SOLICITUDES\s+CONCEDIDAS/i.test(l.texto) && l.y < 130);
    if (!cab) continue;

    const refs = pag.palabras.filter((w) => ES_REF(w.t));
    if (!refs.length) continue;
    const hCapa = refs.some((w) => Math.abs(w.h - hDoc) <= 0.6) ? hDoc : moda(refs.map((w) => w.h), 0.1);
    // Tolerancia de 0.6: en 2024 la columna Entidad va medio punto mas pequeña que
    // el resto; las dos capas duplicadas de 2021 distan mas de un punto.
    const capa = pag.palabras.filter((w) => Math.abs(w.h - hCapa) <= 0.6);
    const cabRef = capa.find((w) => /^(Ref\.?|Referencia)$/.test(w.t));
    if (!cabRef) { avisos.push(`p${i + 1}: sin cabecera Ref.`); continue; }
    const yCols = cabRef.y0;

    // Etiqueta de la seccion: la linea "SOLICITUDES CONCEDIDAS ..." y las
    // sublineas entre ella y la cabecera de columnas (Modalidad, Categoría, d.1 ...).
    const hCab = moda(cab.palabras.map((w) => w.h), 0.1);
    const enCapa = (w) => Math.abs(w.h - hCapa) <= 0.6 || Math.abs(w.h - hCab) <= 0.35;
    const sub = lineas(pag.palabras.filter(enCapa)).filter((l) => l.y > cab.y + 2 && l.y < yCols - 12
      && !/SOLICITUDES\s+CONCEDIDAS|^RESOLUCI|^INFORME|^Código|^https?:/i.test(l.texto)
      && !l.palabras.every((w) => VOCAB_CABECERA.test(w.t)));
    const textos = [cab.texto.replace(/^.*?CONCEDIDAS\s*/i, ''), ...sub.map((l) => l.texto)]
      .map((t) => t.replace(/\s+/g, ' ').replace(/\s*\.\s*$/, '').trim()).filter(Boolean);
    const categoria = [...new Set(textos)].join(' · ');

    const ult = secciones[secciones.length - 1];
    const pagina = { n: i + 1, capa, yCols, cabRef, refs: refs.filter((w) => Math.abs(w.h - hCapa) <= 0.6), cabResumen: capa.find((w) => /^(RESUMEN|Resumen)$/.test(w.t)) };
    if (ult && ult.categoria === categoria && ult.paginas[ult.paginas.length - 1].n === i) ult.paginas.push(pagina);
    else secciones.push({ categoria, paginas: [pagina] });
  }

  const filas = [];
  for (const sec of secciones) {
    // Bordes de columna por seccion: la referencia, el titulo y la entidad van
    // alineados a la izquierda, asi que su borde es el x mas repetido.
    const refEdge = moda(sec.paginas.flatMap((p) => p.refs.map((w) => w.x0)));
    const datos = sec.paginas.flatMap((p) => p.capa.filter((w) => w.y0 > p.yCols + 6 && w.x0 >= refEdge - 6));
    const xs = datos.map((w) => w.x0);
    const xCcaa = moda(sec.paginas.map((p) => p.capa.find((w) => w.t === 'CCAA')?.x0).filter((v) => v != null));
    const titleEdge = pico(xs, refEdge + 10, refEdge + 70);
    const entityEdge = pico(xs, titleEdge + 60, (xCcaa ?? titleEdge + 320) - 20);
    // El borde de los importes se fija con cifras de verdad: el guion ("-", cero)
    // tambien aparece suelto dentro de nombres de entidad y no puede marcar el borde.
    const importes = datos.filter((w) => ES_IMPORTE(w.t) && w.t !== '-' && w.x0 > entityEdge + 60);
    const amountsStart = importes.length ? Math.min(...importes.map((w) => w.x0)) - 4 : Infinity;
    if (!titleEdge || !entityEdge || !importes.length) { avisos.push(`"${sec.categoria}": no se reconocen las columnas`); continue; }
    if (process.env.FECYT_DEBUG) console.error(`[fecyt] "${sec.categoria.slice(0, 50)}" p${sec.paginas.map((p) => p.n).join(',')} ref=${refEdge} titulo=${titleEdge} entidad=${entityEdge} ccaa=${xCcaa} importes=${amountsStart} palabras=${datos.length}`);

    // Alineacion vertical de las celdas de varias lineas: hasta 2021 van
    // centradas en la fila; desde 2022, pegadas arriba. Se detecta buscando
    // una fila cuyo titulo no tenga linea a la altura de la referencia.
    const centrado = sec.paginas.some((p) => p.refs.some((r) => {
      const tit = p.capa.filter((w) => w.x0 >= titleEdge - 3 && w.x0 < entityEdge - 3 && Math.abs(w.y0 - r.y0) < 14);
      return tit.length && !tit.some((w) => Math.abs(w.y0 - r.y0) < 3);
    }));

    for (const p of sec.paginas) {
      const centros = [...new Map(p.refs.map((r) => [r.t, r])).values()].sort((a, b) => a.y0 - b.y0);  // primera aparicion de cada ref
      if (!centros.length) continue;
      const desde = centros[0].y0 - (centrado ? 24 : 4);
      const xResumen = p.cabResumen ? p.cabResumen.x0 - 8 : Infinity;
      const hasta = centros[centros.length - 1].y0 + 40;   // la ultima celda no pasa de cuatro lineas
      // El numero de pagina ("1/18", "3 de 25") cae dentro de la zona de la ultima fila.
      const pie = new Set(lineas(p.capa.filter((w) => w.y0 >= desde && w.y0 < hasta))
        .filter((l) => /^(\d+\s*\/\s*\d+|\d+\s+de\s+\d+|P[aá]gina\s+\d+.*)$/i.test(l.texto)).flatMap((l) => l.palabras));
      const palabras = p.capa.filter((w) => w.y0 >= desde && w.y0 < hasta && w.x0 >= refEdge - 6 && w.x0 < xResumen
        && !pie.has(w)
        && !(w.y0 < centros[0].y0 - 3 && VOCAB_CABECERA.test(w.t)));

      const filasPag = centros.map((r) => ({ ref: r.t, y: r.y0, pagina: p.n, categoria: sec.categoria,
        titulo: [], entidadCcaa: [], importes: [] }));

      // Asigna cada linea de una columna de texto a su fila.
      const asignar = (col, palabrasCol) => {
        const lns = lineas(palabrasCol);
        if (!centrado) {
          for (const l of lns) {
            let f = null;
            for (const c of filasPag) if (c.y <= l.y + 3) f = c;
            if (f) f[col].push(...l.palabras);
          }
          return;
        }
        // Centrado: cada celda tiene tantas lineas por encima de la referencia como por debajo.
        let i = 0;
        for (const f of filasPag) {
          let arriba = 0;
          while (i + arriba < lns.length && lns[i + arriba].y < f.y - 3) arriba++;
          const centro = i + arriba < lns.length && Math.abs(lns[i + arriba].y - f.y) < 3 ? 1 : 0;
          const n = arriba * 2 + centro;
          for (let k = 0; k < n && i < lns.length; k++, i++) f[col].push(...lns[i].palabras);
        }
        if (i < lns.length) {
          avisos.push(`p${p.n}: ${lns.length - i} lineas de ${col} sin fila (ref ${filasPag[filasPag.length - 1].ref})`);
          for (; i < lns.length; i++) filasPag[filasPag.length - 1][col].push(...lns[i].palabras);
        }
      };
      asignar('titulo', palabras.filter((w) => w.x0 >= titleEdge - 3 && w.x0 < entityEdge - 3 && !ES_REF(w.t)));
      asignar('entidadCcaa', palabras.filter((w) => w.x0 >= entityEdge - 3 && w.x0 < amountsStart && !ES_IMPORTE(w.t)));
      for (const w of palabras.filter((w) => ES_IMPORTE(w.t) && w.x0 >= amountsStart)) {
        let f = null, d = 4;
        for (const c of filasPag) if (Math.abs(c.y - w.y0) < d) { f = c; d = Math.abs(c.y - w.y0); }
        if (f) f.importes.push(w);
      }

      for (const f of filasPag) {
        const texto = (ws) => lineas(ws).map((l) => l.texto).join(' ').replace(/\s+/g, ' ').trim();
        // La CCAA son las ultimas palabras por la derecha que formen un nombre conocido.
        const porX = [...f.entidadCcaa].sort((a, b) => b.x0 - a.x0 || a.y0 - b.y0);
        let ccaa = null, k = 0;
        for (let n = 1; n <= Math.min(4, porX.length); n++) {
          const c = ccaaDe(texto(porX.slice(0, n)));
          if (c) { ccaa = c; k = n; }
        }
        const usadas = new Set(porX.slice(0, k));
        const entidad = texto(f.entidadCcaa.filter((w) => !usadas.has(w)));
        const imp = f.importes.sort((a, b) => a.x0 - b.x0).map((w) => aNumero(w.t));
        const fila = {
          ref: f.ref, pagina: f.pagina, categoria: f.categoria,
          titulo: texto(f.titulo), entidad, ccaa: ccaa ?? '',
          presupuesto: imp[0] ?? null, solicitado: imp[1] ?? null, importe: imp[2] ?? null,
        };
        if (!fila.titulo) avisos.push(`p${f.pagina} ref ${f.ref}: sin titulo`);
        if (!fila.entidad) avisos.push(`p${f.pagina} ref ${f.ref}: sin entidad`);
        if (!ccaa) avisos.push(`p${f.pagina} ref ${f.ref}: sin CCAA reconocida en "${texto(f.entidadCcaa)}"`);
        if (imp.length < 3) avisos.push(`p${f.pagina} ref ${f.ref}: solo ${imp.length} importes`);
        else if (imp.length >= 5 && Math.abs(imp.slice(3).reduce((a, b) => a + b, 0) - imp[2]) > 1)
          avisos.push(`p${f.pagina} ref ${f.ref}: el desglose (${imp.slice(3).join(' + ')}) no suma el importe concedido ${imp[2]}`);
        filas.push(fila);
      }
    }
  }
  return { filas, secciones: secciones.map((s) => ({ categoria: s.categoria, paginas: s.paginas.map((p) => p.n) })), avisos };
}

// ---------- integracion ----------
export const ES_CIENCIA_CIUDADANA = /ciencia\s+ciudadana/i;

export function registroFecyt(fila, anio, url) {
  return {
    id: `FECYT:${anio}-${fila.ref}`,
    financiador: 'FECYT',
    convocatoria: `Fomento de la cultura científica ${anio}`,
    anio,
    referencia: `${anio}/${fila.ref}`,
    titulo: fila.titulo,
    resumen: '',
    categoria: fila.categoria,
    entidad: fila.entidad,
    cif: '',
    ccaa: fila.ccaa,
    ccaaVia: fila.ccaa ? 'fuente' : 'sin-ccaa',
    localizacion: '',
    inicio: '',
    fin: '',
    importe: fila.importe ?? 0,
    presupuesto: fila.presupuesto ?? 0,
    fondo: '',
    url,
  };
}
