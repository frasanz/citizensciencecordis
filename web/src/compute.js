// Nucleo de calculo de indicadores de ciencia ciudadana sobre los datasets de
// CORDIS. Sin dependencias de Node ni del DOM: el mismo modulo corre en el
// script de actualizacion y en el navegador.

export const PROGRAMAS = [
  { codigo: 'HORIZON', etiqueta: 'Horizonte Europa', archivo: 'cordis-HORIZONprojects-csv.zip', periodo: '2021-2027' },
  { codigo: 'H2020',   etiqueta: 'Horizonte 2020',   archivo: 'cordis-h2020projects-csv.zip',   periodo: '2014-2020' },
  { codigo: 'FP7',     etiqueta: 'FP7',              archivo: 'cordis-fp7projects-csv.zip',     periodo: '2007-2013' },
  { codigo: 'FP6',     etiqueta: 'FP6',              archivo: 'cordis-fp6projects-csv.zip',     periodo: '2002-2006' },
];

export const ETIQUETA_PROGRAMA = Object.fromEntries(PROGRAMAS.map((p) => [p.codigo, p.etiqueta]));

export const ACTIVITY_LABELS = {
  PRC: 'Entidades con animo de lucro',
  REC: 'Organismos de investigacion',
  HES: 'Educacion superior o secundaria',
  PUB: 'Organismos publicos',
  OTH: 'Otras entidades',
};

export const ROLES = ['coordinator', 'participant', 'associatedPartner', 'thirdParty'];

// FP7 y anteriores no traen todas las columnas; se declaran opcionales.
export const COLUMNAS_PROYECTO = ['id', 'acronym', 'title', 'objective', 'keywords', 'status',
  'startDate', 'endDate', 'ecMaxContribution', 'totalCost', 'fundingScheme', 'ecSignatureDate'];
export const OPCIONALES_PROYECTO = ['keywords', 'fundingScheme', 'ecSignatureDate', 'status', 'totalCost'];

export const COLUMNAS_ORGANIZACION = ['projectID', 'organisationID', 'name', 'shortName',
  'country', 'activityType', 'role', 'netEcContribution', 'ecContribution'];
export const OPCIONALES_ORGANIZACION = ['shortName', 'netEcContribution', 'ecContribution', 'activityType', 'role'];

export const COLUMNAS_BASE_LEGAL = ['projectID', 'legalBasis', 'title'];
export const OPCIONALES_BASE_LEGAL = ['title'];

const RE_CSIC = /CONSEJO SUPERIOR DE INVESTIGACIONES CIENTIFICAS|^CSIC$/i;

// El filtro se guarda como definicion serializable para que el criterio quede
// junto a los resultados y cualquiera pueda auditar de donde sale cada cifra.
export function crearFiltro({ frase = 'citizen science', campos = ['objective', 'title'], flexible = true } = {}) {
  const esc = frase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // "flexible" acepta guion o varios espacios: "citizen-science", "citizen\nscience"
  const patron = flexible ? esc.replace(/\s+/g, '[\\s\\-]+') : esc;
  const re = new RegExp(patron, 'i');
  const f = (rec) => campos.some((c) => re.test(rec[c] || ''));
  f.definicion = { frase, campos, flexible, regex: re.source };
  return f;
}

const num = (v) => {
  if (!v) return 0;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const anioDe = (fecha) => {
  const y = parseInt(String(fecha || '').slice(0, 4), 10);
  return Number.isFinite(y) && y > 1980 && y < 2100 ? y : null;
};

// Un mismo subprograma se titula distinto segun el programa marco: H2020
// antepone el pilar ("EXCELLENT SCIENCE - Marie Sklodowska-Curie Actions") y
// Horizonte Europa lo pone entre parentesis ("Marie Sklodowska-Curie Actions
// (MSCA)"). Se normaliza quitando prefijo y siglas finales para poder agrupar
// ERC, MSCA o SwafS a lo largo de los tres programas. No se inventa ningun
// nombre: solo se recorta el titulo oficial que da CORDIS.
export function familiaDe(titulo) {
  if (!titulo) return '';
  return titulo
    .replace(/^(EXCELLENT SCIENCE|SOCIETAL CHALLENGES|INDUSTRIAL LEADERSHIP|LEADERSHIP IN ENABLING AND INDUSTRIAL TECHNOLOGIES)\s*-\s*/i, '')
    .replace(/\s*\([A-Z]{2,6}\)\s*$/, '')
    .trim();
}

export function crearAnalisis({ filtro, roles = ROLES }) {
  const rolesOk = new Set(roles);
  const proyectos = new Map();
  const participaciones = [];
  const contadosPorPrograma = new Map();

  return {
    // --- project.csv, una vez por programa marco ---
    proyecto(rec, programa) {
      contadosPorPrograma.set(programa, (contadosPorPrograma.get(programa) || 0) + 1);
      if (!filtro(rec)) return;
      proyectos.set(rec.id, {
        id: rec.id,
        programa,
        acronimo: rec.acronym || '',
        titulo: rec.title || '',
        estado: rec.status || '',
        inicio: rec.startDate || '',
        fin: rec.endDate || '',
        anio: anioDe(rec.startDate) ?? anioDe(rec.ecSignatureDate),
        esquema: rec.fundingScheme || '',
        aportacionUE: num(rec.ecMaxContribution),
        costeTotal: num(rec.totalCost),
        subprograma: null,
        subprogramaTitulo: "",
        familia: "",
      });
    },

    // --- legalBasis.csv: adjunta el subprograma con su nombre oficial ---
    // Un proyecto trae varias filas (HORIZON.1.2 y HORIZON.1.2.1). Nos quedamos
    // con el codigo mas corto, que es el pilar, y con el titulo que da CORDIS:
    // asi no hay que mantener a mano ninguna tabla de nombres.
    baseLegal(rec) {
      const p = proyectos.get(rec.projectID);
      if (!p || !rec.legalBasis) return;
      if (!p.subprograma || rec.legalBasis.length < p.subprograma.length) {
        p.subprograma = rec.legalBasis;
        p.subprogramaTitulo = rec.title || "";
        p.familia = familiaDe(rec.title);
      }
    },

    // --- organization.csv ---
    participacion(rec) {
      const p = proyectos.get(rec.projectID);
      if (!p) return;
      if (rec.role && !rolesOk.has(rec.role)) return;
      participaciones.push({
        proyecto: rec.projectID,
        programa: p.programa,
        anio: p.anio,
        orgId: rec.organisationID || '',
        nombre: rec.name || '',
        siglas: rec.shortName || '',
        pais: rec.country || '',
        tipo: rec.activityType || '',
        rol: rec.role || 'participant',
        aportacionNeta: num(rec.netEcContribution) || num(rec.ecContribution),
      });
    },

    resultado(opts = {}) {
      return construir({ proyectos, participaciones, contadosPorPrograma, filtro, ...opts });
    },
  };
}

function construir({ proyectos, participaciones, contadosPorPrograma, filtro,
                     paisFoco = 'ES', paisesComparados = ['ES', 'IT', 'DE', 'UK', 'FR', 'NL'] }) {
  const totalProyectos = proyectos.size;

  const porPais = new Map();
  const paisDe = (c) => {
    let e = porPais.get(c);
    if (!e) porPais.set(c, e = {
      pais: c, proyectos: new Set(), coordinados: new Set(), orgs: new Set(), aportacionNeta: 0,
    });
    return e;
  };

  const orgsUnicas = new Set();
  let aportacionNetaTotal = 0;

  for (const p of participaciones) {
    aportacionNetaTotal += p.aportacionNeta;
    if (p.orgId) orgsUnicas.add(p.orgId);
    if (!p.pais) continue;
    const e = paisDe(p.pais);
    e.proyectos.add(p.proyecto);
    if (p.rol === 'coordinator') e.coordinados.add(p.proyecto);
    if (p.orgId) e.orgs.add(p.orgId);
    e.aportacionNeta += p.aportacionNeta;
  }

  const paises = [...porPais.values()].map((e) => ({
    pais: e.pais,
    proyectos: e.proyectos.size,
    coordinados: e.coordinados.size,
    pctCoordinados: pct(e.coordinados.size, e.proyectos.size),
    pctSobreTotal: pct(e.proyectos.size, totalProyectos),
    organizaciones: e.orgs.size,
    pctOrganizaciones: pct(e.orgs.size, orgsUnicas.size),
    aportacionNeta: e.aportacionNeta,
    pctAportacion: pct(e.aportacionNeta, aportacionNetaTotal),
  })).sort((a, b) => b.proyectos - a.proyectos);

  // --- coordinador y entidades del pais foco, adjuntos a cada proyecto ---
  // Se calcula aqui y no en la vista para que la tabla de la web y el CSV
  // descargable digan exactamente lo mismo.
  const detalle = new Map();
  for (const p of participaciones) {
    let e = detalle.get(p.proyecto);
    if (!e) detalle.set(p.proyecto, e = { coord: null, foco: [] });
    if (p.rol === 'coordinator' && !e.coord) e.coord = p;
    if (p.pais === paisFoco) e.foco.push(p);
  }
  for (const [id, pr] of proyectos) {
    const e = detalle.get(id);
    pr.coordinador = e?.coord ? (e.coord.siglas || e.coord.nombre) : '';
    pr.coordinadorNombre = e?.coord?.nombre || '';
    pr.coordinadorPais = e?.coord?.pais || '';
    pr.coordinaFoco = e?.coord?.pais === paisFoco;
    pr.entidadesFoco = (e?.foco ?? []).map((x) => x.siglas || x.nombre);
    pr.entidadesFocoNombres = (e?.foco ?? []).map((x) => x.nombre);
  }

  // --- agrupaciones por etiqueta ---

  const agrupa = (clave, etiqueta) => {
    const m = new Map();
    for (const p of proyectos.values()) {
      const k = clave(p);
      if (k == null || k === '') continue;
      let e = m.get(k);
      if (!e) m.set(k, e = { clave: k, etiqueta: etiqueta(p), proyectos: 0, foco: new Set(), aportacionUE: 0 });
      e.proyectos++;
      e.aportacionUE += p.aportacionUE;
    }
    for (const p of participaciones) {
      if (p.pais !== paisFoco) continue;
      const pr = proyectos.get(p.proyecto);
      const k = pr && clave(pr);
      if (k != null && m.has(k)) m.get(k).foco.add(p.proyecto);
    }
    return [...m.values()]
      .map((e) => ({ clave: e.clave, etiqueta: e.etiqueta, proyectos: e.proyectos,
                     foco: e.foco.size, pctFoco: pct(e.foco.size, e.proyectos), aportacionUE: e.aportacionUE }))
      .sort((a, b) => b.proyectos - a.proyectos);
  };

  const programas = agrupa((p) => p.programa, (p) => ETIQUETA_PROGRAMA[p.programa] || p.programa);
  const subprogramas = agrupa((p) => p.subprograma, (p) => p.subprogramaTitulo || p.subprograma);
  const esquemas = agrupa((p) => p.esquema, (p) => p.esquema);
  // Agrupa ERC, MSCA o SwafS a lo largo de los tres programas marco.
  const familias = agrupa((p) => p.familia, (p) => p.familia);

  // --- serie temporal, derivada de startDate: no hace falta guardar historico ---
  const porAnio = new Map();
  for (const p of proyectos.values()) {
    if (p.anio == null) continue;
    let e = porAnio.get(p.anio);
    if (!e) porAnio.set(p.anio, e = { anio: p.anio, total: 0, porPrograma: {}, foco: new Set(), aportacionUE: 0 });
    e.total++;
    e.aportacionUE += p.aportacionUE;
    e.porPrograma[p.programa] = (e.porPrograma[p.programa] || 0) + 1;
  }
  for (const p of participaciones) {
    if (p.pais !== paisFoco || p.anio == null) continue;
    porAnio.get(p.anio)?.foco.add(p.proyecto);
  }
  const serie = [...porAnio.values()]
    .map((e) => ({ anio: e.anio, total: e.total, porPrograma: e.porPrograma, foco: e.foco.size, aportacionUE: e.aportacionUE }))
    .sort((a, b) => a.anio - b.anio);

  // --- entidades del pais foco ---
  const orgsFoco = new Map();
  for (const p of participaciones) {
    if (p.pais !== paisFoco || !p.orgId) continue;
    let o = orgsFoco.get(p.orgId);
    if (!o) orgsFoco.set(p.orgId, o = {
      orgId: p.orgId, nombre: p.nombre, siglas: p.siglas, tipo: p.tipo,
      proyectos: new Set(), coordinados: new Set(), programas: new Set(), aportacionNeta: 0,
    });
    o.proyectos.add(p.proyecto);
    o.programas.add(p.programa);
    if (p.rol === 'coordinator') o.coordinados.add(p.proyecto);
    o.aportacionNeta += p.aportacionNeta;
  }

  const conteoTipos = new Map();
  for (const o of orgsFoco.values()) conteoTipos.set(o.tipo, (conteoTipos.get(o.tipo) || 0) + 1);
  const tipos = [...conteoTipos.entries()]
    .map(([codigo, n]) => ({ codigo, etiqueta: ACTIVITY_LABELS[codigo] || codigo || 'Sin clasificar',
                             entidades: n, pct: pct(n, orgsFoco.size) }))
    .sort((a, b) => b.entidades - a.entidades);

  const entidadesFoco = [...orgsFoco.values()]
    .map((o) => ({ orgId: o.orgId, nombre: o.nombre, siglas: o.siglas, tipo: o.tipo,
                   proyectos: o.proyectos.size, coordinados: o.coordinados.size,
                   programas: [...o.programas], aportacionNeta: o.aportacionNeta }))
    .sort((a, b) => b.proyectos - a.proyectos || b.coordinados - a.coordinados);

  const csic = entidadesFoco.find((o) => RE_CSIC.test(o.nombre) || RE_CSIC.test(o.siglas)) || null;
  const foco = paises.find((p) => p.pais === paisFoco) ?? {
    pais: paisFoco, proyectos: 0, coordinados: 0, pctCoordinados: 0, pctSobreTotal: 0,
    organizaciones: 0, pctOrganizaciones: 0, aportacionNeta: 0, pctAportacion: 0,
  };

  return {
    meta: {
      generado: new Date().toISOString(),
      filtro: filtro.definicion ?? null,
      paisFoco,
      proyectosLeidos: Object.fromEntries(contadosPorPrograma),
    },
    resumen: {
      totalProyectos,
      organizacionesUnicas: orgsUnicas.size,
      participaciones: participaciones.length,
      aportacionNetaTotal,
      aportacionUETotal: [...proyectos.values()].reduce((s, p) => s + p.aportacionUE, 0),
      focoProyectos: foco.proyectos,
      focoPctProyectos: foco.pctSobreTotal,
      focoCoordinados: foco.coordinados,
      focoPctCoordinados: foco.pctCoordinados,
      focoOrganizaciones: foco.organizaciones,
      focoPctOrganizaciones: foco.pctOrganizaciones,
      focoAportacionNeta: foco.aportacionNeta,
      focoPctAportacion: foco.pctAportacion,
    },
    programas, subprogramas, familias, esquemas, paises, tipos, serie, entidadesFoco, csic,
    paisesComparados: paisesComparados.map((c) => paises.find((p) => p.pais === c)).filter(Boolean),
    proyectos: [...proyectos.values()],
    participaciones,
  };
}

// Recalcula el resultado a partir de los datos ya volcados en indicadores.json,
// aplicando filtros en cliente. Es lo que permite que la web cambie de programa,
// de pais o de tramo de anios al instante, sin volver a bajar nada de CORDIS.
// `periodo` son dos meses en formato "aaaa-mm", ambos inclusive. Se comparan
// como texto porque ese formato ya ordena bien alfabeticamente.
export function recomputar(datos, { programas = null, periodo = null, paisFoco = 'ES', paisesComparados } = {}) {
  const progOk = programas && programas.length ? new Set(programas) : null;
  const [desde, hasta] = periodo ?? [null, null];

  const proyectos = new Map();
  for (const p of datos.proyectos) {
    if (progOk && !progOk.has(p.programa)) continue;
    const mes = (p.inicio || '').slice(0, 7);
    // Un proyecto sin fecha de inicio no se descarta: no hay motivo para
    // ocultarlo solo porque a CORDIS le falte el dato.
    if (mes && ((desde && mes < desde) || (hasta && mes > hasta))) continue;
    proyectos.set(p.id, p);
  }
  const participaciones = datos.participaciones.filter((x) => proyectos.has(x.proyecto));

  const r = construir({
    proyectos, participaciones,
    contadosPorPrograma: new Map(Object.entries(datos.meta.proyectosLeidos ?? {})),
    filtro: { definicion: datos.meta.filtro },
    paisFoco, paisesComparados,
  });
  r.meta = { ...datos.meta, ...r.meta, filtro: datos.meta.filtro };
  return r;
}
