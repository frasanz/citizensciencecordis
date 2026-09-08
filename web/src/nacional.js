// Indicadores de ciencia ciudadana en las convocatorias españolas (AEI, FECYT y
// Fundacion Biodiversidad). Sin dependencias de Node ni del DOM: lo usan el
// script de actualizacion y el navegador.
//
// La unidad aqui es la AYUDA: una concesion a UNA entidad beneficiaria. No hay
// consorcios, ni socios, ni reparto del dinero. Por eso los indicadores no son
// los de los programas europeos: aqui cuentan financiador, convocatoria,
// comunidad autonoma de la entidad, entidad e importe concedido.

export const FINANCIADORES = [
  { codigo: 'AEI',   etiqueta: 'AEI',                     nombre: 'Agencia Estatal de Investigación', periodo: '2009-' },
  { codigo: 'FECYT', etiqueta: 'FECYT',                   nombre: 'Fundación Española para la Ciencia y la Tecnología', periodo: '2020-' },
  { codigo: 'FB',    etiqueta: 'Fundación Biodiversidad', nombre: 'Fundación Biodiversidad (MITECO)', periodo: '' },
];
export const ETIQUETA_FINANCIADOR = Object.fromEntries(FINANCIADORES.map((f) => [f.codigo, f.etiqueta]));

// Por que via entra cada ayuda. Se guarda en cada registro y en el CSV.
export const VIAS = {
  titulo: 'la frase aparece en el título',
  resumen: 'la frase aparece en el resumen o descripción',
  categoria: 'concedida en la línea de ciencia ciudadana de la convocatoria (FECYT)',
  'palabras-clave': 'la frase está entre las palabras clave declaradas (AEI; no exportables, no comprobables aquí)',
};

// Como se ha resuelto la comunidad autonoma de la entidad.
export const CCAA_VIAS = {
  fuente: 'la da la propia fuente (AEI y FECYT)',
  cruce: 'misma entidad, por nombre, en AEI o FECYT',
  localizacion: 'la ficha de la Fundación Biodiversidad localiza el proyecto en una única comunidad',
  nombre: 'el nombre de la entidad nombra la comunidad, provincia o ciudad',
  manual: 'tabla datos/ccaa-entidades.csv, revisada a mano',
  'sin-ccaa': 'no se ha podido determinar',
};

// Mismo espiritu que el filtro europeo: una lista explicita de frases, con
// guion o saltos de linea tolerados, sobre titulo y resumen. Los resumenes de la
// AEI van muchas veces en ingles, y hay titulos en catalan y gallego.
export const FRASES_NACIONAL = ['ciencia ciudadana', 'citizen science', 'ciència ciutadana', 'ciencia cidadá', 'zientzia herritarra'];

const sinAcentos = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '');

export function crearFiltroNacional({ frases = FRASES_NACIONAL, campos = ['titulo', 'resumen'] } = {}) {
  const patron = frases.map((f) => sinAcentos(f).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s\\-]+')).join('|');
  const re = new RegExp(patron, 'i');
  // Devuelve la via por la que entra (titulo antes que resumen), o null.
  const f = (rec) => campos.find((c) => re.test(sinAcentos(rec[c] || ''))) ?? null;
  f.definicion = { frases, campos, regex: re.source };
  f.regex = re;
  return f;
}

// Clave de entidad: el CIF cuando alguna fuente lo da (solo la AEI), y si no el
// nombre sin acentos, mayusculas ni puntuacion. Una ayuda sin CIF se engancha
// al CIF de otra con el mismo nombre, para que "UNIVERSIDAD DE ZARAGOZA" de
// FECYT y "Universidad de Zaragoza" de la Fundacion Biodiversidad cuenten como
// la misma entidad que la de la AEI.
// Se quitan antes el guion blando y los espacios de anchura cero, que alguna
// ficha arrastra en medio de una palabra ("Ornitologí­a").
export const claveNombre = (s) => sinAcentos(s).replace(/[\u00AD\u200B-\u200D\uFEFF]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
export function crearClaveEntidadNacional(ayudas) {
  const cifPorNombre = new Map();
  for (const a of ayudas) if (a.cif && a.entidad && !cifPorNombre.has(claveNombre(a.entidad))) cifPorNombre.set(claveNombre(a.entidad), a.cif);
  return (a) => {
    const cif = a.cif || cifPorNombre.get(claveNombre(a.entidad));
    return cif ? `cif:${cif}` : `n:${claveNombre(a.entidad)}`;
  };
}

const pct = (a, b) => (b ? (a / b) * 100 : 0);

export function construirNacional(ayudas, { filtro = null, fuentes = [], claveEntidad = crearClaveEntidadNacional(ayudas) } = {}) {
  const lista = [...ayudas];
  const importeTotal = lista.reduce((s, a) => s + (a.importe || 0), 0);
  const conImporte = lista.filter((a) => a.importe > 0).length;

  const agrupa = (clave, etiqueta, extra = null) => {
    const m = new Map();
    for (const a of lista) {
      const k = clave(a);
      if (k == null || k === '') continue;
      let e = m.get(k);
      if (!e) m.set(k, e = { clave: k, etiqueta: etiqueta(a), ayudas: 0, entidades: new Set(), importe: 0, financiadores: new Set(), anios: [] });
      e.ayudas++;
      e.importe += a.importe || 0;
      e.entidades.add(claveEntidad(a));
      e.financiadores.add(a.financiador);
      if (a.anio) e.anios.push(a.anio);
      extra?.(e, a);
    }
    return [...m.values()].map((e) => ({
      clave: e.clave, etiqueta: e.etiqueta, ayudas: e.ayudas, pctAyudas: pct(e.ayudas, lista.length),
      entidades: e.entidades.size, importe: e.importe, pctImporte: pct(e.importe, importeTotal),
      financiadores: [...e.financiadores], desde: e.anios.length ? Math.min(...e.anios) : null, hasta: e.anios.length ? Math.max(...e.anios) : null,
    })).sort((a, b) => b.ayudas - a.ayudas || b.importe - a.importe);
  };

  const financiadores = agrupa((a) => a.financiador, (a) => ETIQUETA_FINANCIADOR[a.financiador] || a.financiador);
  const convocatorias = agrupa((a) => `${a.financiador}|${a.convocatoria}`, (a) => a.convocatoria);
  const ccaa = agrupa((a) => a.ccaa || '', (a) => a.ccaa);
  const vias = agrupa((a) => a.via, (a) => VIAS[a.via] || a.via);
  const ccaaVias = agrupa((a) => a.ccaaVia, (a) => CCAA_VIAS[a.ccaaVia] || a.ccaaVia);

  // Entidades: una fila por entidad, con sus ayudas y su dinero.
  const porEntidad = new Map();
  for (const a of lista) {
    const k = claveEntidad(a);
    let e = porEntidad.get(k);
    if (!e) porEntidad.set(k, e = { clave: k, nombre: a.entidad, cif: a.cif || '', ccaa: a.ccaa || '', ayudas: 0, importe: 0, financiadores: new Set(), anios: [] });
    e.ayudas++;
    e.importe += a.importe || 0;
    e.financiadores.add(a.financiador);
    if (!e.cif && a.cif) e.cif = a.cif;
    if (!e.ccaa && a.ccaa) e.ccaa = a.ccaa;
    if (a.anio) e.anios.push(a.anio);
  }
  const entidades = [...porEntidad.values()].map((e) => ({
    ...e, financiadores: [...e.financiadores].sort(), desde: e.anios.length ? Math.min(...e.anios) : null, hasta: e.anios.length ? Math.max(...e.anios) : null, anios: undefined,
  })).sort((a, b) => b.ayudas - a.ayudas || b.importe - a.importe || a.nombre.localeCompare(b.nombre, 'es'));

  // Serie por año de la convocatoria (AEI, FECYT) o de inicio (Fundacion Biodiversidad).
  const porAnio = new Map();
  for (const a of lista) {
    if (!a.anio) continue;
    let e = porAnio.get(a.anio);
    if (!e) porAnio.set(a.anio, e = { anio: a.anio, total: 0, porFinanciador: {}, importe: 0 });
    e.total++;
    e.importe += a.importe || 0;
    e.porFinanciador[a.financiador] = (e.porFinanciador[a.financiador] || 0) + 1;
  }
  const serie = [...porAnio.values()].sort((a, b) => a.anio - b.anio);

  const sinCcaa = lista.filter((a) => !a.ccaa).length;
  const sinAnio = lista.filter((a) => !a.anio).length;
  return {
    meta: { generado: new Date().toISOString(), filtro: filtro?.definicion ?? filtro ?? null, fuentes },
    resumen: {
      totalAyudas: lista.length,
      entidades: porEntidad.size,
      importeTotal,
      conImporte, sinImporte: lista.length - conImporte,
      importeMedio: conImporte ? importeTotal / conImporte : 0,
      ccaaConAyudas: ccaa.filter((c) => c.clave).length,
      sinCcaa, pctSinCcaa: pct(sinCcaa, lista.length),
      sinAnio,
      desde: serie.length ? serie[0].anio : null,
      hasta: serie.length ? serie[serie.length - 1].anio : null,
    },
    financiadores, convocatorias, ccaa, vias, ccaaVias, entidades, serie,
    ayudas: lista,
  };
}

// Recalculo en el navegador a partir de nacional.json ya generado.
// `anios` son dos años inclusive; `entidad` es una clave de claveEntidad.
export function recomputarNacional(datos, { financiadores = null, anios = null, ccaa = null, entidad = null, vias = null, claveEntidad = null } = {}) {
  const finOk = financiadores && financiadores.length ? new Set(financiadores) : null;
  const viasOk = vias && vias.length ? new Set(vias) : null;
  const [desde, hasta] = anios ?? [null, null];
  claveEntidad ??= crearClaveEntidadNacional(datos.ayudas);
  const lista = datos.ayudas.filter((a) => {
    if (finOk && !finOk.has(a.financiador)) return false;
    if (viasOk && !viasOk.has(a.via)) return false;
    if (ccaa && a.ccaa !== ccaa) return false;
    if (entidad && claveEntidad(a) !== entidad) return false;
    // Sin año no se descarta: no hay motivo para ocultar una ayuda por un dato que falta.
    if (a.anio && ((desde && a.anio < desde) || (hasta && a.anio > hasta))) return false;
    return true;
  });
  const r = construirNacional(lista, { filtro: datos.meta.filtro, fuentes: datos.meta.fuentes, claveEntidad });
  r.meta = { ...datos.meta, ...r.meta };
  return r;
}
