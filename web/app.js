// Pestaña de programas europeos: CORDIS (FP7, H2020, Horizonte Europa) y LIFE.
// Es la portada; las pestañas y la parte española se cargan desde aqui.
import { recomputar, crearClaveEntidad, PROGRAMAS, ETIQUETA_PROGRAMA } from './src/compute.js';
import { TABLAS } from './src/exportar.js';
import {
  num, pc, millones, mesAnio, el, esc, normaliza, fecha, tile, boton, registrarAyuda, instalarAyuda,
  tabla, grafico, buscadorEntidad, descargarCsv, alRedimensionar,
} from './comun.js';
import { instalarPestanas } from './pestanas.js';

// CORDIS usa codigos propios para dos paises (UK en vez de GB, EL en vez de GR).
const PAIS_ESPECIAL = { UK: 'Reino Unido', EL: 'Grecia' };
let regiones = null;
try { regiones = new Intl.DisplayNames(['es'], { type: 'region' }); } catch { /* navegador antiguo */ }
const nombrePais = (c) => PAIS_ESPECIAL[c] || (() => { try { return regiones?.of(c) || c; } catch { return c; } })();

const COLOR = { HORIZON: 'var(--he)', H2020: 'var(--h2020)', FP7: 'var(--fp7)', FP6: 'var(--fp6)', LIFE: 'var(--life)' };

// ---------- estado ----------
const estado = {
  base: null,        // indicadores.json tal cual se cargo o se recalculo
  vista: null,       // resultado con los filtros aplicados
  programas: [],
  periodo: null,   // ['aaaa-mm','aaaa-mm'], ambos inclusive
  limites: null,   // rango completo disponible en los datos
  paisFoco: 'ES',
  socio: null,     // clave de la entidad por la que se filtra, o null
  entidades: [],   // indice de entidades para el buscador, por numero de proyectos
  claveEntidad: null,
  orden: { col: 'inicio', dir: -1 },  // la tabla de proyectos arranca por fecha, mas recientes primero
  limite: 50,
};

init();

async function init() {
  instalarAyuda();
  try {
    const res = await fetch('./data/indicadores.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`no se pudo leer data/indicadores.json (${res.status})`);
    fijarBase(await res.json());
  } catch (e) {
    el('#estado').innerHTML = `<span class="error">${esc(e.message)}.`
      + ' Genera los datos con <code>node scripts/snapshot.js</code>.</span>';
    el('#filtros').style.display = 'none';
  }
  el('#descargar-todo').addEventListener('click', descargarTodo);
  instalarPestanas();
  // El grafico se dibuja en pixeles reales, asi que hay que rehacerlo al cambiar el ancho.
  alRedimensionar(() => { if (estado.vista) pintarGrafico(); });
}

function fijarBase(datos) {
  estado.base = datos;
  estado.paisFoco = datos.meta.paisFoco || 'ES';
  // Todos los programas marcados de partida: el conjunto completo es la foto
  // honesta, y quitar alguno es una decision que toma quien mira, no la web.
  const disponibles = [...new Set(datos.proyectos.map((p) => p.programa))];
  estado.programas = [...disponibles];
  const meses = datos.proyectos.map((p) => (p.inicio || '').slice(0, 7)).filter(Boolean).sort();
  estado.limites = [meses[0], meses[meses.length - 1]];
  estado.periodo = [...estado.limites];
  estado.socio = null;
  estado.claveEntidad = crearClaveEntidad(datos.participaciones);
  estado.entidades = indexarEntidades(datos.participaciones);
  el('#filtros').style.display = '';
  construirFiltros(disponibles);
  aplicar();
}

// ---------- buscador de socio ----------
function indexarEntidades(participaciones) {
  const m = new Map();
  for (const x of participaciones) {
    const clave = estado.claveEntidad(x);
    let e = m.get(clave);
    if (!e) m.set(clave, e = { clave, nombre: x.nombre, siglas: x.siglas, pais: x.pais, proyectos: new Set() });
    if (!e.siglas && x.siglas) e.siglas = x.siglas;
    e.proyectos.add(x.proyecto);
  }
  return [...m.values()]
    .map((e) => ({ ...e, proyectos: e.proyectos.size, texto: normaliza(`${e.nombre} ${e.siglas}`) }))
    .sort((a, b) => b.proyectos - a.proyectos || a.nombre.localeCompare(b.nombre, 'es'));
}

// Todas las palabras escritas tienen que aparecer en nombre o siglas. Primero
// las siglas exactas, luego las coincidencias al principio, y dentro de cada
// grupo las entidades con mas proyectos.
function buscarEntidades(consulta, max = 8) {
  const palabras = normaliza(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const q = palabras.join(' ');
  const peso = (e) => (normaliza(e.siglas) === q ? 0 : e.texto.startsWith(q) ? 1 : 2);
  return estado.entidades
    .filter((e) => palabras.every((w) => e.texto.includes(w)))
    .sort((a, b) => peso(a) - peso(b) || b.proyectos - a.proyectos)
    .slice(0, max);
}

const entidadDe = (clave) => estado.entidades.find((e) => e.clave === clave) ?? null;

function elegirSocio(clave) {
  estado.socio = clave;
  pintarSocio();
  aplicar();
}

function pintarSocio() {
  const cont = el('#f-socio-cont');
  if (!cont) return;
  buscadorEntidad({
    cont, idBase: 'f-socio', elegida: entidadDe(estado.socio), placeholder: 'Nombre o siglas de una entidad',
    chip: (e) => `<span class="pais">${esc(e.pais || '··')}</span><span class="nom">${esc(e.siglas || e.nombre)}</span>`,
    sugerir: buscarEntidades,
    opcion: (e) => `<span class="pais">${esc(e.pais || '··')}</span>
        <span class="nom">${esc(e.siglas ? `${e.siglas} · ${e.nombre}` : e.nombre)}</span>
        <span class="pct">${num(e.proyectos)}</span>`,
    alElegir: (e) => elegirSocio(e.clave),
    alQuitar: () => elegirSocio(null),
  });
}

// Firefox aun no implementa <input type="month">: ahi degrada a caja de texto
// sin selector, asi que se detecta y se ofrecen dos desplegables en su lugar.
const SOPORTA_MES = (() => {
  const i = document.createElement('input');
  i.setAttribute('type', 'month');
  return i.type === 'month';
})();

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function controlMes(id, valor, [min, max]) {
  if (SOPORTA_MES) {
    return `<input type="month" id="${id}" min="${min}" max="${max}" value="${valor}">`;
  }
  const [a, m] = valor.split('-');
  const desdeA = +min.slice(0, 4), hastaA = +max.slice(0, 4);
  const anios = [];
  for (let y = desdeA; y <= hastaA; y++) anios.push(y);
  return `<select id="${id}-a">${anios.map((y) =>
      `<option ${+a === y ? 'selected' : ''}>${y}</option>`).join('')}</select>`
    + `<select id="${id}-m">${MESES.map((n, i) =>
      `<option value="${String(i + 1).padStart(2, '0')}" ${+m === i + 1 ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
}

const leerMes = (id) => SOPORTA_MES
  ? el(`#${id}`).value
  : `${el(`#${id}-a`).value}-${el(`#${id}-m`).value}`;

function escribirMes(id, valor) {
  if (SOPORTA_MES) { el(`#${id}`).value = valor; return; }
  const [a, m] = valor.split('-');
  el(`#${id}-a`).value = a;
  el(`#${id}-m`).value = m;
}

// ---------- filtros ----------
function construirFiltros(disponibles) {
  const paises = [...new Set(estado.base.participaciones.map((p) => p.pais).filter(Boolean))]
    .map((c) => [c, nombrePais(c)]).sort((a, b) => a[1].localeCompare(b[1], 'es'));

  el('#filtros').innerHTML = `
    <div class="grupo"><span>Programa${boton('filtroPrograma')}</span><div class="opciones">${
      disponibles.map((c) => {
        const p = PROGRAMAS.find((x) => x.codigo === c);
        const on = estado.programas.includes(c);
        return `<label class="chip ${on ? 'on' : ''}" data-prog="${c}" style="color:${on ? COLOR[c] : ''}">
                 <i class="punto" style="background:${COLOR[c]}"></i>
                 <input type="checkbox" ${on ? 'checked' : ''}>
                 ${esc(p?.etiqueta || c)}<span class="pct">${esc(p?.periodo || '')}</span></label>`;
      }).join('')}</div></div>
    <div class="grupo"><span>País de referencia${boton('filtroPais')}</span>
      <select id="f-pais">${paises.map(([c, n]) =>
        `<option value="${c}" ${c === estado.paisFoco ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="grupo"><span>Inicio del proyecto${boton('filtroPeriodo')}</span><div class="opciones periodo">
      <span class="rot">de</span>${controlMes('f-desde', estado.periodo[0], estado.limites)}
      <span class="rot">a</span>${controlMes('f-hasta', estado.periodo[1], estado.limites)}
      <button id="f-reset" title="Todo el periodo disponible">Todo</button></div></div>
    <div class="grupo socio"><span>Socio${boton('filtroSocio')}</span><div id="f-socio-cont"></div></div>`;
  pintarSocio();

  el('#filtros').querySelectorAll('[data-prog]').forEach((lab) => {
    lab.addEventListener('click', (ev) => {
      ev.preventDefault();
      const c = lab.dataset.prog;
      const i = estado.programas.indexOf(c);
      if (i >= 0) { if (estado.programas.length === 1) return; estado.programas.splice(i, 1); }
      else estado.programas.push(c);
      lab.classList.toggle('on');
      lab.style.color = lab.classList.contains('on') ? COLOR[c] : '';
      lab.querySelector('input').checked = lab.classList.contains('on');
      aplicar();
    });
  });
  el('#f-pais').addEventListener('change', (e) => { estado.paisFoco = e.target.value; aplicar(); });
  const alCambiarPeriodo = () => {
    const d = leerMes('f-desde') || estado.limites[0];
    const h = leerMes('f-hasta') || estado.limites[1];
    // Si se invierten los extremos se ordenan solos, en vez de no dar resultados.
    estado.periodo = d <= h ? [d, h] : [h, d];
    escribirMes('f-desde', estado.periodo[0]);
    escribirMes('f-hasta', estado.periodo[1]);
    aplicar();
  };
  el('#filtros').querySelectorAll('input[type=month],#f-desde-a,#f-desde-m,#f-hasta-a,#f-hasta-m')
    .forEach((n) => n.addEventListener('change', alCambiarPeriodo));
  el('#f-reset').addEventListener('click', () => {
    estado.periodo = [...estado.limites];
    escribirMes('f-desde', estado.periodo[0]);
    escribirMes('f-hasta', estado.periodo[1]);
    aplicar();
  });
}

function aplicar() {
  estado.limite = 50;
  estado.vista = recomputar(estado.base, {
    programas: estado.programas, periodo: estado.periodo, paisFoco: estado.paisFoco, socio: estado.socio,
  });
  pintar();
}

// ---------- pintado ----------
function pintar() {
  const r = estado.vista, s = r.resumen, pais = nombrePais(estado.paisFoco);
  const f = estado.base.meta.fuentes || [];

  const conLife = f.some((x) => x.codigo === 'LIFE');
  el('#fuente').innerHTML = `Fuente: datos abiertos de CORDIS${conLife ? ' y de la base de datos pública de LIFE (CINEA)' : ''}`
    + (f.length ? ` · ${f.map((x) => `${esc(x.etiqueta)} <span class="pct">(${fecha(x.actualizado)})</span>`).join(' · ')}` : '')
    + `<br>Criterio: <code>${esc(estado.base.meta.filtro?.frase ?? 'citizen science')}</code> en `
    + (estado.base.meta.filtro?.campos ?? []).map((c) =>
        ({ objective: 'descripción', title: 'título', keywords: 'palabras clave' }[c] || c)).join(' o ');

  el('#cifras').innerHTML = [
    tile(num(s.totalProyectos), 'proyectos', r.programas.map((p) => `${p.clave}: ${num(p.proyectos)}`).join(' · '), false, 'proyectos'),
    tile(num(s.organizacionesUnicas), 'entidades participantes', `${num(s.participaciones)} participaciones`
      + (s.participacionesSinPais ? `, ${num(s.participacionesSinPais)} sin país` : ''), false, 'entidades'),
    tile(millones(r.proyectos.reduce((a, p) => a + p.aportacionUE, 0)), 'aportación de la UE', 'a los proyectos filtrados', false, 'aportacionTotal'),
    tile(num(s.focoProyectos), `proyectos con ${pais}`, pc(s.focoPctProyectos) + ' del total', true, 'focoProyectos'),
    tile(num(s.focoCoordinados), `coordinados por ${pais}`, pc(s.focoPctCoordinados) + ' de los suyos', true, 'focoCoordinados'),
    tile(num(s.focoOrganizaciones), `entidades de ${pais}`, pc(s.focoPctOrganizaciones) + ' del total', true, 'focoEntidades'),
    tile(millones(s.focoAportacionNeta), `recibido por ${pais}`, pc(s.focoPctAportacion) + ' del total', true, 'focoAportacion'),
  ].join('');

  el('#t-grafico').innerHTML = 'Evolución por año de inicio' + boton('grafico');
  pintarGrafico();

  tabla('#p-paises', 'Países', 'Participación por país, ordenada por número de proyectos.', 'paises',
    ['País', 'Proyectos', '% del total', 'Coordina', '% coord.', 'Entidades', 'Aportación'],
    r.paises.slice(0, 15), (p) => [
      esc(nombrePais(p.pais)) + (p.pais === estado.paisFoco ? ' ★' : ''),
      num(p.proyectos), `<span class="pct">${pc(p.pctSobreTotal)}</span>`,
      num(p.coordinados), `<span class="pct">${pc(p.pctCoordinados)}</span>`,
      num(p.organizaciones), millones(p.aportacionNeta)], 'paises', descargar);

  tabla('#p-familias', 'Subprogramas', 'Nombres oficiales de CORDIS y áreas prioritarias de LIFE, unificados entre programas.', 'subprogramas',
    ['Subprograma', 'Proyectos', pais, '%'],
    r.familias.slice(0, 14), (x) => [
      `<span class="nom" title="${esc(x.etiqueta)}">${esc(x.etiqueta)}</span>`,
      num(x.proyectos), num(x.foco), `<span class="pct">${pc(x.pctFoco)}</span>`], 'subprogramas', descargar);

  tabla('#p-tipos', `Tipo de entidad · ${pais}`,
    `Clasificación de CORDIS sobre las ${num(s.focoOrganizaciones)} entidades distintas.`, 'entidades',
    ['Tipo', 'Entidades', '%'],
    r.tipos, (t) => [esc(t.etiqueta), num(t.entidades), `<span class="pct">${pc(t.pct)}</span>`], 'tipos', descargar);

  tabla('#p-entidades', `Entidades más activas · ${pais}`,
    'Por número de proyectos distintos en los que participa.', 'entidades',
    ['Entidad', 'Proyectos', 'Coordina', 'Aportación'],
    r.entidadesFoco.slice(0, 14), (e) => [
      `<a href="#" class="nom" data-socio="${esc(estado.claveEntidad(e))}" title="${esc(e.nombre)}">${esc(e.siglas || e.nombre)}</a>`,
      num(e.proyectos), num(e.coordinados), millones(e.aportacionNeta)], 'entidadesFoco', descargar);
  el('#p-entidades').querySelectorAll('[data-socio]').forEach((a) =>
    a.addEventListener('click', (ev) => { ev.preventDefault(); elegirSocio(a.dataset.socio); }));

  tablaProyectos();

  el('#pie').innerHTML = `Generado el ${fecha(r.meta.generado)} · `
    + 'Datos: <a href="https://cordis.europa.eu/datalab/browse.html" target="_blank" rel="noopener">CORDIS</a>, '
    + 'Comisión Europea (CC BY 4.0) · Cifras recalculadas en el navegador a partir de los datos originales.';
}

function pintarGrafico() {
  grafico(el('#grafico'), el('#leyenda'), estado.vista.serie, {
    claves: estado.programas, campo: 'porPrograma', titulo: 'Proyectos por año de inicio',
    color: (c) => COLOR[c], etiqueta: (c) => ETIQUETA_PROGRAMA[c] || c,
  });
}

// ---------- ayuda contextual ----------
// Los textos viven aqui juntos para que se lean como un glosario coherente.
registrarAyuda({
  proyectos: ['Proyectos',
    'Proyectos financiados por la UE cuya <b>descripción o título</b> menciona <code>citizen science</code>, dentro de los programas marco seleccionados arriba.',
    'No es la lista oficial de proyectos de ciencia ciudadana: no existe tal lista. Es lo que se puede medir de forma reproducible sobre los datos abiertos de CORDIS.'],
  entidades: ['Entidades participantes',
    'Organizaciones <b>distintas</b> que participan en esos proyectos: universidades, centros de investigación, empresas, administraciones y asociaciones.',
    'Cada organización se cuenta <b>una sola vez</b> aunque esté en varios proyectos. Debajo aparecen también las <i>participaciones</i>, que sí cuentan cada vez que una entidad se sienta en un consorcio. El CSIC, por ejemplo, es 1 entidad pero decenas de participaciones.',
    'Las participaciones <b>sin país</b> son socios de LIFE cuyo país no se ha podido determinar: no entran en ninguna cifra por país, pero sí en el total.'],
  aportacionTotal: ['Aportación de la UE',
    'Suma de la contribución máxima que la Comisión Europea asigna a cada proyecto (<code>ecMaxContribution</code>).',
    'Es el dinero del proyecto <b>completo</b>, repartido entre todos los socios de todos los países.'],
  focoProyectos: ['Proyectos con participación',
    'Proyectos en los que participa al menos una entidad del país seleccionado, en cualquier papel: coordinando, como socio, como socio asociado o como tercero.',
    'El porcentaje es sobre el total de proyectos filtrados. Suele ser alto porque los consorcios europeos son grandes y un país activo aparece en muchos.'],
  focoCoordinados: ['Proyectos coordinados',
    'De los proyectos en los que participa el país, en cuántos ejerce de <b>coordinador</b>: la entidad que lidera el consorcio y responde ante la Comisión.',
    'Es el mejor indicador de liderazgo. Participar es habitual; coordinar exige capacidad de gestión y peso científico.'],
  focoEntidades: ['Entidades del país',
    'Organizaciones distintas de ese país presentes en los proyectos filtrados.',
    'El porcentaje es sobre el total de entidades de <b>todos</b> los países, así que mide el peso relativo del país en el conjunto.'],
  focoAportacion: ['Financiación recibida',
    'Suma de la <b>contribución neta</b> que la UE asigna concretamente a las entidades de ese país (<code>netEcContribution</code>), no el presupuesto de los proyectos enteros.',
    'Es el dinero que de verdad llega al país. Compararlo con el porcentaje de proyectos revela si se participa en papeles grandes o pequeños.',
    'LIFE no publica el reparto por socio, así que sus proyectos no suman aquí: solo cuentan en la aportación total de la UE.'],
  grafico: ['Evolución por año de inicio',
    'Cada proyecto se cuenta en el año en que <b>arrancó</b>, con el color de su programa marco. Pasa el ratón por una barra para ver el detalle.',
    'La serie sale de una sola descarga: como cada proyecto lleva su fecha, no hace falta guardar histórico. Los últimos años pueden crecer más adelante, según CORDIS incorpore proyectos ya firmados.'],
  paises: ['Países',
    'Un proyecto cuenta para <b>todos</b> los países que participan en él, así que la suma de la columna supera el total de proyectos: un consorcio de doce socios suma en doce países.',
    '<b>Coordina</b> es en cuántos de sus proyectos ese país lidera el consorcio. <b>Aportación</b> es el dinero que reciben sus entidades, no el de los proyectos completos.'],
  subprogramas: ['Subprogramas',
    'La línea de financiación concreta de cada proyecto: ERC, Marie Skłodowska-Curie, los clústeres temáticos, SwafS…',
    'Los nombres son los <b>oficiales de CORDIS</b>, no etiquetas nuestras. Se unifican entre programas marco recortando el prefijo del pilar, porque Horizonte 2020 y Horizonte Europa titulan lo mismo de forma distinta.'],
  tipos: ['Tipo de entidad',
    'Clasificación que hace la propia Comisión de cada organización: <b>PRC</b> empresas y entidades con ánimo de lucro, <b>REC</b> organismos de investigación, <b>HES</b> educación superior o secundaria, <b>PUB</b> organismos públicos, <b>OTH</b> el resto.',
    'Se cuenta cada entidad una vez, con el tipo que CORDIS le asigna.'],
  entidadesFoco: ['Entidades más activas',
    'Organizaciones del país seleccionado ordenadas por número de proyectos <b>distintos</b> en los que aparecen.',
    '<b>Coordina</b> es en cuántos de ellos lidera. El nombre corto es el que da CORDIS; el completo aparece al posar el ratón. Pulsa un nombre para quedarte solo con sus proyectos.'],
  tablaProyectos: ['Proyectos',
    'La lista completa que cumple el criterio. Pulsa cualquier cabecera para ordenar, y el acrónimo para abrir la ficha oficial en CORDIS o en la base de datos de LIFE.',
    '<b>Coordina</b> muestra quién lidera con su código de país, resaltado si es el país seleccionado. <b>Entidades</b> son las de ese país que participan.'],
  filtroPrograma: ['Programa',
    'Los programas marco con los que la UE financia la investigación, sucesivos en el tiempo: <b>FP7</b> (2007-2013), <b>Horizonte 2020</b> (2014-2020) y <b>Horizonte Europa</b> (2021-2027). Y <b>LIFE</b>, el programa de medio ambiente y clima, que no es de investigación ni está en CORDIS.',
    'Vienen todos marcados. Desmárcalos para aislar una etapa: la comparación entre programas dice bastante, porque el peso de cada país cambia de uno a otro.',
    'FP7 aporta muy pocos proyectos, porque entonces apenas se usaba el término «citizen science». Además su volcado está cerrado: al ser un programa terminado, CORDIS no lo actualiza desde enero de 2025.',
    'LIFE sale de la base de datos pública de CINEA con el <b>mismo criterio</b>, aplicado a la descripción de cada ficha. Sus socios no traen PIC, tipo de entidad ni reparto del dinero, y su país se resuelve cruzando fuentes: cada participación lleva anotada la vía en el CSV.'],
  filtroPais: ['País de referencia',
    'Todas las cifras y tablas marcadas se recalculan alrededor del país que elijas. Sirve para comparar: prueba Italia o Alemania.',
    'CORDIS usa <code>UK</code> para Reino Unido y <code>EL</code> para Grecia, en lugar de los códigos habituales.'],
  filtroPeriodo: ['Inicio del proyecto',
    'Acota por la fecha de <b>arranque</b> del proyecto, con precisión de mes.',
    'Los proyectos a los que CORDIS no da fecha de inicio no se descartan nunca, para no ocultarlos por un dato que falta.'],
  filtroSocio: ['Socio',
    'Escribe el nombre o las siglas de una entidad y elígela: todas las cifras y tablas pasan a contar solo los proyectos en los que <b>participa</b>, en cualquier papel.',
    'La tabla de proyectos añade su <b>papel</b> en cada uno y la contribución neta que recibe. Cada entidad se identifica por su PIC, el código que la Comisión le asigna, así que se sigue entre programas marco aunque cambie de nombre.',
    'Búsqueda sin acentos y por cualquier palabra: <i>csic</i>, <i>malaga</i> o <i>ibercivis</i> valen igual.'],
});

// ---------- tabla de proyectos, ordenable ----------
const ROL_ES = { coordinator: 'coordina', participant: 'socio', associatedPartner: 'socio asociado', thirdParty: 'tercero' };

function columnasProyectos(pais, socio) {
  const papel = new Map();
  if (socio) for (const x of estado.base.participaciones) if (estado.claveEntidad(x) === socio.clave) papel.set(x.proyecto, x);
  const colSocio = socio ? [{ id: 'papel', t: `Papel de ${socio.siglas || socio.nombre}`, izq: true,
      v: (p) => papel.get(p.id)?.aportacionNeta ?? 0,
      c: (p) => { const x = papel.get(p.id); return x
        ? `<span class="ent ${x.rol === 'coordinator' ? 'coord' : ''}">${esc(ROL_ES[x.rol] || x.rol)}</span>`
          + `<span class="pct">${millones(x.aportacionNeta)}</span>`
        : '<span class="mas">—</span>'; } }] : [];
  return [
    { id: 'acronimo', t: 'Acrónimo', v: (p) => p.acronimo || p.id, izq: true,
      c: (p) => `<a href="${esc(p.url || `https://cordis.europa.eu/project/id/${p.id}`)}" target="_blank" rel="noopener">${esc(p.acronimo || p.id)}</a>` },
    { id: 'titulo', t: 'Título', v: (p) => p.titulo || '', izq: true,
      c: (p) => `<span class="nom" title="${esc(p.titulo)}">${esc(p.titulo)}</span>` },
    { id: 'inicio', t: 'Inicio', v: (p) => p.inicio || '', c: (p) => mesAnio(p.inicio) },
    { id: 'fin', t: 'Fin', v: (p) => p.fin || '', c: (p) => mesAnio(p.fin) },
    { id: 'coord', t: 'Coordina', v: (p) => p.coordinador || '', izq: true, c: (p) => p.coordinador
        ? `<span class="ent ${p.coordinaFoco ? 'coord' : ''}" title="${esc(p.coordinadorNombre)}">`
          + `<span class="pais ${p.coordinaFoco ? 'foco' : ''}">${esc(p.coordinadorPais || '··')}</span>`
          + `${esc(p.coordinador)}</span>`
        : '<span class="mas">—</span>' },
    ...colSocio,
    { id: 'foco', t: `Entidades de ${pais}`, v: (p) => (p.entidadesFoco || []).length, izq: true, c: (p) => {
        const e = p.entidadesFoco || [];
        if (!e.length) return '<span class="mas">—</span>';
        const vis = e.slice(0, 2).map((n, i) =>
          `<span class="ent" title="${esc((p.entidadesFocoNombres || [])[i] || n)}">${esc(n)}</span>`).join('');
        return vis + (e.length > 2 ? `<span class="mas">+${e.length - 2} más</span>` : '');
      } },
    { id: 'programa', t: 'Programa', v: (p) => p.programa, izq: true, movil: false,
      c: (p) => `<span style="color:${COLOR[p.programa]}">${esc(ETIQUETA_PROGRAMA[p.programa] || p.programa)}</span>` },
    { id: 'aportacion', t: 'Aportación UE', v: (p) => p.aportacionUE, movil: false, c: (p) => millones(p.aportacionUE) },
  ];
}

function tablaProyectos() {
  const r = estado.vista, pais = nombrePais(estado.paisFoco);
  const socio = entidadDe(estado.socio);
  const cols = columnasProyectos(pais, socio);
  const { col, dir } = estado.orden;
  const cmp = cols.find((c) => c.id === col) ?? cols[2];

  const orden = [...r.proyectos].sort((a, b) => {
    const x = cmp.v(a), y = cmp.v(b);
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y), 'es', { numeric: true }) * dir;
  });
  const vistos = orden.slice(0, estado.limite);
  const quedan = orden.length - vistos.length;

  el('#p-proyectos').innerHTML = `
    <div class="cabecera-tabla">
      <div><h2>Proyectos${boton('tablaProyectos')}</h2>
        <p class="nota">${socio
          ? `Los ${num(orden.length)} proyectos en los que participa <b title="${esc(socio.nombre)}">${esc(socio.siglas || socio.nombre)}</b>.`
          : `Los ${num(orden.length)} proyectos que cumplen el criterio.`}
          Pulsa una cabecera para ordenar. La entidad coordinadora aparece con su país;
          si coordina ${pais}, resaltada.</p></div>
      <button data-csv="proyectos">CSV</button></div>
    <div class="tabla-scroll"><table><thead><tr>${
      cols.map((c) => `<th class="ord${c.id === col ? ' activa' : ''}${c.id === col && dir === -1 ? ' desc' : ''}${c.movil === false ? ' escritorio' : ''}"
        data-col="${c.id}">${esc(c.t)}</th>`).join('')}</tr></thead>
      <tbody>${vistos.map((p) => `<tr>${
        cols.map((c) => `<td class="${c.izq ? 'izq' : ''}${c.movil === false ? ' escritorio' : ''}">${c.c(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${quedan > 0 ? `<div style="margin-top:11px"><button id="mas-proyectos">Ver los ${num(quedan)} restantes</button></div>` : ''}`;

  el('#p-proyectos').querySelector('[data-csv]').addEventListener('click', () => descargar('proyectos'));
  el('#p-proyectos').querySelectorAll('[data-col]').forEach((th) => {
    th.addEventListener('click', () => {
      const id = th.dataset.col;
      // Al cambiar de columna: fechas y numeros empiezan descendente, texto ascendente.
      estado.orden = estado.orden.col === id
        ? { col: id, dir: -estado.orden.dir }
        : { col: id, dir: ['inicio', 'fin', 'aportacion', 'foco', 'papel'].includes(id) ? -1 : 1 };
      tablaProyectos();
    });
  });
  el('#mas-proyectos')?.addEventListener('click', () => { estado.limite = Infinity; tablaProyectos(); });
}

// ---------- descargas ----------
const descargar = (nombre) => descargarCsv(TABLAS[nombre](estado.vista), nombre);
const descargarTodo = () => Object.keys(TABLAS).forEach((n, i) => setTimeout(() => descargar(n), i * 250));
