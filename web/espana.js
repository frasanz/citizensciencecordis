// Pestaña de convocatorias españolas: AEI, FECYT y Fundacion Biodiversidad.
// La unidad es la ayuda a una entidad, no el consorcio: por eso los filtros y
// las cifras no son los de la pestaña europea.
import { recomputarNacional, crearClaveEntidadNacional, FINANCIADORES, ETIQUETA_FINANCIADOR, VIAS, CCAA_VIAS } from './src/nacional.js';
import { TABLAS_NACIONAL } from './src/exportar.js';
import {
  num, pc, millones, euros, el, esc, normaliza, fecha, tile, boton, registrarAyuda,
  tabla, grafico, buscadorEntidad, descargarCsv, alRedimensionar,
} from './comun.js';

const COLOR = { AEI: 'var(--aei)', FECYT: 'var(--fecyt)', FB: 'var(--fb)' };
const VIA_CORTA = { titulo: 'título', resumen: 'resumen', categoria: 'línea FECYT', 'palabras-clave': 'palabras clave' };
const CCAA_VIA_CORTA = { fuente: 'fuente', cruce: 'cruce', localizacion: 'localización', nombre: 'nombre', manual: 'manual', 'sin-ccaa': 'sin determinar' };

const estado = {
  base: null, vista: null,
  financiadores: [], vias: [],
  anios: null, limites: null,   // [desde, hasta], años inclusive
  ccaa: null, entidad: null,
  entidades: [], claveEntidad: null,
  orden: { col: 'anio', dir: -1 },
  limite: 50,
  abiertas: new Set(),          // ayudas con el resumen desplegado en la tabla
};

let iniciado = false;
export async function init() {
  if (iniciado) return;
  iniciado = true;
  try {
    const res = await fetch('./data/nacional.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`no se pudo leer data/nacional.json (${res.status})`);
    fijarBase(await res.json());
  } catch (e) {
    el('#estado-es').innerHTML = `<span class="error">${esc(e.message)}.`
      + ' Genera los datos con <code>node scripts/snapshot.js --programas=AEI,FECYT,FB</code>.</span>';
    el('#filtros-es').style.display = 'none';
  }
  el('#descargar-todo-es').addEventListener('click', descargarTodo);
  alRedimensionar(() => { if (estado.vista) pintarGrafico(); });
}

function fijarBase(datos) {
  estado.base = datos;
  const disponibles = FINANCIADORES.map((f) => f.codigo).filter((c) => datos.ayudas.some((a) => a.financiador === c));
  estado.financiadores = [...disponibles];
  estado.vias = [...new Set(datos.ayudas.map((a) => a.via))];
  const anios = datos.ayudas.map((a) => a.anio).filter(Boolean);
  estado.limites = [Math.min(...anios), Math.max(...anios)];
  estado.anios = [...estado.limites];
  estado.claveEntidad = crearClaveEntidadNacional(datos.ayudas);
  estado.entidades = indexarEntidades(datos.ayudas);
  el('#filtros-es').style.display = '';
  construirFiltros(disponibles);
  aplicar();
}

// ---------- buscador de entidad ----------
function indexarEntidades(ayudas) {
  const m = new Map();
  for (const a of ayudas) {
    const clave = estado.claveEntidad(a);
    let e = m.get(clave);
    if (!e) m.set(clave, e = { clave, nombre: a.entidad, ccaa: a.ccaa, ayudas: 0, nombres: new Set() });
    e.ayudas++;
    e.nombres.add(a.entidad);
    if (!e.ccaa && a.ccaa) e.ccaa = a.ccaa;
  }
  return [...m.values()]
    .map((e) => ({ ...e, texto: normaliza([...e.nombres].join(' ')) }))
    .sort((a, b) => b.ayudas - a.ayudas || a.nombre.localeCompare(b.nombre, 'es'));
}

function buscarEntidades(consulta, max = 8) {
  const palabras = normaliza(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const q = palabras.join(' ');
  const peso = (e) => (e.texto.startsWith(q) ? 0 : 1);
  return estado.entidades
    .filter((e) => palabras.every((w) => e.texto.includes(w)))
    .sort((a, b) => peso(a) - peso(b) || b.ayudas - a.ayudas)
    .slice(0, max);
}

const entidadDe = (clave) => estado.entidades.find((e) => e.clave === clave) ?? null;

function elegirEntidad(clave) {
  estado.entidad = clave;
  pintarEntidad();
  aplicar();
}

function pintarEntidad() {
  const cont = el('#f-entidad-cont');
  if (!cont) return;
  buscadorEntidad({
    cont, idBase: 'f-entidad', elegida: entidadDe(estado.entidad), placeholder: 'Nombre de una entidad beneficiaria',
    chip: (e) => `<span class="pais">${esc(siglaCcaa(e.ccaa))}</span><span class="nom">${esc(e.nombre)}</span>`,
    sugerir: buscarEntidades,
    opcion: (e) => `<span class="pais">${esc(siglaCcaa(e.ccaa))}</span><span class="nom">${esc(e.nombre)}</span><span class="pct">${num(e.ayudas)}</span>`,
    alElegir: (e) => elegirEntidad(e.clave),
    alQuitar: () => elegirEntidad(null),
  });
}

// Abreviatura de la CCAA para los chips (tres letras, como los codigos de pais).
const SIGLAS_CCAA = {
  'Andalucía': 'AND', 'Aragón': 'ARA', 'Asturias': 'AST', 'Illes Balears': 'BAL', 'Canarias': 'CAN', 'Cantabria': 'CTB',
  'Castilla y León': 'CYL', 'Castilla-La Mancha': 'CLM', 'Cataluña': 'CAT', 'Comunidad Valenciana': 'VAL', 'Extremadura': 'EXT',
  'Galicia': 'GAL', 'Madrid': 'MAD', 'Murcia': 'MUR', 'Navarra': 'NAV', 'País Vasco': 'PVA', 'La Rioja': 'RIO', 'Ceuta': 'CEU', 'Melilla': 'MEL',
};
const siglaCcaa = (c) => SIGLAS_CCAA[c] || '··';

// ---------- filtros ----------
function construirFiltros(disponibles) {
  const ccaas = [...new Set(estado.base.ayudas.map((a) => a.ccaa).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const anios = [];
  for (let y = estado.limites[0]; y <= estado.limites[1]; y++) anios.push(y);
  const selAnio = (id, valor) => `<select id="${id}">${anios.map((y) => `<option ${y === valor ? 'selected' : ''}>${y}</option>`).join('')}</select>`;

  el('#filtros-es').innerHTML = `
    <div class="grupo"><span>Financiador${boton('esFiltroFinanciador')}</span><div class="opciones">${
      disponibles.map((c) => {
        const f = FINANCIADORES.find((x) => x.codigo === c);
        return `<label class="chip on" data-fin="${c}" style="color:${COLOR[c]}">
                 <i class="punto" style="background:${COLOR[c]}"></i><input type="checkbox" checked>
                 ${esc(f?.etiqueta || c)}</label>`;
      }).join('')}</div></div>
    <div class="grupo"><span>Comunidad autónoma${boton('esFiltroCcaa')}</span>
      <select id="f-ccaa"><option value="">Todas</option>${ccaas.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        <option value="sin">Sin determinar</option></select></div>
    <div class="grupo"><span>Año${boton('esFiltroAnio')}</span><div class="opciones periodo">
      <span class="rot">de</span>${selAnio('f-anio-desde', estado.anios[0])}
      <span class="rot">a</span>${selAnio('f-anio-hasta', estado.anios[1])}
      <button id="f-anio-reset" title="Todos los años disponibles">Todo</button></div></div>
    <div class="grupo"><span>Vía de entrada${boton('esFiltroVia')}</span><div class="opciones">${
      Object.keys(VIA_CORTA).filter((v) => estado.base.ayudas.some((a) => a.via === v)).map((v) =>
        `<label class="chip on" data-via="${v}"><input type="checkbox" checked>${esc(VIA_CORTA[v])}</label>`).join('')}</div></div>
    <div class="grupo socio"><span>Entidad${boton('esFiltroEntidad')}</span><div id="f-entidad-cont"></div></div>`;
  pintarEntidad();

  const chips = (attr, lista) => el('#filtros-es').querySelectorAll(`[data-${attr}]`).forEach((lab) => {
    lab.addEventListener('click', (ev) => {
      ev.preventDefault();
      const c = lab.dataset[attr];
      const i = lista.indexOf(c);
      if (i >= 0) { if (lista.length === 1) return; lista.splice(i, 1); }
      else lista.push(c);
      lab.classList.toggle('on');
      if (attr === 'fin') lab.style.color = lab.classList.contains('on') ? COLOR[c] : '';
      lab.querySelector('input').checked = lab.classList.contains('on');
      aplicar();
    });
  });
  chips('fin', estado.financiadores);
  chips('via', estado.vias);
  el('#f-ccaa').addEventListener('change', (e) => { estado.ccaa = e.target.value || null; aplicar(); });
  const alCambiarAnio = () => {
    const d = +el('#f-anio-desde').value, h = +el('#f-anio-hasta').value;
    estado.anios = d <= h ? [d, h] : [h, d];
    el('#f-anio-desde').value = estado.anios[0];
    el('#f-anio-hasta').value = estado.anios[1];
    aplicar();
  };
  el('#f-anio-desde').addEventListener('change', alCambiarAnio);
  el('#f-anio-hasta').addEventListener('change', alCambiarAnio);
  el('#f-anio-reset').addEventListener('click', () => {
    estado.anios = [...estado.limites];
    el('#f-anio-desde').value = estado.anios[0];
    el('#f-anio-hasta').value = estado.anios[1];
    aplicar();
  });
}

function aplicar() {
  estado.limite = 50;
  estado.vista = recomputarNacional(estado.base, {
    financiadores: estado.financiadores, vias: estado.vias, anios: estado.anios,
    ccaa: estado.ccaa === 'sin' ? '' : estado.ccaa, entidad: estado.entidad, claveEntidad: estado.claveEntidad,
  });
  // `ccaa: ''` significa "sin determinar"; null, todas.
  if (estado.ccaa === 'sin') {
    estado.vista = recomputarNacional({ ...estado.base, ayudas: estado.base.ayudas.filter((a) => !a.ccaa) }, {
      financiadores: estado.financiadores, vias: estado.vias, anios: estado.anios, entidad: estado.entidad, claveEntidad: estado.claveEntidad,
    });
  }
  pintar();
}

// ---------- pintado ----------
function pintar() {
  const r = estado.vista, s = r.resumen;
  const f = estado.base.meta.fuentes || [];
  const filtro = estado.base.meta.filtro || {};

  el('#fuente-es').innerHTML = 'Fuentes: ' + f.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.nombre)}</a>`
      + ` <span class="pct">(${x.anios ? `${x.anios[0]}–${x.anios[x.anios.length - 1]}, ` : ''}leído el ${fecha(x.actualizado)})</span>`).join(' · ')
    + `<br>Criterio: ${(filtro.frases || []).map((p) => `<code>${esc(p)}</code>`).join(' / ')} en título o resumen`
    + '; en FECYT, además, la línea de <em>ciencia ciudadana</em> de la convocatoria; en la AEI, además, las palabras clave.';

  el('#cifras-es').innerHTML = [
    tile(num(s.totalAyudas), 'ayudas concedidas', r.financiadores.map((x) => `${x.etiqueta}: ${num(x.ayudas)}`).join(' · '), false, 'esAyudas'),
    tile(num(s.entidades), 'entidades beneficiarias', 'distintas, por CIF o por nombre', false, 'esEntidades'),
    tile(millones(s.importeTotal), 'importe concedido', s.sinImporte ? `${num(s.sinImporte)} ayudas sin importe publicado` : `media de ${euros(s.importeMedio)} por ayuda`, false, 'esImporte'),
    tile(num(s.ccaaConAyudas), 'comunidades autónomas', s.sinCcaa ? `${num(s.sinCcaa)} ayudas sin CCAA determinada` : 'con alguna ayuda', false, 'esCcaa'),
  ].join('');

  el('#t-grafico-es').innerHTML = 'Ayudas por año' + boton('esGrafico');
  pintarGrafico();

  tabla('#p-ccaa', 'Comunidades autónomas', 'Por la sede de la entidad beneficiaria, no por dónde se ejecuta el proyecto.', 'ccaa',
    ['Comunidad', 'Ayudas', '%', 'Entidades', 'Importe'],
    r.ccaa.slice(0, 20), (c) => [
      c.clave ? esc(c.etiqueta) : '<span class="mas">Sin determinar</span>',
      num(c.ayudas), `<span class="pct">${pc(c.pctAyudas)}</span>`, num(c.entidades), c.importe ? millones(c.importe) : '—'], 'esTablaCcaa', descargar);

  tabla('#p-convocatorias', 'Convocatorias', 'Nombre de la convocatoria tal como lo da cada financiador.', 'convocatorias',
    ['Convocatoria', 'Ayudas', 'Entidades', 'Años', 'Importe'],
    r.convocatorias.slice(0, 16), (c) => [
      `<span class="nom" title="${esc(c.etiqueta)}"><span style="color:${COLOR[c.financiadores[0]]}">${esc(ETIQUETA_FINANCIADOR[c.financiadores[0]] || c.financiadores[0])}</span> · ${esc(c.etiqueta)}</span>`,
      num(c.ayudas), num(c.entidades), c.desde === c.hasta ? c.desde ?? '—' : `${c.desde}–${c.hasta}`, c.importe ? millones(c.importe) : '—'], 'esTablaConvocatorias', descargar);

  tabla('#p-entidades-es', 'Entidades más activas', 'Por número de ayudas. Pulsa una para quedarte con las suyas.', 'entidades-es',
    ['Entidad', 'CCAA', 'Ayudas', 'Financiadores', 'Importe'],
    r.entidades.slice(0, 14), (e) => [
      `<a href="#" class="nom" data-entidad="${esc(e.clave)}" title="${esc(e.nombre)}">${esc(e.nombre)}</a>`,
      esc(e.ccaa || '—'), num(e.ayudas), e.financiadores.map((x) => `<span style="color:${COLOR[x]}">${esc(ETIQUETA_FINANCIADOR[x] || x)}</span>`).join(', '),
      e.importe ? euros(e.importe) : '—'], 'esTablaEntidades', descargar);
  el('#p-entidades-es').querySelectorAll('[data-entidad]').forEach((a) =>
    a.addEventListener('click', (ev) => { ev.preventDefault(); elegirEntidad(a.dataset.entidad); }));

  el('#p-vias').innerHTML = `
    <div class="cabecera-tabla"><div><h2>Trazabilidad${boton('esTablaVias')}</h2>
      <p class="nota">Por qué entra cada ayuda y de dónde sale su comunidad autónoma. Ambas columnas van en el CSV.</p></div></div>
    <div class="dos-tablas">
      <div class="tabla-scroll"><table><thead><tr><th>Vía de entrada</th><th>Ayudas</th></tr></thead><tbody>${
        r.vias.map((v) => `<tr><td title="${esc(VIAS[v.clave] || '')}">${esc(VIA_CORTA[v.clave] || v.clave)}</td><td>${num(v.ayudas)}</td></tr>`).join('')}</tbody></table></div>
      <div class="tabla-scroll"><table><thead><tr><th>CCAA resuelta por</th><th>Ayudas</th></tr></thead><tbody>${
        r.ccaaVias.map((v) => `<tr><td title="${esc(CCAA_VIAS[v.clave] || '')}">${esc(CCAA_VIA_CORTA[v.clave] || v.clave)}</td><td>${num(v.ayudas)}</td></tr>`).join('')}</tbody></table></div>
    </div>`;

  tablaAyudas();

  el('#pie-es').innerHTML = `Generado el ${fecha(r.meta.generado)} · Datos: `
    + '<a href="https://www.aei.gob.es/ayudas-concedidas/buscador-ayudas-concedidas" target="_blank" rel="noopener">AEI</a>, '
    + '<a href="https://www.convocatoria.fecyt.es/publico/Resolucion/resolucion.aspx" target="_blank" rel="noopener">FECYT</a> y '
    + '<a href="https://fundacion-biodiversidad.es/buscador-de-proyectos/" target="_blank" rel="noopener">Fundación Biodiversidad</a>'
    + ' · Cifras recalculadas en el navegador a partir de los datos originales.';
}

function pintarGrafico() {
  grafico(el('#grafico-es'), el('#leyenda-es'), estado.vista.serie, {
    claves: estado.financiadores, campo: 'porFinanciador', titulo: 'Ayudas por año',
    color: (c) => COLOR[c], etiqueta: (c) => ETIQUETA_FINANCIADOR[c] || c,
  });
}

// ---------- tabla de ayudas ----------
function columnasAyudas() {
  return [
    { id: 'titulo', t: 'Título', v: (a) => a.titulo || '', izq: true,
      c: (a) => `<button type="button" class="desplegar" data-id="${esc(a.id)}" aria-expanded="${estado.abiertas.has(a.id)}" title="Ver detalle">${estado.abiertas.has(a.id) ? '▾' : '▸'}</button>`
        + `<a href="${esc(a.url)}" target="_blank" rel="noopener" class="nom" title="${esc(a.titulo)}">${esc(a.titulo)}</a>` },
    { id: 'entidad', t: 'Entidad', v: (a) => a.entidad || '', izq: true,
      c: (a) => `<span class="ent" title="${esc(a.entidad)}">${esc(a.entidad || '—')}</span>` },
    { id: 'ccaa', t: 'CCAA', v: (a) => a.ccaa || '', izq: true,
      c: (a) => a.ccaa ? `<span title="CCAA por: ${esc(CCAA_VIAS[a.ccaaVia] || a.ccaaVia)}">${esc(a.ccaa)}</span>` : '<span class="mas">—</span>' },
    { id: 'financiador', t: 'Financiador', v: (a) => `${a.financiador} ${a.convocatoria}`, izq: true,
      c: (a) => `<span class="ent" title="${esc(a.convocatoria)}"><span style="color:${COLOR[a.financiador]}">${esc(ETIQUETA_FINANCIADOR[a.financiador] || a.financiador)}</span>`
        + `<span class="pct"> · ${esc(a.convocatoria)}</span></span>` },
    { id: 'anio', t: 'Año', v: (a) => a.anio || 0, c: (a) => a.anio ?? '—' },
    { id: 'importe', t: 'Importe', v: (a) => a.importe || 0, c: (a) => euros(a.importe) },
    { id: 'via', t: 'Vía', v: (a) => a.via, izq: true, movil: false, c: (a) => `<span class="via" title="${esc(VIAS[a.via] || '')}">${esc(VIA_CORTA[a.via] || a.via)}</span>` },
  ];
}

function detalle(a) {
  const partes = [];
  if (a.categoria) partes.push(`<b>Categoría o área:</b> ${esc(a.categoria)}`);
  if (a.referencia) partes.push(`<b>Referencia:</b> ${esc(a.referencia)}`);
  if (a.cif) partes.push(`<b>CIF:</b> ${esc(a.cif)}`);
  if (a.provincia) partes.push(`<b>Provincia:</b> ${esc(a.provincia)}`);
  if (a.localizacion) partes.push(`<b>Localización del proyecto:</b> ${esc(a.localizacion)}`);
  if (a.inicio || a.fin) partes.push(`<b>Ejecución:</b> ${esc(a.inicio || '?')} → ${esc(a.fin || '?')}`);
  if (a.presupuesto) partes.push(`<b>Presupuesto total:</b> ${euros(a.presupuesto)}`);
  if (a.fondo) partes.push(`<b>Fondo:</b> ${esc(a.fondo)}`);
  if (a.estado) partes.push(`<b>Estado:</b> ${esc(a.estado)}`);
  partes.push(`<b>Entra por:</b> ${esc(VIAS[a.via] || a.via)}`);
  partes.push(`<b>CCAA por:</b> ${esc(CCAA_VIAS[a.ccaaVia] || a.ccaaVia)}`);
  const resumen = a.resumen ? `<p class="resumen">${esc(a.resumen).replace(/\n/g, '<br>')}</p>`
    : '<p class="resumen mas">Esta fuente no publica descripción del proyecto.</p>';
  return `<div class="detalle-ayuda"><p class="datos">${partes.join(' · ')}</p>${resumen}</div>`;
}

function tablaAyudas() {
  const r = estado.vista;
  const cols = columnasAyudas();
  const { col, dir } = estado.orden;
  const cmp = cols.find((c) => c.id === col) ?? cols[4];
  const entidad = entidadDe(estado.entidad);

  const orden = [...r.ayudas].sort((a, b) => {
    const x = cmp.v(a), y = cmp.v(b);
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir || String(a.titulo).localeCompare(String(b.titulo), 'es');
    return String(x).localeCompare(String(y), 'es', { numeric: true }) * dir;
  });
  const vistos = orden.slice(0, estado.limite);
  const quedan = orden.length - vistos.length;
  const nCols = cols.length;

  el('#p-ayudas').innerHTML = `
    <div class="cabecera-tabla">
      <div><h2>Ayudas${boton('esTablaAyudas')}</h2>
        <p class="nota">${entidad
          ? `Las ${num(orden.length)} ayudas de <b title="${esc(entidad.nombre)}">${esc(entidad.nombre)}</b>.`
          : `Las ${num(orden.length)} ayudas que cumplen el criterio.`}
          Pulsa una cabecera para ordenar, el título para abrir la fuente y ▸ para ver el resumen y el detalle.</p></div>
      <button data-csv="ayudas">CSV</button></div>
    <div class="tabla-scroll"><table><thead><tr>${
      cols.map((c) => `<th class="ord${c.id === col ? ' activa' : ''}${c.id === col && dir === -1 ? ' desc' : ''}${c.movil === false ? ' escritorio' : ''}"
        data-col="${c.id}">${esc(c.t)}</th>`).join('')}</tr></thead>
      <tbody>${vistos.map((a) => `<tr>${
        cols.map((c) => `<td class="${c.izq ? 'izq' : ''}${c.movil === false ? ' escritorio' : ''}">${c.c(a)}</td>`).join('')}</tr>`
        + (estado.abiertas.has(a.id) ? `<tr class="fila-detalle"><td colspan="${nCols}" class="izq">${detalle(a)}</td></tr>` : '')).join('')}</tbody></table></div>
    ${quedan > 0 ? `<div style="margin-top:11px"><button id="mas-ayudas">Ver las ${num(quedan)} restantes</button></div>` : ''}`;

  el('#p-ayudas').querySelector('[data-csv]').addEventListener('click', () => descargar('ayudas'));
  el('#p-ayudas').querySelectorAll('[data-col]').forEach((th) => {
    th.addEventListener('click', () => {
      const id = th.dataset.col;
      estado.orden = estado.orden.col === id
        ? { col: id, dir: -estado.orden.dir }
        : { col: id, dir: ['anio', 'importe'].includes(id) ? -1 : 1 };
      tablaAyudas();
    });
  });
  el('#p-ayudas').querySelectorAll('.desplegar').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (estado.abiertas.has(id)) estado.abiertas.delete(id); else estado.abiertas.add(id);
      tablaAyudas();
    });
  });
  el('#mas-ayudas')?.addEventListener('click', () => { estado.limite = Infinity; tablaAyudas(); });
}

// ---------- ayuda contextual ----------
registrarAyuda({
  esAyudas: ['Ayudas concedidas',
    'Cada fila es una <b>ayuda a una entidad</b>: no hay consorcios ni socios. Por eso esta pestaña no se puede sumar a la europea, donde la unidad es el proyecto con todos sus participantes.',
    'Entran las que mencionan <code>ciencia ciudadana</code> (o <code>citizen science</code>, o sus variantes en catalán, gallego y euskera) en el título o el resumen; en FECYT también las concedidas en la línea de ciencia ciudadana de la convocatoria, y en la AEI las que la declaran entre sus palabras clave.',
    'En la AEI se incluyen contratos y estancias, no solo proyectos, porque su buscador los publica juntos y el criterio se aplica igual. La tabla de convocatorias permite separarlos.'],
  esEntidades: ['Entidades beneficiarias',
    'Entidades distintas que reciben alguna ayuda. La AEI da el CIF; FECYT y la Fundación Biodiversidad solo el nombre, que se cruza con el CIF cuando coincide sin acentos ni mayúsculas.',
    'El CSIC aparece como una sola entidad, aunque cada ayuda la ejecute un instituto distinto: es lo que publica cada fuente.'],
  esImporte: ['Importe concedido',
    'Suma de lo que cada financiador concede a la entidad. En la AEI es la ayuda concedida; en FECYT, la propuesta de financiación final de la resolución; en la Fundación Biodiversidad, el importe de la ayuda de su ficha.',
    'La Fundación Biodiversidad no publica el importe en todas las fichas: esas ayudas cuentan en el número pero no en el dinero. La cifra de debajo lo avisa.'],
  esCcaa: ['Comunidades autónomas',
    'Comunidad autónoma de la <b>sede de la entidad beneficiaria</b>, no del lugar donde se ejecuta el proyecto. La AEI y FECYT la publican; para la Fundación Biodiversidad se resuelve cruzando el nombre con las otras fuentes, con la localización de la ficha si nombra una sola comunidad, con el nombre de la entidad, o a mano.',
    'La tabla de trazabilidad dice cuántas ayudas van por cada vía. Las que quedan sin determinar cuentan en el total, no en ninguna cifra por comunidad.'],
  esGrafico: ['Ayudas por año',
    'Cada ayuda se cuenta en su año, con el color del financiador. En la AEI y FECYT es el año de la convocatoria; en la Fundación Biodiversidad, el de inicio de ejecución según su ficha.',
    'El primer año con datos de FECYT es 2020, porque solo publica en PDF las resoluciones desde entonces. La AEI cubre desde 2009.'],
  esTablaCcaa: ['Comunidades autónomas',
    'Ayudas y entidades por comunidad autónoma de la sede de la entidad beneficiaria, con el importe concedido.',
    'Una entidad con varias ayudas suma varias veces en ayudas y una en entidades.'],
  esTablaConvocatorias: ['Convocatorias',
    'La convocatoria de la que sale cada ayuda, con el nombre que le da el financiador: en la AEI, el tipo de convocatoria; en FECYT, la convocatoria anual; en la Fundación Biodiversidad, el programa de la ficha.',
    'Sirve para separar proyectos de contratos y estancias, que la AEI publica juntos.'],
  esTablaEntidades: ['Entidades más activas',
    'Entidades ordenadas por número de ayudas. <b>Financiadores</b> dice de quién las reciben. Pulsa un nombre para quedarte solo con sus ayudas.'],
  esTablaVias: ['Trazabilidad',
    'Cada ayuda lleva anotada la <b>vía</b> por la que entra: la frase en el título, en el resumen, la línea de ciencia ciudadana de FECYT o las palabras clave de la AEI. Las palabras clave no se pueden exportar del buscador de la AEI, así que son la única vía que no se comprueba aquí; el filtro de arriba permite quitarlas.',
    'Y la vía por la que se ha resuelto su <b>comunidad autónoma</b>. Las que quedan sin determinar se listan en <code>datos/ccaa-entidades-pendientes.csv</code> para completarlas a mano.'],
  esTablaAyudas: ['Ayudas',
    'La lista completa que cumple el criterio. El título enlaza a la fuente: la ficha del buscador de la AEI, el PDF de la resolución de FECYT o la ficha de la Fundación Biodiversidad.',
    'El botón ▸ despliega el resumen (la AEI y la Fundación Biodiversidad lo publican; FECYT no), la categoría, la referencia y el resto de datos de la fuente.'],
  esFiltroFinanciador: ['Financiador',
    '<b>AEI</b>, la Agencia Estatal de Investigación, con todas sus convocatorias desde 2009. <b>FECYT</b>, con su convocatoria anual de fomento de la cultura científica, que tiene línea propia de ciencia ciudadana desde 2020. <b>Fundación Biodiversidad</b>, del MITECO, con sus convocatorias de ayudas y programas (PRTR, Empleaverde, Pleamar, FEDER, Biodiversa+).',
    'Los fondos europeos que gestiona la Fundación Biodiversidad (FEDER, FSE, PRTR) se quedan aquí y no en la pestaña europea: la línea entre pestañas es quién concede la ayuda, no de dónde sale el dinero.'],
  esFiltroCcaa: ['Comunidad autónoma',
    'Quedan solo las ayudas cuya entidad beneficiaria tiene la sede en esa comunidad. «Sin determinar» muestra las que no se han podido resolver.'],
  esFiltroAnio: ['Año',
    'Año de la convocatoria (AEI, FECYT) o de inicio de ejecución (Fundación Biodiversidad), ambos extremos incluidos.',
    'Las ayudas sin año no se descartan nunca.'],
  esFiltroVia: ['Vía de entrada',
    'Permite quedarse solo con las ayudas que entran por una vía concreta. Desmarca <i>palabras clave</i> para ver únicamente las que se pueden comprobar sobre el título o el resumen.'],
  esFiltroEntidad: ['Entidad',
    'Escribe parte del nombre de una entidad y elígela: todas las cifras y tablas pasan a contar solo sus ayudas. Búsqueda sin acentos y por cualquier palabra.'],
});

// ---------- descargas ----------
const descargar = (nombre) => descargarCsv(TABLAS_NACIONAL[nombre](estado.vista), nombre);
const descargarTodo = () => Object.keys(TABLAS_NACIONAL).forEach((n, i) => setTimeout(() => descargar(n), i * 250));
