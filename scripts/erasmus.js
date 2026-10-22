// Erasmus+ y Europa Creativa. Las dos usan la misma plataforma de resultados de
// proyectos de la Comision, cuyo buscador carga los datos de una API JSON sin
// autenticacion (la que usa su propio front-end). No esta documentada como
// publica, asi que puede cambiar sin aviso; si falla, el snapshot lo dice.
//
// Un documento trae el proyecto y todos sus socios (`organisations`). El
// importe (`projectGrantedEuAmount`) es UNO por proyecto: no hay reparto por
// socio, igual que en LIFE. El buscador casa por palabras sueltas y en campos
// que no devuelve, asi que se piden los candidatos con la frase entre comillas y
// el criterio se vuelve a aplicar aqui sobre el texto devuelto.
import { claveNombre } from './life.js';

export const API_ERASMUS = 'https://ec.europa.eu/programmes/service/search/project/search';

// codigo del programa en la web -> indice de la API y URL base de la ficha
export const PLATAFORMAS = {
  ERASMUS: { indice: 'eplus2021', ficha: 'https://erasmus-plus.ec.europa.eu/projects/search/details/' },
  CREA:    { indice: 'ce2021',    ficha: 'https://culture.ec.europa.eu/creative-europe/projects/search/details/' },
};

const TAM = 500;

async function pedir(indice, keyword, desde) {
  const cuerpo = {
    from: desde, index: indice, keyword, matchAllCountries: false,
    organisation: { organisationRole: 'COORDINATOR_OR_PARTNER' }, project: {}, coordinator: {}, partner: {},
    size: TAM, sort: '', withAggregations: false,
  };
  for (let intento = 1; ; intento++) {
    try {
      const res = await fetch(API_ERASMUS, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(cuerpo) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (intento >= 3) throw new Error(`${indice}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500 * intento));
    }
  }
}

// Todos los proyectos que devuelve el buscador para la frase exacta.
export async function descargarProyectosErasmus(codigo, frase = 'citizen science') {
  const { indice } = PLATAFORMAS[codigo];
  const docs = [];
  let total = null;
  for (let desde = 0; ; desde += TAM) {
    const r = await pedir(indice, `"${frase}"`, desde);
    if (typeof r.total !== 'number' || !Array.isArray(r.projectDocuments)) throw new Error(`${indice}: respuesta inesperada de la API`);
    total ??= r.total;
    docs.push(...r.projectDocuments);
    if (!r.projectDocuments.length || docs.length >= total) break;
    if (desde > 20000) throw new Error(`${indice}: demasiadas paginas, algo va mal`);
  }
  if (docs.length !== total) throw new Error(`${indice}: la API anuncia ${total} proyectos y devuelve ${docs.length}`);
  return docs;
}

// ---------- paso al formato de CORDIS ----------
const ID = (codigo, d) => `${codigo}-${d.projectName || d.projectId}`;
// La API da instantes UTC a medianoche local: se pasan a fecha de Bruselas para no mover el dia.
const fecha = (s) => {
  if (!s) return '';
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });
};
// El texto del criterio: descripcion y apartados que redacta el beneficiario al
// pedir la ayuda. `Results` queda fuera, como en LIFE: se escribe al terminar.
const texto = (d) => [d.projectDescription, d.projectDescriptionBackground, d.projectDescriptionObjectives, d.projectDescriptionImplementation]
  .filter(Boolean).join('\n');

export function registroProyecto(codigo, d) {
  return {
    id: ID(codigo, d),
    acronym: d.projectName || '',
    title: d.projectTitle || '',
    objective: texto(d),
    keywords: d.projectTags || '',
    status: d.projectStatus || '',
    startDate: fecha(d.projectStartDate),
    endDate: fecha(d.projectEndDate),
    ecMaxContribution: Number(d.projectGrantedEuAmount) || 0,
    totalCost: '',
    fundingScheme: d.projectLevel3Label || '',
    ecSignatureDate: d.projectCallYear ? `${d.projectCallYear}-01-01` : '',
    url: PLATAFORMAS[codigo].ficha + d.projectId,
    referencia: d.projectName || '',
  };
}

export function registroBaseLegal(codigo, d) {
  const accion = d.projectLevel2Label || d.projectLevel1Label || '';
  return { projectID: ID(codigo, d), legalBasis: `${codigo}-${claveNombre(accion).replace(/ /g, '-')}`, title: accion };
}

// `country-mobility` no es una entidad sino el pais de origen de una movilidad:
// no se cuenta como participacion.
export function registrosParticipacion(codigo, d) {
  return (d.organisations ?? [])
    .filter((o) => o.organisationName && o.organisationRole !== 'country-mobility')
    .map((o) => ({
      projectID: ID(codigo, d),
      // El identificador de la plataforma (E10...) no es el PIC de CORDIS: se deja
      // vacio y la entidad se une a las de CORDIS por nombre.
      organisationID: '',
      name: o.organisationName,
      shortName: '',
      country: o.organisationCountry || '',
      activityType: '',
      role: o.organisationRole === 'coordinator' ? 'coordinator' : 'participant',
      netEcContribution: '',
      ecContribution: '',
      paisVia: o.organisationCountry ? 'fuente' : 'sin-pais',
    }));
}
