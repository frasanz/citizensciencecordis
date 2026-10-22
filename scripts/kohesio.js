// Kohesio (kohesio.ec.europa.eu): proyectos de la politica de cohesion (FEDER, FSE+,
// Fondo de Cohesion, Interreg...). Su web carga los datos de una API JSON sin
// autenticacion que no esta documentada como publica: puede cambiar sin aviso.
//
// La busqueda por palabra clave da la lista (titulo, descripcion, fechas, presupuestos,
// paises) y el detalle de cada proyecto da lo que la lista no trae: beneficiarios, fondo y
// programa. Cada proyecto cuenta con UN importe (aportacion de la UE al proyecto); solo cuando
// tiene un unico beneficiario ese importe es el de una entidad.
//
// Lo que Kohesio no da: el pais de cada beneficiario (solo los paises del proyecto), el socio
// principal ni el reparto del dinero entre beneficiarios. Por eso el pais solo se asigna cuando
// el proyecto tiene un unico pais; en los Interreg multinacionales las entidades quedan sin pais.
// El texto en ingles de los proyectos no ingleses es traduccion automatica de Kohesio.
export const BASE_KOHESIO = 'https://kohesio.ec.europa.eu';

async function pedir(ruta) {
  for (let intento = 1; ; intento++) {
    try {
      const res = await fetch(`${BASE_KOHESIO}/api/${ruta}`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (intento >= 3) throw new Error(`Kohesio ${ruta.slice(0, 40)}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500 * intento));
    }
  }
}

// Todos los proyectos que devuelve la busqueda por la frase exacta.
export async function listarKohesio(frase = 'citizen science') {
  const kw = encodeURIComponent(`"${frase}"`);
  const lista = [];
  let total = null;
  for (let desde = 0; ; desde += 100) {
    const r = await pedir(`projects?keywords=${kw}&language=en&offset=${desde}&limit=100`);
    if (!Array.isArray(r.list) || typeof r.numberResults !== 'number') throw new Error('Kohesio: respuesta inesperada de la lista');
    total ??= r.numberResults;
    lista.push(...r.list);
    if (!r.list.length || lista.length >= total) break;
    if (desde > 5000) throw new Error('Kohesio: demasiadas paginas, algo va mal');
  }
  if (total >= 5000) throw new Error('Kohesio: la busqueda llega al tope de 5000 resultados, la frase no es exacta');
  return lista;
}

export const detalleKohesio = (q) =>
  pedir(`projects/${q}?id=${encodeURIComponent(`https://linkedopendata.eu/entity/${q}`)}&language=en`);

// ---------- paso al formato de CORDIS ----------
const num = (v) => { const n = Number(String(v ?? '').replace('+', '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const esInterreg = (d) => (d.program ?? []).some((p) => /^interreg/i.test(p.programLabel || ''));
const ID = (q) => `KOHESIO-${q}`;

export function registroProyecto(q, d) {
  return {
    id: ID(q),
    acronym: '',
    title: d.label || '',
    objective: d.description || '',
    keywords: (d.policyLabels ?? []).join('; '),
    status: '',
    startDate: d.startTime || '',
    endDate: d.endTime || '',
    ecMaxContribution: num(d.euBudget),
    totalCost: num(d.budget),
    fundingScheme: (d.funds ?? []).map((f) => f.id).join(' / '),
    ecSignatureDate: d.startTime || '',
    url: `${BASE_KOHESIO}/en/projects/${q}`,
    referencia: q,
  };
}

export function registroBaseLegal(q, d) {
  const interreg = esInterreg(d);
  const fondo = d.funds?.[0];
  return { projectID: ID(q), legalBasis: `KOHESIO-${interreg ? 'INTERREG' : (fondo?.id || 'SIN-FONDO')}`, title: interreg ? 'Interreg' : (fondo?.label || 'Sin fondo indicado') };
}

// Un unico pais en el proyecto -> el de todos sus beneficiarios; si no, sin pais (no se inventa).
export function registrosParticipacion(q, d) {
  const paises = [...new Set(d.countryCode ?? [])];
  const pais = paises.length === 1 ? paises[0] : '';
  const benef = (d.beneficiaries ?? []).filter((b) => b.beneficiaryLabel);
  return benef.map((b) => ({
    projectID: ID(q),
    organisationID: '',
    name: b.beneficiaryLabel,
    shortName: '',
    country: pais,
    activityType: '',
    role: 'participant',
    netEcContribution: benef.length === 1 ? num(d.euBudget) : '',
    ecContribution: '',
    paisVia: pais ? 'fuente' : 'sin-pais',
  }));
}
