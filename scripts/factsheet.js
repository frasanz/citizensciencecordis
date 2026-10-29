// Factsheet "La ciencia ciudadana en España": paginas A4 con la identidad de
// Ibercivis (logo blanco sobre negro, grises y un acento ambar). Sale de los
// mismos JSON que la web, asi que se regenera con cada snapshot y las cifras no
// pueden diverger.
//
//   node scripts/factsheet.js         -> web/factsheet.html
//   node scripts/factsheet.js --pdf   -> ademas web/factsheet.pdf (necesita playwright + chromium)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recomputarNacional, TIPOS } from '../web/src/nacional.js';
import { recomputar, PROGRAMAS_BASE } from '../web/src/compute.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(RAIZ, 'web');
const leer = (f) => JSON.parse(fs.readFileSync(path.join(WEB, 'data', f), 'utf8'));
// Europa: solo los programas de las cifras de partida (Erasmus+ y Europa Creativa quedan fuera).
const euTodo = leer('indicadores.json');
const eu = recomputar(euTodo, { programas: PROGRAMAS_BASE.filter((c) => euTodo.proyectos.some((p) => p.programa === c)) });
const nacTodo = leer('nacional.json');
// Cifra principal: solo proyectos. Los contratos de personal y las estancias de la
// AEI heredan el texto de su proyecto y harian contar dos veces la misma idea.
const nac = recomputarNacional(nacTodo, { tipos: ['proyecto'] });

// ---------- paleta ----------
const C = { negro: '#111111', carbon: '#2b2b2b', gris: '#555555', medio: '#8a8a8a', claro: '#d9d9d9', fondo: '#f4f4f2', ambar: '#f2a900', ambarOsc: '#a86f00' };

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const N = new Intl.NumberFormat('es-ES');
const num = (n) => N.format(Math.round(n));
const dec1 = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(n);
const meur = (n) => `${dec1(n / 1e6)} M€`;
const pct = (n) => `${Math.round(n)} %`;
const corto = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const fecha = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const titular = (s) => s.toLowerCase().replace(/(^|[\s(\-/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(De|Del|La|Las|Los|El|Y|En|Para|Por|Con)\b/g, (w) => w.toLowerCase());

const NOMBRE_PAIS = { ES: 'España', IT: 'Italia', DE: 'Alemania', BE: 'Bélgica', UK: 'Reino Unido', NL: 'Países Bajos', FR: 'Francia', EL: 'Grecia',
  AT: 'Austria', PT: 'Portugal', SE: 'Suecia', DK: 'Dinamarca', FI: 'Finlandia', IE: 'Irlanda', PL: 'Polonia', CH: 'Suiza', NO: 'Noruega', CZ: 'Chequia',
  HU: 'Hungría', SI: 'Eslovenia', HR: 'Croacia', RO: 'Rumanía', BG: 'Bulgaria', LT: 'Lituania', LV: 'Letonia', EE: 'Estonia', CY: 'Chipre', MT: 'Malta',
  LU: 'Luxemburgo', SK: 'Eslovaquia', IS: 'Islandia', RS: 'Serbia', TR: 'Turquía' };
const pais = (c) => NOMBRE_PAIS[c] || c;

// ---------- graficos SVG ----------
// Barras horizontales. items: { et, v, resaltar }. El valor va escrito al final de la barra.
function barrasH(items, { ancho = 330, fila = 22, etAncho = 118, fmt = num, max = null } = {}) {
  const m = max ?? Math.max(...items.map((i) => i.v), 1);
  const w = ancho - etAncho - 46;
  const alto = items.length * fila + 2;
  const filas = items.map((i, k) => {
    const y = k * fila + 2, bw = Math.max(1.5, (i.v / m) * w);
    return `<text x="${etAncho - 7}" y="${y + 12}" text-anchor="end" class="et${i.resaltar ? ' res' : ''}">${esc(i.et)}</text>
      <rect x="${etAncho}" y="${y + 2}" width="${bw.toFixed(1)}" height="${fila - 7}" rx="1.5" fill="${i.resaltar ? C.ambar : C.carbon}"/>
      <text x="${(etAncho + bw + 5).toFixed(1)}" y="${y + 12}" class="val">${esc(fmt(i.v))}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${ancho} ${alto}" role="img">${filas}</svg>`;
}

// Columnas por año. series: [{ clave, color }]; cada fila de datos: { anio, [clave]: n }.
// Con `superpuesta` la segunda serie se dibuja encima de la primera (parte de un total).
function columnas(datos, series, { ancho = 700, alto = 150, superpuesta = false, etiquetaAnios = 1, cifras = true } = {}) {
  const mt = 14, mb = 20, ml = 24, mr = 6;
  const w = ancho - ml - mr, h = alto - mt - mb;
  const total = (d) => (superpuesta ? d[series[0].clave] : series.reduce((s, x) => s + (d[x.clave] || 0), 0));
  const max = Math.max(...datos.map(total), 1);
  const paso = niceStep(max);
  const tope = Math.ceil(max / paso) * paso;
  const bw = w / datos.length;
  let g = '';
  for (let v = 0; v <= tope; v += paso) {
    const y = mt + h - (v / tope) * h;
    g += `<line x1="${ml}" x2="${ancho - mr}" y1="${y}" y2="${y}" stroke="${v ? C.claro : C.medio}" stroke-width=".6"/>
      <text x="${ml - 4}" y="${y + 3}" text-anchor="end" class="eje">${v}</text>`;
  }
  datos.forEach((d, k) => {
    const x = ml + k * bw + bw * 0.14, ancho1 = bw * 0.72;
    let acum = 0;
    if (superpuesta) {
      series.forEach((s, j) => {
        const v = d[s.clave] || 0, hh = (v / tope) * h;
        const w1 = j ? ancho1 * 0.56 : ancho1, x1 = j ? x + (ancho1 - w1) / 2 : x;
        if (hh > 0) g += `<rect x="${x1.toFixed(1)}" y="${(mt + h - hh).toFixed(1)}" width="${w1.toFixed(1)}" height="${hh.toFixed(1)}" fill="${s.color}"/>`;
      });
    } else {
      series.forEach((s) => {
        const v = d[s.clave] || 0, hh = (v / tope) * h;
        if (hh > 0) g += `<rect x="${x.toFixed(1)}" y="${(mt + h - acum - hh).toFixed(1)}" width="${ancho1.toFixed(1)}" height="${hh.toFixed(1)}" fill="${s.color}"/>`;
        acum += hh;
      });
    }
    const t = total(d);
    if (t && cifras) g += `<text x="${(x + ancho1 / 2).toFixed(1)}" y="${(mt + h - (t / tope) * h - 3).toFixed(1)}" text-anchor="middle" class="eje v">${t}</text>`;
    if (k % etiquetaAnios === 0) g += `<text x="${(x + ancho1 / 2).toFixed(1)}" y="${alto - 6}" text-anchor="middle" class="eje">${String(d.anio).slice(superpuesta ? 0 : 0)}</text>`;
  });
  return `<svg viewBox="0 0 ${ancho} ${alto}" role="img">${g}</svg>`;
}
function niceStep(max) {
  for (const p of [1, 2, 5, 10, 20, 25, 50, 100]) if (max / p <= 5) return p;
  return 100;
}
const leyenda = (items) => `<div class="leyenda">${items.map((i) => `<span><i style="background:${i.color}"></i>${esc(i.et)}</span>`).join('')}</div>`;

// ---------- datos ----------
const E = eu.resumen;
const paises = eu.paises;
const rango = (campo, cod = 'ES') => [...paises].sort((a, b) => b[campo] - a[campo]).findIndex((p) => p.pais === cod) + 1;
const es = paises.find((p) => p.pais === 'ES');
const rProy = rango('proyectos'), rCoord = rango('coordinados'), rDin = rango('aportacionNeta');
// Comparacion por habitante: paises con poblacion en Eurostat y al menos 15 proyectos (con menos, un solo
// proyecto mueve el ranking). Reino Unido no esta porque Eurostat ya no publica su poblacion.
const poblacion = Object.fromEntries(fs.readFileSync(path.join(RAIZ, 'datos', 'poblacion.csv'), 'utf8').trim().split('\n').slice(1)
  .map((l) => { const [p, n, a] = l.split(';'); return [p, { n: Number(n), anio: a }]; }));
const MIN_PROYECTOS_HAB = 15;
const habitantes = paises.filter((p) => poblacion[p.pais] && p.proyectos >= MIN_PROYECTOS_HAB)
  .map((p) => ({ pais: p.pais, permm: p.proyectos / poblacion[p.pais].n * 1e6, eurHab: p.aportacionNeta / poblacion[p.pais].n }));
const rangoHab = (campo) => [...habitantes].sort((a, b) => b[campo] - a[campo]).findIndex((p) => p.pais === 'ES') + 1;
const rHabProy = rangoHab('permm'), rHabDin = rangoHab('eurHab');
const sinPoblacion = paises.filter((p) => !poblacion[p.pais] && p.proyectos >= MIN_PROYECTOS_HAB).map((p) => pais(p.pais));
const anioPob = poblacion.ES?.anio ?? '';
// Los n primeros y, si no esta entre ellos, Espana con su puesto.
function topConEs(campo, n, fmtEt = pais) {
  const orden = [...habitantes].sort((a, b) => b[campo] - a[campo]);
  const items = orden.slice(0, n).map((p) => ({ et: fmtEt(p.pais), v: p[campo], resaltar: p.pais === 'ES' }));
  const i = orden.findIndex((p) => p.pais === 'ES');
  if (i >= n) items.push({ et: `España (${i + 1}.º)`, v: orden[i][campo], resaltar: true });
  return items;
}
const fuenteEu = Object.fromEntries(eu.meta.fuentes.map((f) => [f.codigo, f]));
const cobLife = fuenteEu.LIFE?.importesPanel;
const pctLife = cobLife?.total ? Math.round(100 * cobLife.asignado / cobLife.total) : null;
const fbAyudas = nacTodo.ayudas.filter((a) => a.financiador === 'FB').length;
const fbSinImporte = nacTodo.ayudas.filter((a) => a.financiador === 'FB' && !(a.importe > 0)).length;
const fuenteEs = Object.fromEntries(nacTodo.meta.fuentes.map((f) => [f.codigo, f]));
const top = (arr, n, f) => [...arr].sort((a, b) => f(b) - f(a)).slice(0, n);
const ordinal = (n) => (n === 1 ? 'el primer puesto' : `el puesto ${n}`);

const S = nac.resumen;
const anioActual = new Date(eu.meta.generado).getFullYear();
const serieEu = eu.serie.filter((s) => s.anio >= 2011);
const aniosNacFuerte = nac.serie.filter((s) => s.anio >= 2018 && s.anio < anioActual);
const mediaReciente = aniosNacFuerte.reduce((s, x) => s + x.total, 0) / (aniosNacFuerte.length || 1);
const mediaAntes = nac.serie.filter((s) => s.anio >= 2013 && s.anio <= 2016).reduce((s, x) => s + x.total, 0) / 4;
const personal = nacTodo.tipos.find((t) => t.clave === 'personal');
const estancia = nacTodo.tipos.find((t) => t.clave === 'estancia');
const finEtiqueta = { AEI: 'AEI', FECYT: 'FECYT', FB: 'Fundación Biodiversidad' };
const finOrden = ['AEI', 'FECYT', 'FB'].filter((f) => nac.financiadores.some((x) => x.clave === f));
const finRes = Object.fromEntries(nac.financiadores.map((f) => [f.clave, f]));
// Portada, Europa (3), comunidades, una por financiador y metodologia.
const TOTAL_PAG = 6 + finOrden.length;
const nMetodologia = TOTAL_PAG;
const desgloseFin = (campo, fmt) => finOrden.map((f) => `${finEtiqueta[f]} ${fmt(finRes[f][campo])}`).join(' · ');

// Resumen total en euros: contribucion neta de la UE a entidades españolas (CORDIS y LIFE) mas lo concedido por los
// financiadores estatales (solo proyectos). Son dos medidas distintas y no se han restado solapes: es un minimo.
const totalEur = es.aportacionNeta + S.importeTotal;
const pctEu = Math.round(100 * es.aportacionNeta / totalEur);

const mensajes = [
  { n: 1,
    t: `España está en el ${pct(es.pctSobreTotal)} de los proyectos europeos`,
    p: `${num(es.proyectos)} de los ${num(E.totalProyectos)} proyectos de FP7, Horizonte 2020, Horizonte Europa y LIFE que mencionan ciencia ciudadana tienen al menos una entidad española, lo que sitúa a España en ${ordinal(rProy)} entre ${paises.length} países en cifras absolutas. Por habitante, en cambio, baja al puesto ${rHabProy} de ${habitantes.length} en proyectos (países con al menos ${MIN_PROYECTOS_HAB}).` },
  { n: 2,
    t: `Coordina ${num(es.coordinados)} y recibe ${meur(es.aportacionNeta)}`,
    p: `España ocupa ${ordinal(rCoord)} en proyectos coordinados y ${ordinal(rDin)} en contribución neta de la UE, con ${num(es.organizaciones)} entidades españolas distintas participando.` },
  { n: 3,
    t: `${num(S.totalAyudas)} proyectos en convocatorias españolas`,
    p: `${finOrden.map((f) => `${f === 'FB' ? 'la Fundación Biodiversidad' : f === 'AEI' ? 'la AEI' : f} ha financiado ${num(finRes[f].ayudas)} (${meur(finRes[f].importe)}${f === 'FB' && fbSinImporte ? ', sin importe publicado en la mayoría' : ''})`).join('; ').replace(/^./, (c) => c.toUpperCase())}. Desde 2018 se financian de media unos ${num(mediaReciente)} proyectos al año, frente a unos ${num(mediaAntes)} entre 2013 y 2016.` },
];

// ---------- piezas de pagina ----------
const cabecera = (n, kicker) => `<header class="cab"><img src="img/ibercivis-logo.png" alt="Ibercivis"><span>${esc(kicker)}</span></header>`;
const pie = (n, texto) => `<footer class="pie"><span>${texto}</span><b>${n} / ${TOTAL_PAG}</b></footer>`;
const kpi = (valor, et, sub = '') => `<div class="kpi"><div class="n">${valor}</div><div class="e">${et}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
const fig = (titulo, cuerpo, nota = '') => `<figure><figcaption>${titulo}</figcaption>${cuerpo}${nota ? `<p class="nota">${nota}</p>` : ''}</figure>`;

// ---------- pagina 1: portada ----------
const p1 = `
<section class="pagina portada">
  <div class="banda">
    <img class="logo" src="img/ibercivis-logo.png" alt="Ibercivis · gente haciendo ciencia">
    <div class="kicker">Factsheet · ${esc(fecha(eu.meta.generado))}</div>
    <h1>La ciencia ciudadana<br>en <em>España</em></h1>
    <p class="sub">Qué proyectos financian los programas europeos y las convocatorias españolas, medido de forma reproducible sobre los datos abiertos de cada financiador.</p>
    <div class="total">
      <div class="tn"><b>${meur(totalEur)}</b><span>de financiación pública identificada para entidades españolas</span></div>
      <div class="td">
        <div class="barra"><i style="width:${pctEu}%"></i></div>
        <p><b>${meur(es.aportacionNeta)}</b> de la UE (CORDIS y LIFE) · ${pctEu} %</p>
        <p><b>${meur(S.importeTotal)}</b> concedidos por convocatorias estatales · ${100 - pctEu} %</p>
        <p class="fin">${esc(desgloseFin('importe', meur))}</p>
      </div>
    </div>
    <div class="kpis">
      ${kpi(num(es.proyectos), 'proyectos europeos con participación española', `${pct(es.pctSobreTotal)} de los ${num(E.totalProyectos)} del criterio`)}
      ${kpi(num(es.coordinados), 'proyectos europeos coordinados desde España', `${meur(es.aportacionNeta)} de contribución neta UE`)}
      ${kpi(num(S.totalAyudas), 'proyectos financiados en convocatorias españolas', esc(desgloseFin('ayudas', num)))}
      ${kpi(meur(S.importeTotal), 'concedidos en esas convocatorias', `${esc(desgloseFin('importe', meur))}${S.sinImporte ? ` · ${num(S.sinImporte)} sin importe publicado` : ''}`)}
    </div>
  </div>
  <div class="cuerpo">
    <h2>Tres mensajes clave</h2>
    <ol class="mensajes">
      ${mensajes.map((m) => `<li><span class="num">${m.n}</span><div><h3>${esc(m.t)}</h3><p>${esc(m.p)}</p></div></li>`).join('')}
    </ol>
    <div class="recuadro">
      <h3>Cómo leer estas cifras</h3>
      <p>Un proyecto es de <b>ciencia ciudadana</b> si la expresión aparece en su título o descripción: una medida textual y reproducible, no un juicio de calidad. <b>El número de proyectos no se suma</b> (un proyecto con consorcio no es una ayuda a una entidad). El importe total junta la contribución neta de la UE a entidades españolas y lo concedido por financiadores estatales, sin restar posibles solapes, y es un <b>mínimo</b>: no incluye Erasmus+, Europa Creativa ni Kohesio, ni lo no atribuible de LIFE. Detalle en la página ${nMetodologia}.</p>
    </div>
  </div>
  ${pie(1, 'Fuentes: CORDIS, CINEA (LIFE), AEI, FECYT y Fundación Biodiversidad · Elaboración: Ibercivis')}
</section>`;

// ---------- mapas ----------
// Las geometrias salen de datos/mapas.json (Eurostat GISCO, NUTS 2021, ver scripts/mapas.js). La proyeccion es la acimutal
// equivalente de Lambert (LAEA, la oficial europea) y todo se dibuja como SVG, sin dependencias.
const GEO = JSON.parse(fs.readFileSync(path.join(RAIZ, 'datos', 'mapas.json'), 'utf8'));
const RAD = Math.PI / 180;
const laea = (lon0, lat0) => (lon, lat) => {
  const f = lat * RAD, l = (lon - lon0) * RAD, f1 = lat0 * RAD;
  const k = Math.sqrt(2 / (1 + Math.sin(f1) * Math.sin(f) + Math.cos(f1) * Math.cos(f) * Math.cos(l)));
  return [6371 * k * Math.cos(f) * Math.sin(l), -6371 * k * (Math.cos(f1) * Math.sin(f) - Math.sin(f1) * Math.cos(f) * Math.cos(l))];
};
const mezcla = (a, b, t) => { const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = h(a), B = h(b); return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`; };
const ESCALA_GRIS = ['#e6e6e2', '#2b2b2b'], ESCALA_AMBAR = ['#fbefcf', '#a86f00'];

// items: [{ id, anillos (lon/lat), proy, valor, color?, etiqueta?, inset? }]. Devuelve el SVG.
function dibujarMapa(items, { ancho = 330, escala = ESCALA_AMBAR, max = 1, vacio = '#f3f3f0' } = {}) {
  const planos = items.map((it) => ({ ...it, anillos: it.anillos.map((a) => a.map(([x, y]) => it.proy(x, y))) }));
  const caja = (lista) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const it of lista) for (const a of it.anillos) for (const [x, y] of a) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; };
  const principales = planos.filter((it) => !it.inset), insets = planos.filter((it) => it.inset);
  let B = caja(principales);
  if (insets.length) {                                 // el inset (Canarias) va debajo a la izquierda, a la misma escala
    const I = caja(insets), dx = B.x0 - I.x0, dy = B.y1 + (B.y1 - B.y0) * 0.04 - I.y0;
    for (const it of insets) it.anillos = it.anillos.map((a) => a.map(([x, y]) => [x + dx, y + dy]));
    B = caja(planos);
  }
  const esc = ancho / (B.x1 - B.x0), alto = (B.y1 - B.y0) * esc;
  const P = ([x, y]) => `${((x - B.x0) * esc).toFixed(1)} ${((y - B.y0) * esc).toFixed(1)}`;
  const color = (it) => it.color ?? (it.valor > 0 ? mezcla(escala[0], escala[1], Math.sqrt(it.valor / max)) : vacio);
  const caminos = planos.map((it) => `<path d="${it.anillos.map((a) => `M${a.map(P).join('L')}Z`).join('')}" fill="${color(it)}" stroke="#fff" stroke-width=".6" stroke-linejoin="round"/>`).join('');
  const colocados = [];
  const rotulos = planos.filter((it) => it.etiqueta).sort((a, b) => b.valor - a.valor).map((it) => {
    const g = it.anillos.reduce((m, a) => (a.length > m.length ? a : m), []);
    const xs = g.map((q) => q[0]), ys = g.map((q) => q[1]);
    const cx = ((Math.min(...xs) + Math.max(...xs)) / 2 - B.x0) * esc, cy = ((Math.min(...ys) + Math.max(...ys)) / 2 - B.y0) * esc;
    if (colocados.some(([x, y]) => Math.hypot(x - cx, y - cy) < 17)) return '';   // no se pisan las etiquetas: la cifra exacta esta en las barras
    colocados.push([cx, cy]);
    const oscuro = it.valor > 0 && Math.sqrt(it.valor / max) > 0.55;
    return `<text x="${cx.toFixed(1)}" y="${(cy + 3).toFixed(1)}" text-anchor="middle" class="rot-mapa${oscuro ? ' claro' : ''}">${esc2(it.etiqueta)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${ancho} ${alto.toFixed(1)}" role="img">${caminos}${rotulos}</svg>`;
}
const esc2 = esc;
const leyendaMapa = (max, escala, unidad) => `<div class="leyenda-mapa"><span>0</span><i style="background:linear-gradient(90deg,${escala[0]},${escala[1]})"></i><span>${num(max)} ${unidad}</span></div>`;

// Mapa de Europa: Espana en ambar y el resto en escala de grises segun sus proyectos.
const proyEu = laea(10, 52);
const maxPaisEu = Math.max(...paises.filter((p) => p.pais !== 'ES').map((p) => p.proyectos));
const valPais = Object.fromEntries(paises.map((p) => [p.pais, p.proyectos]));
const topEtiquetas = new Set(top(paises, 9, (p) => p.proyectos).map((p) => p.pais));
const mapaEuropa = dibujarMapa(GEO.paises.map((g) => ({
  id: g.id, anillos: g.anillos, proy: proyEu, valor: valPais[g.id] || 0,
  color: g.id === 'ES' ? C.ambar : undefined, etiqueta: topEtiquetas.has(g.id) ? String(valPais[g.id]) : '',
})), { ancho: 300, escala: ESCALA_GRIS, max: maxPaisEu, vacio: '#f1f1ee' });

// ---------- pagina 2: panorama europeo ----------
const topPaises = (campo, n = 8) => top(paises, n, (p) => p[campo]).map((p) => ({ et: pais(p.pais), v: p[campo], resaltar: p.pais === 'ES' }));
const nombreEnt = (e) => (e.siglas && e.siglas.length <= 14 ? e.siglas : titular(e.nombre));
const entEs = top(eu.entidadesFoco, 8, (e) => e.proyectos).map((e) => ({ et: corto(nombreEnt(e), 24), v: e.proyectos }));
const colProg = { HORIZON: C.negro, H2020: '#666666', LIFE: '#a8a8a8', FP7: C.claro };
const progOrden = ['FP7', 'H2020', 'HORIZON', 'LIFE'].filter((c) => eu.programas.some((p) => p.clave === c));
const etProg = Object.fromEntries(eu.programas.map((p) => [p.clave, p.etiqueta]));
const serieProg = serieEu.map((s) => ({ anio: s.anio, ...s.porPrograma }));
// Areas tematicas con nombre en castellano. SwafS aparece con dos etiquetas de CORDIS (su nombre y el de su objetivo especifico).
const AREA = [[/^Marie/i, 'Acciones Marie Skłodowska-Curie'], [/^Food, Bioeconomy/i, 'Alimentación, bioeconomía y medio ambiente'],
  [/^Culture, creativity/i, 'Cultura, creatividad y sociedad inclusiva'], [/^European Research Council/i, 'Consejo Europeo de Investigación'],
  [/^Nature$/i, 'Naturaleza y biodiversidad (LIFE)'], [/^Climate action/i, 'Acción climática y medio ambiente'],
  [/^(Science with and for society|Integrate society)/i, 'Ciencia con y para la sociedad'], [/^Environmental Governance/i, 'Gobernanza e información ambiental'],
  [/^Health/i, 'Salud'], [/^Reforming and enhancing/i, 'Reforma y mejora del sistema europeo de I+i'],
  [/^Food security/i, 'Seguridad alimentaria, agricultura, mar y bioeconomía'], [/^Widening participation/i, 'Ampliar la participación y difundir la excelencia'],
  [/^Research infrastructures/i, 'Infraestructuras de investigación'], [/^Digital, Industry/i, 'Digital, industria y espacio'], [/^Civil Security/i, 'Seguridad civil'], [/^Digital/i, 'Digital, industria y espacio']];
const areas = new Map();
for (const f of eu.familias) {
  const m = AREA.find(([re]) => re.test(f.etiqueta));
  const k = m ? m[1] : corto(f.etiqueta, 36);
  areas.set(k, (areas.get(k) || 0) + f.proyectos);
}
const areasTop = [...areas].map(([et, v]) => ({ et, v })).sort((a, b) => b.v - a.v).slice(0, 8);
const kpiPeq = (n, e) => `<div class="kp"><b>${n}</b><span>${e}</span></div>`;

const p2 = `
<section class="pagina">
  ${cabecera(2, 'Panorama europeo')}
  <div class="cuerpo">
    <h2>${num(E.totalProyectos)} proyectos europeos mencionan ciencia ciudadana, con participantes de ${paises.length} países</h2>
    <p class="entra">FP7, Horizonte 2020, Horizonte Europa y LIFE. Un proyecto cuenta una vez, con todo su consorcio.</p>
    <div class="kps">
      ${kpiPeq(num(E.totalProyectos), 'proyectos')}${kpiPeq(num(paises.length), 'países')}${kpiPeq(num(E.organizacionesUnicas), 'entidades distintas')}
      ${kpiPeq(num(E.participaciones), 'participaciones')}${kpiPeq(meur(E.aportacionNetaTotal), 'contribución neta UE')}
    </div>
    ${fig('Proyectos por año de inicio y programa', columnas(serieProg, progOrden.map((c) => ({ clave: c, color: colProg[c] })), { alto: 118 })
      + leyenda(progOrden.map((c) => ({ et: etProg[c], color: colProg[c] }))),
      `${num(serieEu.filter((s) => s.anio >= anioActual).reduce((s, x) => s + x.total, 0))} proyectos con inicio en ${anioActual} o después ya están firmados; el año en curso no está cerrado.`)}
    <div class="rejilla">
      ${fig('Proyectos con participantes de cada país', mapaEuropa + leyendaMapa(maxPaisEu, ESCALA_GRIS, 'proyectos'), `España, en ámbar, con ${num(es.proyectos)}. Se rotulan los países con más proyectos que caben sin solaparse.`)}
      ${fig('Proyectos por país', barrasH(topPaises('proyectos', 10)), 'Con al menos una entidad del país en el consorcio.')}
    </div>
    <h3 class="subtit">Comparación por habitante</h3>
    <div class="rejilla">
      ${fig('Proyectos por millón de habitantes', barrasH(topConEs('permm', 6), { fmt: dec1 }),
        `Países con al menos ${MIN_PROYECTOS_HAB} proyectos (${habitantes.length}). Población a 1 de enero de ${anioPob}, Eurostat.${sinPoblacion.length ? ` Sin ${sinPoblacion.join(', ')}: Eurostat no publica su población.` : ''}`)}
      ${fig('Contribución neta de la UE por habitante (€)', barrasH(topConEs('eurHab', 6), { fmt: (v) => dec1(v) }),
        `CORDIS y LIFE${pctLife != null ? ` (el ${pctLife} % de la contribución de LIFE está atribuido a un socio)` : ''}; Erasmus+ y Europa Creativa quedan fuera.`)}
    </div>
  </div>
  ${pie(2, `Datos: CORDIS (volcado de ${esc(fecha(new Date(fuenteEu.HORIZON.actualizado).toISOString()))}) y base de datos pública de LIFE · CC BY 4.0`)}
</section>`;

// ---------- tablas de la segunda pagina de España en Europa ----------
const TIPO_ENT = { PRC: 'Empresa', REC: 'Centro de investigación', HES: 'Universidad', PUB: 'Entidad pública', OTH: 'Otra', '': 'Sin clasificar' };
const CORTO_PROG = { HORIZON: 'HE', H2020: 'H2020', LIFE: 'LIFE', FP7: 'FP7' };
const celda = (v, cls = '') => `<td${cls ? ` class="${cls}"` : ''}>${v}</td>`;
const tabla = (cabs, filas, { cls = '' } = {}) => `<table class="tab ${cls}"><thead><tr>${cabs.map(([t, c]) => `<th${c ? ` class="${c}"` : ''}>${esc(t)}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table>`;

// Areas tematicas con la parte de España (SwafS aparece con dos etiquetas de CORDIS: se suman).
const areasEs = new Map();
for (const f of eu.familias) {
  const m = AREA.find(([re]) => re.test(f.etiqueta));
  const k = m ? m[1] : corto(f.etiqueta, 40);
  const a = areasEs.get(k) || { proyectos: 0, foco: 0 };
  a.proyectos += f.proyectos; a.foco += f.foco;
  areasEs.set(k, a);
}
const filasAreas = [...areasEs].map(([et, a]) => ({ et, ...a })).sort((a, b) => b.foco - a.foco || b.proyectos - a.proyectos).slice(0, 8)
  .map((a) => `<tr>${celda(esc(a.et))}${celda(num(a.foco), 'n')}${celda(num(a.proyectos), 'n')}${celda(pct(100 * a.foco / a.proyectos), 'n')}</tr>`);

const nombreEntidad = (e) => (e.siglas && e.siglas.length <= 14 ? e.siglas : titular(e.nombre));
const filasEntidades = top(eu.entidadesFoco, 9, (e) => e.proyectos).map((e) => `<tr>${celda(esc(corto(nombreEntidad(e), 34)))}${celda(esc(TIPO_ENT[e.tipo] ?? e.tipo))}${celda(num(e.proyectos), 'n')}${celda(e.coordinados ? num(e.coordinados) : '—', 'n')}${celda(esc(e.programas.map((c) => CORTO_PROG[c] || c).join(' · ')))}${celda(e.aportacionNeta ? meur(e.aportacionNeta) : '—', 'n')}</tr>`);

// Proyectos en curso coordinados desde España: arrancados y sin terminar a la fecha de los datos.
const hoyIso = new Date(eu.meta.generado).toISOString().slice(0, 10);
const miembros = new Map();
for (const x of eu.participaciones) { const m = miembros.get(x.proyecto) || { n: 0, paises: new Set() }; m.n++; if (x.pais) m.paises.add(x.pais); miembros.set(x.proyecto, m); }
const enCurso = eu.proyectos.filter((x) => x.coordinaFoco && x.inicio && x.inicio <= hoyIso && x.fin && x.fin >= hoyIso)
  .map((x) => ({ ...x, miembros: miembros.get(x.id)?.n ?? 0, paisesN: miembros.get(x.id)?.paises.size ?? 0 }))
  .sort((a, b) => b.miembros - a.miembros || b.aportacionUE - a.aportacionUE);
const aportEnCurso = enCurso.reduce((s, x) => s + x.aportacionUE, 0);
const mesAnio = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const filasEnCurso = enCurso.slice(0, 7).map((x) => `<tr>${celda(`<b>${esc(corto(x.acronimo || x.titulo, 24))}</b>`)}${celda(esc(corto(nombreEntidad({ siglas: x.coordinador, nombre: x.coordinadorNombre || x.coordinador }), 30)))}${celda(esc(CORTO_PROG[x.programa] || x.programa))}${celda(num(x.miembros), 'n')}${celda(num(x.paisesN), 'n')}${celda(mesAnio(x.fin), 'n')}${celda(meur(x.aportacionUE), 'n')}</tr>`);

// Tendencia: proyectos con España que arrancan en los tres ultimos años cerrados frente a los tres anteriores.
const anioCierre = new Date(eu.meta.generado).getUTCFullYear() - 1;
const tramo = (a, b) => ({ con: eu.proyectos.filter((x) => x.entidadesFoco.length && x.anio >= a && x.anio <= b).length, tot: eu.proyectos.filter((x) => x.anio >= a && x.anio <= b).length });
const tAct = tramo(anioCierre - 2, anioCierre), tAnt = tramo(anioCierre - 5, anioCierre - 3);
const dif = tAct.con - tAnt.con;
const fraseTendencia = `Proyectos con participación española iniciados en ${anioCierre - 2}–${anioCierre}: <b>${num(tAct.con)}</b> de ${num(tAct.tot)}; en ${anioCierre - 5}–${anioCierre - 3}: <b>${num(tAnt.con)}</b> de ${num(tAnt.tot)}. ${Math.abs(dif) <= 3 ? 'La presencia es alta pero no ha crecido entre los dos periodos.' : dif > 0 ? 'La presencia ha crecido entre los dos periodos.' : 'La presencia ha bajado entre los dos periodos.'}`;

// ---------- vinculo con America Latina ----------
const LA = eu.latam;
const bloqueLatam = LA.proyectos ? `
    <h3 class="subtit" style="margin-top:5mm">Vínculo con América Latina</h3>
    <div class="latam">
      <div><p>Entidades latinoamericanas participan en <b>${num(LA.proyectos)}</b> de los ${num(E.totalProyectos)} proyectos (${pct(100 * LA.proyectos / E.totalProyectos)}), con ${num(LA.participaciones)} participaciones (${num(LA.asociadas)} de socios asociados)${LA.coordinados ? `; coordinan ${num(LA.coordinados)}` : ' y sin ninguna coordinadora'}. En <b>${num(LA.conFoco)}</b> de ellos (${pct(LA.pctFocoEnRegion)}) hay también entidades españolas, frente al ${pct(LA.pctFocoGeneral)} del conjunto de proyectos.</p>
      <p>Por países, los hispanohablantes aparecen con España en <b>${num(LA.hispano.conFoco)} de ${num(LA.hispano.pares)}</b> casos; Brasil, en <b>${num(LA.brasil.conFoco)} de ${num(LA.brasil.pares)}</b>. Son pocos proyectos, así que es un indicio y no una prueba: la diferencia con el conjunto no es estadísticamente significativa.</p></div>
      ${tabla([['País', ''], ['Proyectos', 'n'], ['Con España', 'n'], ['Sin España', 'n']], LA.paises.map((p) => `<tr>${celda(esc(pais(p.pais)))}${celda(num(p.proyectos), 'n')}${celda(num(p.conFoco), 'n')}${celda(num(p.sinFoco), 'n')}</tr>`), { cls: 'latam-t' })}
    </div>` : '';

// ---------- dinero por año ----------
// Aportacion de la UE al proyecto entero (no solo a la parte española) segun su año de inicio, en M€.
const eurosEu = new Map();
for (const x of eu.proyectos) {
  if (!x.anio || x.anio < 2011) continue;
  const f = eurosEu.get(x.anio) || { anio: x.anio, total: 0, foco: 0 };
  f.total += x.aportacionUE / 1e6;
  if (x.entidadesFoco.length) f.foco += x.aportacionUE / 1e6;
  eurosEu.set(x.anio, f);
}
const serieEurosEu = [...eurosEu.values()].sort((a, b) => a.anio - b.anio).map((f) => ({ anio: f.anio, total: Math.round(f.total), foco: Math.round(f.foco) }));

// Comunidades autonomas: NUTS 2 -> nombre del cruce con las convocatorias estatales.
const CCAA_NUTS = { ES11: 'Galicia', ES12: 'Asturias', ES13: 'Cantabria', ES21: 'País Vasco', ES22: 'Navarra', ES23: 'La Rioja', ES24: 'Aragón', ES30: 'Madrid',
  ES41: 'Castilla y León', ES42: 'Castilla-La Mancha', ES43: 'Extremadura', ES51: 'Cataluña', ES52: 'Comunidad Valenciana', ES53: 'Illes Balears',
  ES61: 'Andalucía', ES62: 'Murcia', ES63: 'Ceuta', ES64: 'Melilla', ES70: 'Canarias' };
const regEu = Object.fromEntries(eu.regiones.lista.map((r) => [r.nuts2, r]));
const nacCcaa = Object.fromEntries(nac.ccaa.filter((c) => c.clave).map((c) => [c.etiqueta, c]));
const nacCcaaFin = Object.fromEntries(finOrden.map((f) => [f, {}]));
for (const a of nac.ayudas) if (a.ccaa && nacCcaaFin[a.financiador]) nacCcaaFin[a.financiador][a.ccaa] = (nacCcaaFin[a.financiador][a.ccaa] || 0) + 1;
const proyEs = laea(-3.7, 40.2), proyCan = laea(-15.6, 28.3);
const maxRegEu = Math.max(...eu.regiones.lista.map((r) => r.proyectos), 1), maxRegNac = Math.max(...Object.values(nacCcaa).map((c) => c.ayudas), 1);
const itemsCcaa = (valorDe, etiquetaDe) => GEO.ccaa.map((g) => ({ id: g.id, anillos: g.anillos, proy: g.id === 'ES70' ? proyCan : proyEs, inset: g.id === 'ES70', valor: valorDe(g.id) || 0, etiqueta: etiquetaDe(g.id) }));
const top5 = (valorDe) => new Set(Object.keys(CCAA_NUTS).sort((a, b) => (valorDe(b) || 0) - (valorDe(a) || 0)).slice(0, 6));
const vEu = (id) => regEu[id]?.proyectos, vNac = (id) => nacCcaa[CCAA_NUTS[id]]?.ayudas;
const t5Eu = top5(vEu), t5Nac = top5(vNac);
const mapaCcaaEu = dibujarMapa(itemsCcaa(vEu, (id) => (t5Eu.has(id) && vEu(id) ? String(vEu(id)) : '')), { ancho: 230, max: maxRegEu });
const mapaCcaaNac = dibujarMapa(itemsCcaa(vNac, (id) => (t5Nac.has(id) && vNac(id) ? String(vNac(id)) : '')), { ancho: 230, max: maxRegNac });
const filasCcaa = Object.entries(CCAA_NUTS).map(([id, nombre]) => ({ id, nombre, e: regEu[id], n: nacCcaa[nombre] }))
  .filter((r) => r.e || r.n).sort((a, b) => (b.e?.proyectos ?? 0) - (a.e?.proyectos ?? 0) || (b.n?.ayudas ?? 0) - (a.n?.ayudas ?? 0))
  .map((r) => `<tr>${celda(esc(r.nombre))}${celda(r.e ? num(r.e.proyectos) : '—', 'n')}${celda(r.e ? meur(r.e.aportacionNeta) : '—', 'n')}${finOrden.map((f) => celda(nacCcaaFin[f][r.nombre] ? num(nacCcaaFin[f][r.nombre]) : '—', 'n')).join('')}</tr>`);
const sumaRegEu = eu.regiones.lista.reduce((a, r) => a + r.proyectos, 0);
const dosPrimEu = [...eu.regiones.lista].sort((a, b) => b.proyectos - a.proyectos).slice(0, 2);
const pctSinSede = Math.round(100 * eu.regiones.sinNuts / (eu.regiones.conNuts + eu.regiones.sinNuts));

// ---------- pagina 3: España en Europa ----------
const tiposEnt = eu.tipos.filter((t) => t.codigo).slice(0, 5).map((t) => ({ et: t.etiqueta.replace('Entidades con animo de lucro', 'Empresas').replace('Educacion superior o secundaria', 'Educación superior').replace('Organismos de investigacion', 'Organismos de investigación').replace('Organismos publicos', 'Organismos públicos'), v: t.entidades }));
const p3 = `
<section class="pagina">
  ${cabecera(3, 'España en los programas europeos')}
  <div class="cuerpo">
    <h2>España está en ${num(es.proyectos)} de los ${num(E.totalProyectos)} proyectos: ${pct(es.pctSobreTotal)} del total</h2>
    <p class="entra">Un proyecto se atribuye a España si tiene al menos una entidad española en su consorcio.</p>
    <div class="posicion">
      <div><b>${rProy}.º</b><span>en proyectos<br>(${num(es.proyectos)}); ${rHabProy}.º por habitante</span></div>
      <div><b>${rCoord}.º</b><span>en proyectos coordinados<br>(${num(es.coordinados)})</span></div>
      <div><b>${rDin}.º</b><span>en contribución neta UE<br>(${meur(es.aportacionNeta)}, ${pct(es.pctAportacion)}); ${rHabDin}.º por habitante</span></div>
      <div><b>${num(es.organizaciones)}</b><span>entidades españolas<br>distintas</span></div>
    </div>
    <div class="rejilla">
      ${fig('Proyectos por año de inicio', columnas(serieEu.map((s) => ({ anio: s.anio, total: s.total, foco: s.foco })), [{ clave: 'total', color: C.claro }, { clave: 'foco', color: C.ambar }], { superpuesta: true, alto: 150, ancho: 340, etiquetaAnios: 2, cifras: false })
        + leyenda([{ et: 'Todos', color: C.claro }, { et: 'Con España', color: C.ambar }]))}
      ${fig('Aportación de la UE por año de inicio (M€)', columnas(serieEurosEu, [{ clave: 'total', color: C.claro }, { clave: 'foco', color: C.ambar }], { superpuesta: true, alto: 150, ancho: 340, etiquetaAnios: 2, cifras: false })
        + leyenda([{ et: 'Todos los proyectos', color: C.claro }, { et: 'Con participación española', color: C.ambar }]),
        'Importe máximo del proyecto entero, no solo de la parte española.')}
    </div>
    <p class="tendencia">${fraseTendencia}</p>
    <div class="rejilla">
      ${fig('Proyectos coordinados', barrasH(topPaises('coordinados')))}
      ${fig('Contribución neta de la UE (M€)', barrasH(top(paises, 8, (p) => p.aportacionNeta).map((p) => ({ et: pais(p.pais), v: p.aportacionNeta / 1e6, resaltar: p.pais === 'ES' })), { fmt: (v) => dec1(v) }),
        `CORDIS y LIFE${pctLife != null ? ` (LIFE: ${pctLife} % atribuido a un socio, del panel público de CINEA)` : ''}. Mínimo: lo no atribuido no se reparte.`)}
    </div>
    <div class="programas">${eu.programas.map((p) => `<div><b>${esc(p.etiqueta)}</b><span>España en ${num(p.foco)} de ${num(p.proyectos)} · ${pct(p.pctFoco)}</span></div>`).join('')}</div>
    ${bloqueLatam}
  </div>
  ${pie(3, `Datos: CORDIS (volcado de ${esc(fecha(new Date(fuenteEu.HORIZON.actualizado).toISOString()))}) y base de datos pública de LIFE · CC BY 4.0`)}
</section>`;

// ---------- pagina 4: quien participa ----------
const p3b = `
<section class="pagina">
  ${cabecera(4, 'España en los programas europeos')}
  <div class="cuerpo">
    <h2>Quién participa, en qué áreas y qué coordina España ahora</h2>
    <p class="entra">Las entidades españolas presentes en los proyectos europeos, las áreas donde España tiene más peso y los proyectos que coordina y siguen en marcha.</p>
    <h3 class="subtit">Áreas temáticas con más proyectos con España</h3>
    ${tabla([['Área (subprograma de CORDIS)', ''], ['Con España', 'n'], ['Total', 'n'], ['% con España', 'n']], filasAreas)}
    <p class="nota">Subprograma de la base legal del proyecto, con el nombre oficial de CORDIS traducido; las acciones de un mismo área en distintos programas marco se suman.</p>
    <h3 class="subtit">Entidades españolas más activas</h3>
    ${tabla([['Entidad', ''], ['Tipo', ''], ['Proyectos', 'n'], ['Coordina', 'n'], ['Programas', ''], ['Contribución UE', 'n']], filasEntidades)}
    <p class="nota">Las entidades se identifican por su PIC, estable entre programas: el CSIC cuenta como una sola. La contribución es la asignada en el acuerdo de subvención, no lo pagado; en LIFE, la que atribuye el panel de CINEA. Entidades españolas distintas: ${num(es.organizaciones)}.</p>
    <h3 class="subtit">Proyectos en curso coordinados desde España</h3>
    <p class="entra" style="margin-bottom:2mm">${num(enCurso.length)} proyectos en marcha a ${esc(fecha(eu.meta.generado))}, con ${meur(aportEnCurso)} de aportación de la UE al conjunto de cada proyecto. Los mayores, por número de miembros:</p>
    ${tabla([['Proyecto', ''], ['Coordinador', ''], ['Programa', ''], ['Miembros', 'n'], ['Países', 'n'], ['Fin', 'n'], ['Aportación UE', 'n']], filasEnCurso)}
    <p class="nota">En curso: empezó y no ha terminado a la fecha de los datos. Miembros: coordinador, beneficiarios, entidades afiliadas y socios asociados. Aportación UE: la del proyecto entero, no solo la parte española.</p>
  </div>
  ${pie(4, `Datos: CORDIS y base de datos pública de LIFE · CC BY 4.0`)}
</section>`;

// ---------- pagina 5: España por comunidades ----------
const nomRegEu = (r) => CCAA_NUTS[r.nuts2];
const dosPrimNac = nac.ccaa.filter((c) => c.clave).slice(0, 2);
const p3c = `
<section class="pagina">
  ${cabecera(5, 'España por comunidades autónomas')}
  <div class="cuerpo">
    <h2>La participación se concentra en pocas comunidades: ${esc(nomRegEu(dosPrimEu[0]))} y ${esc(nomRegEu(dosPrimEu[1]))} van en cabeza</h2>
    <p class="entra">Comunidad autónoma de la sede de cada entidad. En los proyectos europeos lideran ${esc(nomRegEu(dosPrimEu[0]))} (${num(dosPrimEu[0].proyectos)} proyectos) y ${esc(nomRegEu(dosPrimEu[1]))} (${num(dosPrimEu[1].proyectos)}); en las ayudas estatales, ${esc(dosPrimNac[0].etiqueta)} (${num(dosPrimNac[0].ayudas)}) y ${esc(dosPrimNac[1].etiqueta)} (${num(dosPrimNac[1].ayudas)}).</p>
    <div class="rejilla">
      ${fig('Proyectos europeos con entidades de la comunidad', `<div class="mapa-es">${mapaCcaaEu}</div>` + leyendaMapa(maxRegEu, ESCALA_AMBAR, 'proyectos'), 'Un proyecto cuenta una vez por comunidad.')}
      ${fig('Ayudas estatales por comunidad de la entidad', `<div class="mapa-es">${mapaCcaaNac}</div>` + leyendaMapa(maxRegNac, ESCALA_AMBAR, 'ayudas'), 'Solo proyectos (sin contratos ni estancias de la AEI).')}
    </div>
    <h3 class="subtit">Las dos fuentes, por comunidad</h3>
    ${tabla([['Comunidad autónoma', ''], ['Proyectos europeos', 'n'], ['Aportación UE', 'n'], ...finOrden.map((f) => [`Ayudas ${f === 'FB' ? 'F. Biodiv.' : finEtiqueta[f]}`, 'n'])], filasCcaa)}
    <p class="nota">Europa: sede de cada entidad según el código NUTS de CORDIS (también en LIFE cuando la entidad coincide por nombre con una de CORDIS); ${pctSinSede} % de las participaciones españolas no tiene sede conocida y no entra. Aportación UE: contribución neta a las entidades de la comunidad, no el importe de los proyectos. Ayudas estatales: proyectos de cada financiador por sede de la entidad beneficiaria, sin sumarlos; ${num(S.sinCcaa)} sin comunidad determinada. El importe de cada financiador, en su página.</p>
  </div>
  ${pie(5, 'Datos: CORDIS, LIFE, AEI, FECYT y Fundación Biodiversidad · Límites administrativos: © EuroGeographics (Eurostat GISCO)')}
</section>`;

// ---------- paginas 6 a 8: una por financiador español ----------
// Cada financiador va en su pagina y no se suman entre si: el importe, el año y la via de entrada no
// significan lo mismo en la AEI, en FECYT y en la Fundacion Biodiversidad.
const VIA = { titulo: 'En el título', resumen: 'En el resumen', 'palabras-clave': 'En las palabras clave', categoria: 'Línea de ciencia ciudadana' };
const nombreNac = (n) => corto(/CONSEJO SUPERIOR DE INVESTIGACIONES CIENT/i.test(n) ? 'CSIC' : titular(n).replace(/^Universidad/, 'U.').replace(/^Universitat/, 'U.'), 28);
// FECYT da el tipo como "Universidad, Publica"; cuando solo dice "Publica" o "Privada" no hay tipo.
const tipoFecyt = (t) => { const x = t && t.includes(',') ? t.split(',')[0].trim() : ''; return x && x !== 'Otros' ? x : 'Otras o sin tipo'; };
const porTipoFecyt = (ayudas) => [...ayudas.reduce((m, a) => m.set(tipoFecyt(a.tipoEntidad), (m.get(tipoFecyt(a.tipoEntidad)) || 0) + 1), new Map())]
  .map(([et, v]) => ({ et, v })).sort((a, b) => b.v - a.v).slice(0, 7);
const FIN_TEXTO = {
  AEI: {
    nombre: 'Agencia Estatal de Investigación',
    entra: `Ayudas a proyectos de investigación de sus convocatorias de I+D+i. Se cuentan solo proyectos: ${num(personal?.ayudas ?? 0)} contratos de personal y ${num(estancia?.ayudas ?? 0)} estancias (${meur((personal?.importe ?? 0) + (estancia?.importe ?? 0))}) quedan fuera porque heredan el texto de su proyecto.`,
    anio: 'Año de la convocatoria.',
    importe: 'Ayuda concedida que publica el buscador de la AEI.',
    vias: '«Palabras clave»: las declara el proyecto y la AEI no las exporta, así que no se comprueban aquí.',
  },
  FECYT: {
    nombre: 'Fundación Española para la Ciencia y la Tecnología',
    entra: 'Ayudas de la convocatoria anual de fomento de la cultura científica, tecnológica y de la innovación: divulgación, comunicación y participación, no investigación.',
    anio: 'Año de la convocatoria.',
    importe: 'Propuesta de financiación final de la resolución de concesión.',
    vias: '«Línea de ciencia ciudadana»: concedida en la línea o categoría de ciencia ciudadana de la convocatoria. «Palabras clave»: los descriptores de la ficha del proyecto.',
  },
  FB: {
    nombre: 'Fundación Biodiversidad (MITECO)',
    entra: 'Proyectos de conservación de la biodiversidad y del medio marino de sus convocatorias de ayudas, del Programa Pleamar y de Biodiversa+.',
    anio: 'Año de inicio de ejecución según la ficha del proyecto.',
    importe: 'Importe de la ayuda que da la ficha; la mayoría de las fichas no lo publica.',
    vias: '',
  },
};
const paginasFin = finOrden.map((f, k) => {
  const r = recomputarNacional(nacTodo, { tipos: ['proyecto'], financiadores: [f] });
  const R = r.resumen, T = FIN_TEXTO[f];
  const n = 6 + k;
  const serie = r.serie.filter((s) => s.anio >= R.desde).map((s) => ({ anio: s.anio, v: s.total }));
  const euros = r.serie.filter((s) => s.anio >= R.desde).map((s) => ({ anio: s.anio, v: Math.round(s.importe / 1e5) / 10 }));
  const ccaa = r.ccaa.filter((c) => c.clave).slice(0, 8);
  // Algunas fichas de la Fundacion Biodiversidad no dicen quien es el beneficiario: no cuentan como entidad.
  const entidades = r.entidades.filter((e) => e.nombre?.trim());
  const sinEntidad = r.ayudas.filter((a) => !a.entidad?.trim()).length;
  const tercera = f === 'FECYT'
    ? fig('Tipo de entidad beneficiaria', barrasH(porTipoFecyt(r.ayudas), { etAncho: 150 }), 'Tal como lo da la resolución de FECYT.')
    : fig('Proyectos por convocatoria', barrasH(r.convocatorias.slice(0, 7).map((c) => ({ et: corto(c.etiqueta, 34), v: c.ayudas })), { etAncho: 170 }), 'Nombre de la convocatoria o del programa que da el financiador.');
  const conImporte = R.sinImporte ? `${num(R.conImporte)} de ${num(R.totalAyudas)} con importe` : `${num(R.importeMedio / 1000)} mil € de media`;
  return `
<section class="pagina">
  ${cabecera(n, `Convocatorias españolas · ${finEtiqueta[f]}`)}
  <div class="cuerpo">
    <h2>${esc(finEtiqueta[f])}: ${num(R.totalAyudas)} proyectos y ${meur(R.importeTotal)} concedidos entre ${R.desde} y ${R.hasta}</h2>
    <p class="entra"><b>${esc(T.nombre)}.</b> ${T.entra} La unidad es la ayuda a una entidad, sin consorcios.</p>
    <div class="kps">
      ${kpiPeq(num(R.totalAyudas), 'proyectos')}${kpiPeq(num(entidades.length), 'entidades distintas')}${kpiPeq(meur(R.importeTotal), conImporte)}
      ${kpiPeq(num(R.ccaaConAyudas), 'comunidades autónomas')}${kpiPeq(`${R.desde}–${R.hasta}`, 'años con proyectos')}
    </div>
    <div class="rejilla">
      ${fig('Proyectos por año', columnas(serie, [{ clave: 'v', color: C.carbon }], { alto: 150, ancho: 340, etiquetaAnios: 2 }), T.anio)}
      ${fig('Importe concedido por año (M€)', columnas(euros, [{ clave: 'v', color: C.ambar }], { alto: 150, ancho: 340, etiquetaAnios: 2, cifras: false }), T.importe)}
    </div>
    <div class="rejilla">
      ${fig('Proyectos por comunidad autónoma', barrasH(ccaa.map((c, j) => ({ et: c.etiqueta, v: c.ayudas, resaltar: j === 0 })), { etAncho: 112 }),
        `Comunidad de la sede de la entidad.${R.sinCcaa ? ` ${num(R.sinCcaa)} proyectos sin comunidad determinada.` : ''}`)}
      ${fig('Entidades con más proyectos', barrasH(entidades.slice(0, 8).map((e) => ({ et: nombreNac(e.nombre), v: e.ayudas })), { etAncho: 150 }),
        sinEntidad ? `${num(sinEntidad)} proyectos sin entidad beneficiaria en su ficha.` : '')}
      ${tercera}
      ${fig('Cómo entra cada proyecto en el criterio', barrasH(r.vias.map((v) => ({ et: VIA[v.clave] || v.clave, v: v.ayudas })), { etAncho: 130 }),
        `Un proyecto entra por la primera vía que cumple.${T.vias ? ` ${T.vias}` : ''}`)}
    </div>
  </div>
  ${pie(n, `Datos: ${esc(T.nombre)} (${esc(fecha(fuenteEs[f]?.actualizado ?? fuenteEs.AEI.actualizado))}) · leídos de su web pública`)}
</section>`;
});
const p4 = paginasFin.join('\n');

// ---------- ultima pagina: metodologia ----------
const fl = (f) => nacTodo.meta.filtro.frases.map((x) => `<i>${esc(x)}</i>`).join(', ');
const p5 = `
<section class="pagina">
  ${cabecera(nMetodologia, 'Metodología y límites')}
  <div class="cuerpo">
    <h2>Cómo se han obtenido estas cifras</h2>
    <p class="entra">Todo se recalcula con un único comando a partir de los datos públicos de cada financiador; el código y los CSV de partida están en abierto.</p>
    <table class="fuentes">
      <thead><tr><th>Fuente</th><th>Qué se lee</th><th>Criterio</th></tr></thead>
      <tbody>
        <tr><td><b>CORDIS</b><br>FP7, H2020, Horizonte Europa</td><td>Volcados oficiales de datos abiertos: proyectos, organizaciones y base legal.</td><td rowspan="2"><i>citizen science</i> en título o descripción del proyecto.</td></tr>
        <tr><td><b>LIFE</b><br>CINEA</td><td>API de su base pública y ficha de cada candidato; el importe por socio, del panel público de CINEA. El país de los socios se resuelve por una cadena de fuentes anotada.</td></tr>
        <tr><td><b>AEI</b></td><td>CSV de su buscador de ayudas concedidas, por título, resumen y palabras clave.</td><td rowspan="3">${fl()} en título o resumen.<br>FECYT: además, su línea de ciencia ciudadana y los descriptores.</td></tr>
        <tr><td><b>FECYT</b></td><td>PDF de concedidas de cada año (tablas reconstruidas por coordenadas) y ficha resumen de cada proyecto.</td></tr>
        <tr><td><b>Fundación Biodiversidad</b></td><td>API de su web y ficha de cada proyecto candidato.</td></tr>
        <tr class="compl"><td><b>Erasmus+, Europa Creativa, Kohesio</b><br>complementarios</td><td>API internas de la plataforma de resultados de proyectos de la Comisión y de Kohesio (FEDER, FSE+, Interreg). Importe por proyecto, no por socio.</td><td><b>Fuera de las cifras de este documento</b>: se consultan en la web.</td></tr>
      </tbody>
    </table>
    <div class="dos">
      <div>
        <h3>Qué hay que tener en cuenta</h3>
        <ul>
          <li><b>La medida es textual.</b> Detecta los proyectos que dicen ser de ciencia ciudadana, no los que lo son sin llamarlo así.</li>
          <li><b>Dos ámbitos, dos unidades.</b> Un proyecto europeo con su consorcio no equivale a una ayuda nacional: el número de proyectos no se suma. El importe total de la portada junta ambas medidas y es un mínimo.</li>
          <li><b>Contratos de la AEI fuera.</b> Los contratos de personal y las estancias repiten el texto de su proyecto y se cuentan aparte.</li>
          <li><b>Datos incompletos.</b> En LIFE ${pctLife != null ? `el ${pctLife} % del dinero` : 'parte del dinero'} está atribuido a un socio concreto y el resto no se reparte; ${fbSinImporte} de las ${fbAyudas} ayudas de la Fundación Biodiversidad no publican importe, y ${S.sinCcaa} ayudas no tienen comunidad autónoma determinada.</li>
          <li><b>Cada dato lleva su vía.</b> Qué criterio hizo entrar cada proyecto y cómo se dedujo su país o comunidad queda anotado.</li>
        </ul>
      </div>
      <div>
        <h3>Para reproducirlo o ampliarlo</h3>
        <p class="web">frasanz.github.io/<wbr>citizensciencecordis</p>
        <p>Indicadores interactivos con filtros por programa, país, año, entidad y financiador; descarga en CSV de cada tabla; página de <b>metodología</b> con el detalle de cada fuente.</p>
        <p class="peq">Datos de CORDIS: Comisión Europea, CC BY 4.0. Datos de LIFE: CINEA. Datos de AEI, FECYT y Fundación Biodiversidad: webs públicas de cada entidad.</p>
      </div>
    </div>
    <div class="recuadro cascada">
      <h3>Lo que estas cifras no recogen</h3>
      <p><b>Financiación en cascada.</b> Muchos proyectos europeos reparten parte de su presupuesto, mediante convocatorias abiertas a terceros, entre asociaciones, ayuntamientos, escuelas o grupos ciudadanos. Esas entidades no figuran como participantes en CORDIS ni en LIFE, así que no cuentan aquí: la huella real de la ciencia ciudadana sobre el terreno es mayor que la de estas tablas. Tampoco se incluyen la financiación regional, local o privada ni otros programas europeos: Interreg (aún sin incorporar) y, como complementarios fuera de estas cifras, Erasmus+, Europa Creativa y Kohesio.</p>
    </div>
    <div class="dos abajo">
      <div>
        <h3>Fecha de los datos</h3>
        <table class="fechas">
          <tr><td>CORDIS (Horizonte Europa, H2020)</td><td>${esc(fecha(new Date(fuenteEu.HORIZON.actualizado).toISOString()))}</td></tr>
          <tr><td>CORDIS (FP7, cerrado)</td><td>${esc(fecha(new Date(fuenteEu.FP7.actualizado).toISOString()))}</td></tr>
          <tr><td>LIFE</td><td>${esc(fecha(fuenteEu.LIFE.actualizado))}</td></tr>
          <tr><td>AEI, FECYT, Fundación Biodiversidad</td><td>${esc(fecha(fuenteEs.AEI.actualizado))}</td></tr>
        </table>
        <p class="peq">CORDIS se actualiza a principios de cada mes y el workflow del repositorio recalcula todo el día 8.</p>
      </div>
      <div>
        <h3>Cómo citar</h3>
        <p class="cita">Ibercivis (${anioActual}). <i>La ciencia ciudadana en España. Factsheet</i>. Datos de CORDIS, LIFE, AEI, FECYT y Fundación Biodiversidad a ${esc(fecha(eu.meta.generado))}. frasanz.github.io/citizensciencecordis</p>
      </div>
    </div>
    <p class="legal">Datos de CORDIS y LIFE: © Unión Europea, CC BY 4.0. Datos de AEI, FECYT y Fundación Biodiversidad: reutilizados según la Ley 37/2007, sobre reutilización de la información del sector público. Este documento es un análisis independiente elaborado por Fundación Ibercivis y no es una publicación oficial de ninguno de los financiadores.</p>
  </div>
  ${pie(nMetodologia, `Generado el ${esc(fecha(eu.meta.generado))} · Elaboración: Ibercivis`)}
</section>`;

// ---------- cabecera del sitio (solo en pantalla) ----------
// El CSS sale de estilo.css para que la cabecera sea la misma que la del resto del sitio; en el PDF no se imprime.
const estiloSitio = fs.readFileSync(path.join(WEB, 'estilo.css'), 'utf8');
const cssCabecera = estiloSitio.slice(estiloSitio.indexOf('/* ---------- cabecera del sitio'), estiloSitio.indexOf('/* ---------- pie común'));
const cabeceraSitio = `<header class="sitio no-imprimir">
  <div class="sitio-in">
    <a class="marca" href="./" aria-label="Ibercivis, gente haciendo ciencia"><img src="img/ibercivis-logo.png" alt="Ibercivis · gente haciendo ciencia"></a>
    <div class="titulo">
      <h1>Ciencia ciudadana en la financiación pública</h1>
      <p>Qué proyectos de ciencia ciudadana financian los programas europeos y las convocatorias españolas, medido de forma reproducible sobre los datos que publica cada financiador.</p>
    </div>
  </div>
  <nav class="pestanas" aria-label="Secciones">
    <a class="pestana" href="./#europa"><span class="largo">Programas europeos</span><span class="corto">Europa</span><span class="pct">CORDIS, LIFE y fondos complementarios</span></a>
    <a class="pestana" href="./#espana"><span class="largo">Convocatorias españolas</span><span class="corto">España</span><span class="pct">AEI, FECYT y Fundación Biodiversidad</span></a>
    <span class="div" aria-hidden="true"></span>
    <a class="pestana" href="./metodologia.html">Metodología<span class="pct">cómo se obtiene cada dato</span></a>
    <a class="pestana" href="./factsheet.html" aria-current="page">Factsheet<span class="pct">informe de ${TOTAL_PAG} páginas · PDF</span></a>
  </nav>
</header>
<div class="fs-barra no-imprimir"><a href="factsheet.pdf" download>Descargar el PDF</a><span>${TOTAL_PAG} páginas A4 · generado el ${esc(fecha(eu.meta.generado))}</span></div>`;

// ---------- documento ----------
const css = `
@page{size:A4;margin:0}
:root{--serif:"Source Serif 4",Georgia,"Times New Roman",serif;--sans:"Source Sans 3","Segoe UI",Helvetica,Arial,sans-serif;--negro:${C.negro};--carbon:${C.carbon};--gris:${C.gris};--medio:${C.medio};--claro:${C.claro};--fondo:${C.fondo};--ambar:${C.ambar};--ambar-osc:${C.ambarOsc}}
*{box-sizing:border-box}
.serif,h1,h2,.kpi .n,.kp b,.posicion b,.mensajes .num{font-family:"Source Serif 4","Source Serif Pro",Georgia,"Times New Roman",serif}
html{background:#cfcfcf}
body{margin:0;color:var(--carbon);font:9.4pt/1.45 "Source Sans 3","Source Sans Pro","Segoe UI",Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pagina{position:relative;width:210mm;height:297mm;margin:8mm auto;background:#fff;overflow:hidden;break-after:page;page-break-after:always;display:flex;flex-direction:column}
@media print{html{background:none}.pagina{margin:0}.no-imprimir{display:none!important}}
.pagina h3{font-family:"Source Sans 3","Segoe UI",Helvetica,Arial,sans-serif}
.fs-barra{max-width:210mm;margin:12px auto 0;padding:0 4px;display:flex;justify-content:space-between;align-items:center;gap:12px;font:13px var(--sans)}
.fs-barra a{background:#111;color:#fff;text-decoration:none;font-weight:700;padding:8px 14px;border-radius:6px}
.fs-barra span{color:#555}
body{background:transparent}
.sitio h1{font-family:var(--serif)}
.cab{height:15mm;background:var(--negro);display:flex;align-items:center;justify-content:space-between;padding:0 14mm;flex:none}
.cab img{height:8mm}
.cab span{color:#fff;font-size:8.5pt;letter-spacing:.14em;text-transform:uppercase;font-weight:700;border-left:2px solid var(--ambar);padding-left:3mm}
.cuerpo{padding:9mm 14mm 0;flex:1;min-height:0}
.pie{height:11mm;flex:none;margin:0 14mm;border-top:.6pt solid var(--claro);display:flex;align-items:center;justify-content:space-between;font-size:7pt;color:var(--gris)}
.pie b{color:var(--negro)}
h2{font-size:15.5pt;line-height:1.22;margin:0 0 2mm;color:var(--negro);font-weight:700;letter-spacing:-.005em}
h3{font-size:10pt;margin:0 0 1mm;color:var(--negro);font-weight:800}
.entra{margin:0 0 4mm;color:var(--gris);font-size:9pt}
figure{margin:0 0 4mm;break-inside:avoid}
figcaption{font-size:8pt;font-weight:800;color:var(--negro);text-transform:uppercase;letter-spacing:.07em;margin-bottom:1.5mm;padding-bottom:1mm;border-bottom:1.6pt solid var(--negro)}
figure svg{width:100%;height:auto;display:block}
.nota{margin:1mm 0 0;font-size:7.2pt;color:var(--gris);line-height:1.35}
.rejilla{display:grid;grid-template-columns:1fr 1fr;gap:0 9mm}
svg .et{font-size:8.6px;fill:var(--carbon);font-family:inherit}
svg .et.res{font-weight:800;fill:var(--negro)}
svg .val{font-size:8.6px;fill:var(--negro);font-weight:800;font-family:inherit}
svg .eje{font-size:8px;fill:var(--gris);font-family:inherit}
svg .eje.v{font-weight:800;fill:var(--negro)}
.leyenda{display:flex;gap:5mm;font-size:7.6pt;color:var(--carbon);margin-top:1mm}
.leyenda i{display:inline-block;width:3mm;height:3mm;margin-right:1.5mm;vertical-align:-.5mm;border:.4pt solid var(--medio)}
.programas{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-top:1mm}
.programas div{background:var(--fondo);border-left:2.2pt solid var(--ambar);padding:1.6mm 2.4mm;font-size:7.4pt;line-height:1.3}
.programas b{display:block;color:var(--negro);font-size:8pt}
.programas span{color:var(--gris)}

/* portada */
.portada .banda{background:var(--negro);color:#fff;padding:11mm 14mm 9mm;flex:none}
.portada .logo{height:15mm;display:block;margin-bottom:6mm}
.portada .kicker{font-size:8.6pt;letter-spacing:.18em;text-transform:uppercase;font-weight:700;color:var(--ambar);margin-bottom:3mm}
.portada h1{font-size:30pt;line-height:1.06;margin:0 0 3mm;font-weight:700;letter-spacing:-.01em}
.portada h1 em{font-style:normal;color:var(--ambar)}
.portada .sub{max-width:140mm;margin:0 0 5mm;font-size:10.5pt;color:#cfcfcf;line-height:1.5}
.total{display:grid;grid-template-columns:auto 1fr;gap:7mm;align-items:center;margin:0 0 5mm;padding:3mm 5mm;border:1.4pt solid var(--ambar);border-radius:1.5mm}
.total .tn b{display:block;font-family:"Source Serif 4",Georgia,serif;font-size:31pt;line-height:1;color:var(--ambar);font-weight:700}
.total .tn span{display:block;margin-top:1.4mm;max-width:46mm;font-size:8.6pt;line-height:1.3;color:#fff;font-weight:700}
.total .barra{height:3.2mm;background:#4a4a4a;border-radius:1mm;overflow:hidden;margin-bottom:2mm}
.total .barra i{display:block;height:100%;background:var(--ambar)}
.total .td p{margin:.6mm 0;font-size:8.2pt;color:#d9d9d9}
.total .td p b{color:#fff}
.total .td p.fin{font-size:7.6pt;color:var(--medio);padding-left:3mm}
.kpis{display:grid;grid-template-columns:1fr 1fr;gap:4mm 8mm}
.kpi{border-top:1.6pt solid var(--ambar);padding-top:2.4mm}
.kpi .n{font-size:24pt;font-weight:700;line-height:1;color:#fff}
.kpi .e{font-size:9pt;color:#fff;margin-top:1.6mm;line-height:1.3;font-weight:700}
.kpi .s{font-size:8pt;color:var(--medio);margin-top:.8mm}
.portada .cuerpo{padding-top:6mm}
.mensajes{list-style:none;margin:2mm 0 4mm;padding:0;display:grid;gap:3mm}
.mensajes li{display:flex;gap:4mm;align-items:flex-start}
.mensajes .num{flex:none;width:9mm;height:9mm;border-radius:50%;background:var(--negro);color:var(--ambar);font-weight:800;font-size:12pt;display:flex;align-items:center;justify-content:center}
.mensajes p{margin:0;font-size:8.6pt;color:var(--carbon)}
.recuadro{background:var(--fondo);border-left:3pt solid var(--ambar);padding:2.6mm 4.5mm}
.recuadro p{margin:0;font-size:8pt}

/* panorama y posicion */
.subtit{font-size:9.5pt;text-transform:uppercase;letter-spacing:.08em;color:var(--gris);margin:1mm 0 3mm;font-family:inherit}
.kps{display:grid;grid-template-columns:repeat(5,1fr);gap:3mm;margin:0 0 4mm}
.kp{border-top:1.6pt solid var(--negro);padding-top:1.6mm}
.kp b{display:block;font-size:15pt;line-height:1.1;color:var(--negro);font-weight:700}
.kp span{font-size:7.6pt;color:var(--gris)}
.mapa-es{max-width:72%;margin:0 auto}
.rot-mapa{font:700 8.4px var(--sans);fill:#111;text-anchor:middle;pointer-events:none}
.rot-mapa.claro{fill:#fff}
.leyenda-mapa{display:flex;align-items:center;gap:2mm;font-size:7.2pt;color:var(--gris);margin-top:1.2mm}
.leyenda-mapa i{flex:1;height:2.2mm;border-radius:1mm;border:.4pt solid var(--claro)}
.latam{display:grid;grid-template-columns:1.3fr 1fr;gap:6mm;align-items:start}
.latam p{margin:0 0 2mm;font-size:8.2pt}
.latam table.tab{margin:0}
.tendencia{margin:-1mm 0 4mm;padding:2.2mm 3.5mm;background:var(--fondo);border-left:2.2pt solid var(--ambar);font-size:8.6pt}
table.tab{width:100%;border-collapse:collapse;font-size:7.8pt;margin:0 0 1.5mm}
.tab th{text-align:left;font-size:7pt;text-transform:uppercase;letter-spacing:.06em;color:#fff;background:var(--negro);padding:1.3mm 2mm}
.tab td{padding:.95mm 2mm;border-bottom:.5pt solid var(--claro);vertical-align:top}
.tab th.n,.tab td.n{text-align:right;white-space:nowrap}
.posicion{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:0 0 4mm}
.posicion div{background:var(--negro);color:#fff;padding:2.6mm 3mm;border-bottom:2.2pt solid var(--ambar)}
.posicion b{display:block;font-size:19pt;line-height:1.05;color:var(--ambar);font-weight:700}
.posicion span{font-size:7.6pt;line-height:1.3;color:#d9d9d9}

/* metodologia */
table.fuentes{width:100%;border-collapse:collapse;font-size:8.2pt;margin:0 0 5mm}
.fuentes th{text-align:left;font-size:7.4pt;text-transform:uppercase;letter-spacing:.07em;color:#fff;background:var(--negro);padding:1.6mm 2.4mm}
.fuentes td{vertical-align:top;padding:2mm 2.4mm;border-bottom:.6pt solid var(--claro)}
.fuentes td:first-child{white-space:nowrap}
.fuentes td[rowspan]{background:var(--fondo)}
.fuentes tr.compl td{background:var(--fondo);color:var(--gris)}
.dos{display:grid;grid-template-columns:1.25fr 1fr;gap:9mm}
.dos ul{margin:0;padding-left:4.2mm;font-size:8.6pt}
.dos li{margin-bottom:1.1mm}
.dos p{margin:0 0 2mm;font-size:8.6pt}
.web{font-size:12pt!important;font-weight:700;font-family:"Source Serif 4",Georgia,serif;color:var(--negro);border-bottom:2pt solid var(--ambar);display:inline-block;padding-bottom:.6mm;margin-bottom:3mm!important}
.peq{font-size:7.4pt!important;color:var(--gris)}
.cascada{margin:0 0 3mm;padding:2.6mm 4mm}
.cascada p{font-size:8.2pt!important}
.legal{margin:2.5mm 0 0;font-size:7.2pt;color:var(--gris);line-height:1.4}
.abajo{margin-top:2mm;padding-top:2.4mm;border-top:.6pt solid var(--claro)}
table.fechas{width:100%;border-collapse:collapse;font-size:8pt;margin-bottom:1mm}
.fechas td{padding:.9mm 0;border-bottom:.6pt solid var(--claro)}
.fechas td:last-child{text-align:right;font-weight:800;color:var(--negro);white-space:nowrap}
.cita{background:var(--fondo);border-left:3pt solid var(--ambar);padding:3mm 4mm;font-size:8.4pt!important}
`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>La ciencia ciudadana en España · Factsheet</title>
<link rel="stylesheet" href="fonts/fuentes.css">
<style>${cssCabecera}
${css}</style>
</head>
<body>
${cabeceraSitio}
${p1}
${p2}
${p3}
${p3b}
${p3c}
${p4}
${p5}
</body>
</html>
`;

fs.writeFileSync(path.join(WEB, 'factsheet.html'), html);
console.log(`web/factsheet.html (${(html.length / 1024).toFixed(0)} KB)`);

if (process.argv.includes('--pdf')) {
  const { chromium } = await import('playwright');
  const b = await chromium.launch();
  const page = await b.newPage();
  await page.goto(`file://${path.join(WEB, 'factsheet.html')}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: path.join(WEB, 'factsheet.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await b.close();
  console.log('web/factsheet.pdf');
}
