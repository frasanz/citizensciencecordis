// Factsheet "La ciencia ciudadana en España": 4 paginas A4 con la identidad de
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
function columnas(datos, series, { ancho = 700, alto = 150, superpuesta = false, etiquetaAnios = 1 } = {}) {
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
    if (t) g += `<text x="${(x + ancho1 / 2).toFixed(1)}" y="${(mt + h - (t / tope) * h - 3).toFixed(1)}" text-anchor="middle" class="eje v">${t}</text>`;
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
const fuenteEs = Object.fromEntries(nacTodo.meta.fuentes.map((f) => [f.codigo, f]));
const top = (arr, n, f) => [...arr].sort((a, b) => f(b) - f(a)).slice(0, n);
const ordinal = (n) => (n === 1 ? 'el primer puesto' : `el puesto ${n}`);

const S = nac.resumen;
const ccaaTop = nac.ccaa.filter((c) => c.clave).slice(0, 10);
const anioActual = new Date(eu.meta.generado).getFullYear();
const serieEu = eu.serie.filter((s) => s.anio >= 2011);
const serieNac = nac.serie.filter((s) => s.anio >= 2012).map((s) => ({ anio: s.anio, ...s.porFinanciador }));
const aniosNacFuerte = nac.serie.filter((s) => s.anio >= 2018 && s.anio < anioActual);
const mediaReciente = aniosNacFuerte.reduce((s, x) => s + x.total, 0) / (aniosNacFuerte.length || 1);
const mediaAntes = nac.serie.filter((s) => s.anio >= 2013 && s.anio <= 2016).reduce((s, x) => s + x.total, 0) / 4;
const personal = nacTodo.tipos.find((t) => t.clave === 'personal');
const estancia = nacTodo.tipos.find((t) => t.clave === 'estancia');
const finEtiqueta = { AEI: 'AEI', FECYT: 'FECYT', FB: 'Fundación Biodiversidad' };
const concentracion = (ccaaTop[0].ayudas + ccaaTop[1].ayudas) / S.totalAyudas * 100;

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
    t: `${num(S.totalAyudas)} proyectos nacionales, ${meur(S.importeTotal)} concedidos`,
    p: `Entre 2009 y ${S.hasta}, AEI, FECYT y la Fundación Biodiversidad han concedido ayudas a ${num(S.entidades)} entidades. Desde 2018 se financian de media unos ${num(mediaReciente)} proyectos al año, frente a unos ${num(mediaAntes)} entre 2013 y 2016.` },
];

// ---------- piezas de pagina ----------
const cabecera = (n, kicker) => `<header class="cab"><img src="img/ibercivis-logo.png" alt="Ibercivis"><span>${esc(kicker)}</span></header>`;
const pie = (n, texto) => `<footer class="pie"><span>${texto}</span><b>${n} / 6</b></footer>`;
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
        <p><b>${meur(S.importeTotal)}</b> concedidos por convocatorias estatales (AEI, FECYT, Fundación Biodiversidad) · ${100 - pctEu} %</p>
      </div>
    </div>
    <div class="kpis">
      ${kpi(num(es.proyectos), 'proyectos europeos con participación española', `${pct(es.pctSobreTotal)} de los ${num(E.totalProyectos)} del criterio`)}
      ${kpi(num(es.coordinados), 'proyectos europeos coordinados desde España', `${meur(es.aportacionNeta)} de contribución neta UE`)}
      ${kpi(num(S.totalAyudas), 'proyectos financiados en convocatorias españolas', `${num(S.entidades)} entidades · ${S.desde}–${S.hasta}`)}
      ${kpi(meur(S.importeTotal), 'concedidos en esas convocatorias', `${num(S.sinImporte)} sin importe publicado`)}
    </div>
  </div>
  <div class="cuerpo">
    <h2>Tres mensajes clave</h2>
    <ol class="mensajes">
      ${mensajes.map((m) => `<li><span class="num">${m.n}</span><div><h3>${esc(m.t)}</h3><p>${esc(m.p)}</p></div></li>`).join('')}
    </ol>
    <div class="recuadro">
      <h3>Cómo leer estas cifras</h3>
      <p>Un proyecto es de <b>ciencia ciudadana</b> si la expresión aparece en su título o descripción: una medida textual y reproducible, no un juicio de calidad. <b>El número de proyectos no se suma</b> (un proyecto con consorcio no es una ayuda a una entidad). El importe total junta la contribución neta de la UE a entidades españolas y lo concedido por financiadores estatales, sin restar posibles solapes, y es un <b>mínimo</b>: no incluye Erasmus+, Europa Creativa ni Kohesio, ni lo no atribuible de LIFE. Detalle en la página 6.</p>
    </div>
  </div>
  ${pie(1, 'Fuentes: CORDIS, CINEA (LIFE), AEI, FECYT y Fundación Biodiversidad · Elaboración: Ibercivis')}
</section>`;

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
    ${fig('Proyectos por año de inicio y programa', columnas(serieProg, progOrden.map((c) => ({ clave: c, color: colProg[c] })), { alto: 152 })
      + leyenda(progOrden.map((c) => ({ et: etProg[c], color: colProg[c] }))),
      `${num(serieEu.filter((s) => s.anio >= anioActual).reduce((s, x) => s + x.total, 0))} proyectos con inicio en ${anioActual} o después ya están firmados; el año en curso no está cerrado.`)}
    <div class="rejilla">
      ${fig('Proyectos por país', barrasH(topPaises('proyectos', 10)), 'Con al menos una entidad del país en el consorcio.')}
      ${fig('Áreas temáticas con más proyectos', barrasH(areasTop, { etAncho: 178, ancho: 360 }), 'Subprograma bajo el que se financia, con el nombre oficial de CORDIS traducido.')}
    </div>
    <h3 class="subtit">Comparación por habitante</h3>
    <div class="rejilla">
      ${fig('Proyectos por millón de habitantes', barrasH(topConEs('permm', 8), { fmt: dec1 }),
        `Países con al menos ${MIN_PROYECTOS_HAB} proyectos (${habitantes.length}). Población a 1 de enero de ${anioPob}, Eurostat.${sinPoblacion.length ? ` Sin ${sinPoblacion.join(', ')}: Eurostat no publica su población.` : ''}`)}
      ${fig('Contribución neta de la UE por habitante (€)', barrasH(topConEs('eurHab', 8), { fmt: (v) => dec1(v) }),
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
    ${fig('Proyectos por año de inicio', columnas(serieEu.map((s) => ({ anio: s.anio, total: s.total, foco: s.foco })), [{ clave: 'total', color: C.claro }, { clave: 'foco', color: C.ambar }], { superpuesta: true, alto: 140 })
      + leyenda([{ et: 'Todos los proyectos', color: C.claro }, { et: 'Con participación española', color: C.ambar }]))}
    <p class="tendencia">${fraseTendencia}</p>
    <div class="rejilla">
      ${fig('Proyectos coordinados', barrasH(topPaises('coordinados')))}
      ${fig('Contribución neta de la UE (M€)', barrasH(top(paises, 8, (p) => p.aportacionNeta).map((p) => ({ et: pais(p.pais), v: p.aportacionNeta / 1e6, resaltar: p.pais === 'ES' })), { fmt: (v) => dec1(v) }),
        `CORDIS y LIFE${pctLife != null ? ` (LIFE: ${pctLife} % atribuido a un socio, del panel público de CINEA)` : ''}. Mínimo: lo no atribuido no se reparte.`)}
    </div>
    <div class="programas">${eu.programas.map((p) => `<div><b>${esc(p.etiqueta)}</b><span>España en ${num(p.foco)} de ${num(p.proyectos)} · ${pct(p.pctFoco)}</span></div>`).join('')}</div>
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

// ---------- pagina 3: convocatorias españolas ----------
const colFin = { AEI: C.negro, FECYT: C.medio, FB: C.claro };
const finOrden = ['AEI', 'FECYT', 'FB'].filter((f) => nac.financiadores.some((x) => x.clave === f));
const VIA = { titulo: 'En el título', resumen: 'En el resumen', 'palabras-clave': 'En las palabras clave', categoria: 'Línea FECYT' };
const viasTop = nac.vias.map((v) => ({ et: VIA[v.clave] || v.clave, v: v.ayudas }));
const p4 = `
<section class="pagina">
  ${cabecera(5, 'Convocatorias españolas')}
  <div class="cuerpo">
    <h2>${num(S.totalAyudas)} proyectos y ${meur(S.importeTotal)} concedidos desde ${S.desde}</h2>
    <p class="entra">AEI, FECYT y Fundación Biodiversidad. Aquí la unidad es la ayuda a una entidad, sin consorcios. Se cuentan solo proyectos: ${num(personal?.ayudas ?? 0)} contratos de personal y ${num(estancia?.ayudas ?? 0)} estancias de la AEI (${meur((personal?.importe ?? 0) + (estancia?.importe ?? 0))}) quedan fuera porque heredan el texto de su proyecto.</p>
    ${fig('Proyectos por año de convocatoria', columnas(serieNac, finOrden.map((f) => ({ clave: f, color: colFin[f] })), { alto: 152 })
      + leyenda(finOrden.map((f) => ({ et: finEtiqueta[f], color: colFin[f] }))),
      'Año de la convocatoria (AEI, FECYT) o de inicio de ejecución (Fundación Biodiversidad).')}
    <div class="rejilla">
      ${fig('Proyectos por comunidad autónoma', barrasH(ccaaTop.map((c, k) => ({ et: c.etiqueta, v: c.ayudas, resaltar: k === 0 })), { etAncho: 112 }),
        `Cataluña y Madrid reúnen el ${pct(concentracion)}. ${num(S.sinCcaa)} proyectos sin comunidad determinada.`)}
      ${fig('Importe concedido por financiador (M€)', barrasH(nac.financiadores.map((f) => ({ et: finEtiqueta[f.clave], v: f.importe / 1e6 })), { fmt: dec1, etAncho: 128 }),
        `${num(S.sinImporte)} proyectos, casi todos de la Fundación Biodiversidad, no publican importe.`)}
      ${fig('Entidades con más proyectos', barrasH(nac.entidades.slice(0, 8).map((e) => ({ et: corto(/CONSEJO SUPERIOR DE INVESTIGACIONES CIENT/i.test(e.nombre) ? 'CSIC' : titular(e.nombre).replace(/^Universidad/, 'U.').replace(/^Universitat/, 'U.'), 26), v: e.ayudas })), { etAncho: 150 }))}
      ${fig('Cómo entra cada proyecto en el criterio', barrasH(viasTop, { etAncho: 130 }), 'Un proyecto entra por la primera vía que cumple. «Palabras clave»: las declara el proyecto (en la AEI, sin poder comprobarlas aquí).')}
    </div>
  </div>
  ${pie(5, `Datos: AEI (${esc(fecha(fuenteEs.AEI.actualizado))}), FECYT y Fundación Biodiversidad · leídos de sus webs públicas`)}
</section>`;

// ---------- pagina 4: metodologia ----------
const fl = (f) => nacTodo.meta.filtro.frases.map((x) => `<i>${esc(x)}</i>`).join(', ');
const p5 = `
<section class="pagina">
  ${cabecera(6, 'Metodología y límites')}
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
      </tbody>
    </table>
    <div class="dos">
      <div>
        <h3>Qué hay que tener en cuenta</h3>
        <ul>
          <li><b>La medida es textual.</b> Detecta los proyectos que dicen ser de ciencia ciudadana, no los que lo son sin llamarlo así.</li>
          <li><b>Dos ámbitos, dos unidades.</b> Un proyecto europeo con su consorcio no equivale a una ayuda nacional: el número de proyectos no se suma. El importe total de la portada junta ambas medidas y es un mínimo.</li>
          <li><b>Contratos de la AEI fuera.</b> Los contratos de personal y las estancias repiten el texto de su proyecto y se cuentan aparte.</li>
          <li><b>Datos incompletos.</b> En LIFE ${pctLife != null ? `el ${pctLife} % del dinero` : 'parte del dinero'} está atribuido a un socio concreto y el resto no se reparte; la Fundación Biodiversidad no publica el importe en muchas fichas.</li>
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
      <p><b>Financiación en cascada.</b> Muchos proyectos europeos reparten parte de su presupuesto, mediante convocatorias abiertas a terceros, entre asociaciones, ayuntamientos, escuelas o grupos ciudadanos. Esas entidades no figuran como participantes en CORDIS ni en LIFE, así que no cuentan aquí: la huella real de la ciencia ciudadana sobre el terreno es mayor que la de estas tablas. Tampoco se incluyen la financiación regional, local o privada ni otros programas europeos (Interreg, Erasmus+ y Europa Creativa quedan fuera de las cifras de partida).</p>
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
  ${pie(6, `Generado el ${esc(fecha(eu.meta.generado))} · Elaboración: Ibercivis`)}
</section>`;

// ---------- documento ----------
const css = `
@page{size:A4;margin:0}
:root{--negro:${C.negro};--carbon:${C.carbon};--gris:${C.gris};--medio:${C.medio};--claro:${C.claro};--fondo:${C.fondo};--ambar:${C.ambar};--ambar-osc:${C.ambarOsc}}
*{box-sizing:border-box}
.serif,h1,h2,.kpi .n,.kp b,.posicion b,.mensajes .num{font-family:"Source Serif 4","Source Serif Pro",Georgia,"Times New Roman",serif}
html{background:#cfcfcf}
body{margin:0;color:var(--carbon);font:9.4pt/1.45 "Source Sans 3","Source Sans Pro","Segoe UI",Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pagina{position:relative;width:210mm;height:297mm;margin:8mm auto;background:#fff;overflow:hidden;break-after:page;page-break-after:always;display:flex;flex-direction:column}
@media print{html{background:none}.pagina{margin:0}}
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
.dos{display:grid;grid-template-columns:1.25fr 1fr;gap:9mm}
.dos ul{margin:0;padding-left:4.2mm;font-size:8.6pt}
.dos li{margin-bottom:1.6mm}
.dos p{margin:0 0 2mm;font-size:8.6pt}
.web{font-size:12pt!important;font-weight:700;font-family:"Source Serif 4",Georgia,serif;color:var(--negro);border-bottom:2pt solid var(--ambar);display:inline-block;padding-bottom:.6mm;margin-bottom:3mm!important}
.peq{font-size:7.4pt!important;color:var(--gris)}
.cascada{margin:0 0 3mm;padding:2.6mm 4mm}
.cascada p{font-size:8.2pt!important}
.legal{margin:2.5mm 0 0;font-size:7.2pt;color:var(--gris);line-height:1.4}
.abajo{margin-top:3mm;padding-top:3mm;border-top:.6pt solid var(--claro)}
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
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700;800&family=Source+Serif+4:wght@600;700;800&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
${p1}
${p2}
${p3}
${p3b}
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
