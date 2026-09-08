// Programa LIFE (CINEA). No esta en CORDIS: se lee de la base de datos publica
// de LIFE, que expone la misma API REST que usa su web (sin autenticacion), y de
// la ficha HTML de cada proyecto candidato, donde vive la descripcion.
//
// El resultado se entrega al mismo `analisis` que los programas de CORDIS, con
// registros de la misma forma (project.csv / legalBasis.csv / organization.csv),
// para que el criterio y todos los indicadores se calculen igual.
//
// Lo que LIFE no da y CORDIS si: el PIC de cada socio, su tipo de entidad, la
// contribucion por socio y, en los proyectos posteriores a 2020, el pais de los
// socios. El pais se resuelve por una cadena de fuentes, y cada participacion
// lleva anotada la via (campo `via`) para que nadie sume peras con manzanas.
import fs from 'node:fs';
import path from 'node:path';
import { createCsvParser } from '../web/src/csv.js';

export const BASE_LIFE = 'https://webgate.ec.europa.eu/life/publicWebsite';
export const BASE_FTS = 'https://ec.europa.eu/budget/financial-transparency-system/download';

// ---------- paises: LIFE y el FTS escriben los nombres, CORDIS usa codigos ----------
// Codigos de CORDIS (UK y EL en vez de GB y GR). Las claves se comparan
// normalizadas (sin acentos, minusculas). "International Organisations" no
// es un pais y queda vacio a proposito.
const PAISES_LISTA = {
  ES: ['espana', 'spain'], IT: ['italia', 'italy'], FR: ['france'], DE: ['deutschland', 'germany'],
  EL: ['ellas', 'greece', 'ellada'], BE: ['belgie - belgique', 'belgium', 'belgique', 'belgie'],
  NL: ['nederland', 'the netherlands', 'netherlands'], UK: ['united kingdom', 'uk', 'great britain'],
  PT: ['portugal'], SE: ['sverige', 'sweden'], FI: ['finland suomi', 'finland', 'suomi'],
  AT: ['osterreich', 'austria'], PL: ['poland polska', 'poland', 'polska'], DK: ['danmark', 'denmark'],
  IE: ['ireland'], HU: ['hungary magyarorszag', 'hungary', 'magyarorszag'], RO: ['romania'],
  SI: ['slovenia slovenija', 'slovenia', 'slovenija'], BG: ['bulgaria balgarija', 'bulgaria'],
  LV: ['latvia latvija', 'latvia'], SK: ['slovakia slovensko', 'slovakia', 'slovak republic'],
  CY: ['cyprus'], EE: ['estonia eesti', 'estonia'], CZ: ['czech cesko', 'czech republic', 'czechia', 'cesko'],
  HR: ['croatia hrvatska', 'croatia'], LT: ['lithuania lietuva', 'lithuania'], TR: ['turkey turkiye', 'turkey', 'turkiye'],
  LU: ['luxembourg'], RU: ['russia rossija', 'russia'], MT: ['malta'], MA: ['maroc', 'morocco'], IL: ['israel'],
  BA: ['bosnia herzegovina', 'bosnia and herzegovina'], TN: ['tunisie', 'tunisia'], AL: ['albania shqiperia', 'albania'],
  LB: ['lebanon'], PS: ['gaza strip & west bank', 'palestine'], EG: ['egypt'], IS: ['iceland'], JO: ['jordan'],
  SY: ['syria'], DZ: ['algerie', 'algeria'], UA: ['ukraine'], MK: ['north macedonia', 'macedonia'],
  PF: ['french polynesia'], NC: ['new caledonia'], CH: ['switzerland', 'schweiz', 'suisse'], NO: ['norway', 'norge'],
  RS: ['serbia'], ME: ['montenegro'], XK: ['kosovo', 'kosovo (under unscr 1244/99)'], MD: ['moldova'],
  LI: ['liechtenstein'], US: ['usa', 'united states'], BR: ['brazil'], UZ: ['uzbekistan'],
};
const PAISES = new Map();
for (const [codigo, nombres] of Object.entries(PAISES_LISTA)) for (const n of nombres) PAISES.set(n, codigo);

export const normaliza = (s) => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// Para comparar nombres de entidades: mayusculas, sin acentos ni puntuacion.
export const claveNombre = (s) => normaliza(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

export const codigoPais = (nombre) => PAISES.get(normaliza(nombre)) ?? null;

// ---------- pais por la forma juridica o el gentilicio del nombre ----------
// Solo se asigna cuando UN unico pais casa: "SRL" existe en Italia y en Belgica,
// "GmbH" en Alemania y Austria, asi que esos no se usan. Es la penultima via de
// la cadena y queda marcada como tal.
const FORMAS = {
  IT: /\b(ENTE|PARCO|RISERVA|PROVINCIA DI|COMUNE DI|CITTA METROPOLITANA|REGIONE|UNIVERSITA|ISTITUTO|CONSORZIO|AZIENDA|FONDAZIONE|ASSOCIAZIONE|AGENZIA|SOCIETA|COOPERATIVA|ONLUS|ODV|ITALIA|ITALIAN[AO]?|TOSCANA|LOMBARD[IAO]+|PIEMONTE|SICILIA|SARDEGNA|VENETO|EMILIA|LAZIO|PUGLIA|CAMPANIA|LIGUR[EI]|ROMA|MILANO|NAPOLI|TORINO|FIRENZE|BOLOGNA|GENOVA|PADOVA|TRIESTE|TRENTO|FRIULI|ABRUZZO|MARCHE|UMBRIA|CALABRIA|BASILICATA|MOLISE)\b/,
  ES: /\b(SCCL|S\.?COOP|AYUNTAMIENTO|AJUNTAMENT|GENERALITAT|DIPUTACI[OÓ]N?|CONSORCI|ASSOCIACI[OÓ]|ASOCIACI[OÓ]N|UNIVERSITAT|UNIVERSIDAD DE|FUNDACI[OÓ]N?|JUNTA DE|XUNTA|GOBIERNO DE|COMUNIDAD|MANCOMUNIDAD|CABILDO|ESPANA|ESPANOL[AE]?|CATALUNYA|CATALAN[AE]?|ANDALUC[IÍ]A|GALICIA|GALEGA|VALENCIA|EUSKAL|VASCO|ARAGON|CANARIA[S]?|BALEAR[S]?|MADRID|BARCELONA|SEVILLA|ZARAGOZA|MURCIA|NAVARRA|ASTURIAS|CANTABRIA|EXTREMADURA|CASTILLA|RIOJA)\b/,
  PT: /\b(LDA|ASSOCIACAO|MUNICIPIO DE|CAMARA MUNICIPAL|UNIVERSIDADE|INSTITUTO DA|COOPERATIVA DE|FUNDACAO|CRL|PORTUGU[EÊ]S[AE]?|PORTUGAL|LISBOA|PORTO|ALGARVE|ACORES|MADEIRA|COIMBRA|AVEIRO|BRAGA|ALENTEJO)\b/,
  FR: /\b(SARL|SASU|SYNDICAT MIXTE|CONSEIL DEPARTEMENTAL|CONSEIL REGIONAL|FRANCE|FRANCAIS[E]?|PARIS|LYON|MARSEILLE|BRETAGNE|OCCITANIE|NORMANDIE)\b/,
  DE: /\b(BEZIRKSAMT|LANDKREIS|FREISTAAT|BUNDESAMT|LANDESAMT|DEUTSCH[EA]?|DEUTSCHLAND|BERLIN|HAMBURG|MUNCHEN|BAYERN|SACHSEN|BRANDENBURG|NIEDERSACHSEN|THURINGEN|HESSEN)\b/,
  NL: /\b(STICHTING|WATERSCHAP|NEDERLAND[S]?|AMSTERDAM|ROTTERDAM|WAGENINGEN|UTRECHT|GRONINGEN|LEIDEN)\b/,
  BE: /\b(VZW|ASBL|BVBA|SPRL|VLAAMS[E]?|VLAANDEREN|WALLON[IE]*|BRUXELLES|BRUSSEL[S]?|GENT|LEUVEN|ANTWERPEN|LIEGE)\b/,
  CZ: /\b(Z\.?S|V\.?V\.?I|CESK[AEY]|CZECH|PRAHA|BRNO|OSTRAVA)\b/,
  SI: /\b(ZAVOD|MINISTRSTVO|OBCINA|DRUSTVO|UNIVERZA V|SLOVENIJ[AE]|SLOVENSK[AI]|LJUBLJANA|MARIBOR)\b/,
  HR: /\b(HRVATSK[AEIO]|UDRUGA|SVEUCILISTE|OPCINA|JAVNA USTANOVA|ZAGREB|SPLIT|RIJEKA)\b/,
  EL: /\b(ANONYM[IO]S? ETAIR[EI]+A|ANONIMI ETERIA|DIMOS|PERIFEREIA|PANEPISTIMIO|ETHNIKO|ELLINIK[IO]S?|ELLADA|YPOURGEIO|IDRYMA|ATHINA|ATHENS|THESSALONIKI|KRITI|CRETE|GREEK|GREECE)\b/,
  CY: /\b(CYPRUS|KYPR[OI]S?|LEFKOSIA|NICOSIA|LEMESOS|LIMASSOL)\b/,
  HU: /\b(KFT|ZRT|EGYESULET|ALAPITVANY|ONKORMANYZAT|EGYETEM|MAGYAR|BUDAPEST)\b/,
  PL: /\b(SP\.? ?Z ?O\.? ?O|SPOLKA|GMINA|FUNDACJA|STOWARZYSZENIE|UNIWERSYTET|INSTYTUT|POWIAT|WOJEWODZTWO|POLSK[AI]|WARSZAWA|KRAKOW)\b/,
  SK: /\b(SLOVENSK[AEO]|BRATISLAVA|KOSICE)\b/,
  RO: /\b(ASOCIATIA|PRIMARIA|JUDETUL|UNIVERSITATEA|INSTITUTUL|FUNDATIA|ROMAN[AI]|ROMANIA|BUCURESTI)\b/,
  BG: /\b(EOOD|OOD|SDRUZHENIE|OBSHTINA|FONDATSIYA|BULGARIA|BALGARIJA|SOFIA)\b/,
  SE: /\b(KOMMUN|LANSSTYRELSEN|STIFTELSEN|SVERIGE|SVENSK[AT]?|STOCKHOLM|GOTEBORG|UPPSALA|LUND)\b/,
  FI: /\b(OY|RY|KAUPUNKI|YLIOPISTO|SUOMEN|SUOMI|FINLAND|HELSINKI|TAMPERE|TURKU)\b/,
  EE: /\b(MTU|SIHTASUTUS|EESTI|TALLINN|TARTU)\b/,
  LV: /\b(SIA|BIEDRIBA|LATVIJA[S]?|RIGA)\b/,
  LT: /\b(UAB|VSI|LIETUVOS|VILNIUS|KAUNAS)\b/,
  IE: /\b(CLG|IRELAND|IRISH|EIREANN|DUBLIN|CORK|GALWAY)\b/,
  UK: /\b(PLC|CIC|BOROUGH COUNCIL|SCOTLAND|SCOTTISH|WALES|WELSH|ENGLAND|ENGLISH|LONDON|MANCHESTER|EDINBURGH|CARDIFF|BELFAST)\b/,
  MT: /\b(MALTA|MALTESE|VALLETTA)\b/,
  AT: /\b(OSTERREICH|OESTERREICH|AUSTRIA|LANDESREGIERUNG|WIEN|GRAZ|LINZ|SALZBURG|INNSBRUCK)\b/,
  DK: /\b(DANMARK|DANSK[E]?|DENMARK|KOBENHAVN|COPENHAGEN|AARHUS)\b/,
  NO: /\b(NORGE|NORSK|NORWAY|NORWEGIAN|OSLO|BERGEN)\b/,
};

export function paisPorForma(nombre) {
  const n = claveNombre(nombre);
  const casan = Object.entries(FORMAS).filter(([, re]) => re.test(n)).map(([c]) => c);
  return casan.length === 1 ? casan[0] : null;
}

// ---------- API de la base de datos publica de LIFE ----------
const CAMPOS_BUSQUEDA = 'years=&priorityAreas=&submittingCountries=&benefitingCountries=&nutsCodes='
  + '&beneficiaryTypes=&themes=&keywords=&legislatives=&habitats=&species=&redSpecies=&nat2kSites=';

// `tipo`: 0 variantes de la palabra, 1 palabra exacta, 2 frase exacta.
// Con texto vacio, el tipo 0 devuelve una respuesta cacheada y truncada (29
// filas, total 0) en la primera pagina; el tipo 2 no tiene ese problema, asi
// que es el que se usa para el volcado completo.
async function buscar(endpoint, { texto = '', tipo = 2, pagina = 1, tam = 500 } = {}) {
  const cuerpo = `basicSearchText=${encodeURIComponent(texto)}&freeTextSearchType=${tipo}&${CAMPOS_BUSQUEDA}`
    + `&page=${pagina}&cache=false&nocache=${Math.random()}&take=${tam}&skip=${(pagina - 1) * tam}&pageSize=${tam}`
    + '&sort%5B0%5D%5Bfield%5D=id&sort%5B0%5D%5Bdir%5D=asc';
  const res = await fetch(`${BASE_LIFE}/api/rest/dissemination/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Referer: `${BASE_LIFE}/search`,
    },
    body: cuerpo,
  });
  if (!res.ok) throw new Error(`LIFE devolvio ${res.status} en ${endpoint}`);
  return res.json();
}

// Todos los proyectos con sus campos completos (referencia, pais del
// coordinador, fechas, presupuesto, area prioritaria...). La descripcion no
// viene aqui: esta en la ficha HTML.
export async function descargarProyectosLife(onProgreso) {
  const porId = new Map();
  let total = null;
  for (let pagina = 1; ; pagina++) {
    const r = await buscar('search/excel', { pagina, tam: 500 });
    if (total == null) total = r.total;
    for (const x of r.data ?? []) porId.set(x.projectId, x);
    onProgreso?.(porId.size, total);
    if (!r.data?.length || porId.size >= total) break;
    if (pagina > 60) throw new Error('LIFE: demasiadas paginas, algo va mal');
  }
  // Comprobacion contra el buscador ligero: si el volcado se hubiera truncado
  // por la cache, los totales no cuadrarian.
  const ligero = await buscar('search', { tam: 1 });
  if (ligero.total !== porId.size) {
    throw new Error(`LIFE: el volcado trae ${porId.size} proyectos pero el buscador cuenta ${ligero.total}`);
  }
  return [...porId.values()];
}

// Candidatos: el buscador de LIFE indexa descripciones y documentos adjuntos,
// asi que devuelve mas de los que cumplen el criterio. Se piden con variantes
// (tipo 0) y ademas la forma con guion, y luego decide el filtro sobre la ficha.
export async function buscarCandidatosLife(frase) {
  const ids = new Set();
  for (const texto of [frase, frase.replace(/\s+/g, '-')]) {
    const r = await buscar('search', { texto, tipo: 0, tam: 2000 });
    for (const x of r.data ?? []) ids.add(x.projectId);
  }
  return ids;
}

// ---------- ficha HTML de un proyecto ----------
// Entidades HTML que aparecen en las fichas (nombres con acentos y cedillas).
const ENTIDADES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: "'", lsquo: "'", ndash: '-', mdash: '-',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', ccedil: 'ç', atilde: 'ã', otilde: 'õ',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù', auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü',
  acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û', szlig: 'ß', oslash: 'ø', aring: 'å', aelig: 'æ',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Ccedil: 'Ç', Atilde: 'Ã', Otilde: 'Õ',
  Agrave: 'À', Egrave: 'È', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', Oslash: 'Ø', Aring: 'Å' };
const desescapa = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&([a-zA-Z]+);/g, (m, e) => ENTIDADES[e] ?? m);
const textoDe = (html) => desescapa(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
  .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export function leerFicha(html) {
  const t = textoDe(html);
  const desc = /\bPROJECT DESCRIPTION\b([\s\S]*?)\bADMINISTRATIVE DATA\b/.exec(t)?.[1] ?? '';
  const partes = desc.split(/\b(BACKGROUND|OBJECTIVES|RESULTS)\b/);
  const sec = { background: '', objectives: '', results: '' };
  for (let i = 1; i < partes.length - 1; i += 2) sec[partes[i].toLowerCase()] += partes[i + 1].trim() + ' ';

  // Coordinador: nombre, forma juridica y pais de la direccion postal.
  const c = /Coordinating Beneficiary:\s*(.*?)\s*Legal Status:\s*(.*?)\s*Address:\s*(.*?)\s*Contact Person/.exec(t);
  const coordinador = c ? { nombre: c[1].trim(), estatus: c[2].trim(), pais: codigoPais(c[3].split(',').pop()) } : null;

  // Socios: tabla PARTNERSHIPS. Hasta 2020 cada fila es "SIGLAS(Nombre), Pais";
  // desde 2021 es solo el nombre legal del registro de participantes.
  const socios = [];
  const iniTabla = html.indexOf('PARTNERSHIPS');
  if (iniTabla >= 0) {
    const tabla = html.slice(iniTabla, html.indexOf('</table>', iniTabla));
    for (const tr of tabla.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => textoDe(m[1]));
      if (tds.length < 3) continue;
      let nombre = tds[0], siglas = '', pais = null;
      // ", Pais" al final, con o sin ", till dd/mm/aaaa" detras
      const m = /^(.*?),\s*([^,]+?)(?:,\s*(?:till|from)\b.*)?$/.exec(nombre);
      if (m && codigoPais(m[2])) { nombre = m[1]; pais = codigoPais(m[2]); }
      const s = /^([A-Za-z0-9.&\- ]{2,20})\((.+)\)$/.exec(nombre);
      if (s) { siglas = s[1].trim(); nombre = s[2].trim(); }
      socios.push({ nombre: nombre.trim(), siglas, pais, rol: /coordinator/i.test(tds[2]) ? 'coordinator' : 'participant',
                    activo: /ACTIVE/.test(tds[1]) });
    }
  }
  return { descripcion: (sec.background + sec.objectives).trim(), resultados: sec.results.trim(), coordinador, socios };
}

export async function descargarFicha(url) {
  const res = await fetch(encodeURI(decodeURI(url)), { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`LIFE devolvio ${res.status} al pedir la ficha ${url}`);
  return res.text();
}

// ---------- FTS: todos los beneficiarios de cada subvencion, con pais ----------
// El Sistema de Transparencia Financiera de la UE publica un CSV por año con
// cada beneficiario y su pais. Solo rellena el numero de proyecto desde 2025,
// asi que sirve para las subvenciones firmadas desde entonces.
export async function descargarFts(anio) {
  const res = await fetch(`${BASE_FTS}/${anio}_FTS_dataset_en.csv`);
  if (res.status === 404) return null;   // el año aun no esta publicado
  if (!res.ok) throw new Error(`FTS devolvio ${res.status} para ${anio}`);
  // Para un año sin publicar el servidor contesta 200 con una pagina HTML.
  if (!/text\/csv|octet-stream/.test(res.headers.get('content-type') || '')) return null;
  return new Uint8Array(await res.arrayBuffer());
}

// Devuelve Map(projectId -> [{nombre, pais}]) solo para los ids pedidos.
export function leerFts(bytes, idsInteres) {
  const texto = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  const porProyecto = new Map();
  let cab = null, iNombre = -1, iPais = -1, iId = -1;
  const parser = createCsvParser({ delimiter: ',', onRow: (fila) => {
    if (!cab) {
      cab = fila; iNombre = cab.indexOf('Name of beneficiary'); iPais = cab.indexOf('Beneficiary country'); iId = cab.indexOf('Project ID');
      if (iNombre < 0 || iPais < 0 || iId < 0) throw new Error('FTS: cabecera inesperada');
      return;
    }
    const id = fila[iId];
    if (!idsInteres.has(id)) return;
    if (!porProyecto.has(id)) porProyecto.set(id, []);
    porProyecto.get(id).push({ nombre: fila[iNombre], pais: codigoPais(fila[iPais]) });
  } });
  parser.push(texto);
  parser.end();
  return porProyecto;
}

// Busca un socio entre los beneficiarios FTS de su misma subvencion: primero
// nombre exacto, luego por palabras compartidas si solo un candidato encaja.
const RELLENO = new Set(['DE', 'DI', 'DA', 'DEL', 'DELLA', 'DELLE', 'DEI', 'LA', 'LE', 'EL', 'LOS', 'LAS', 'THE', 'OF',
  'AND', 'E', 'Y', 'ET', 'SRL', 'SPA', 'SA', 'SL', 'LTD', 'LIMITED', 'GMBH', 'BV', 'ETS', 'ONLUS', 'ODV', 'APS', 'SOCIETA']);
const palabras = (s) => new Set(claveNombre(s).split(' ').filter((w) => w.length >= 3 && !RELLENO.has(w)));

export function casarEnFts(nombre, beneficiarios) {
  const k = claveNombre(nombre);
  const exacto = beneficiarios.find((b) => claveNombre(b.nombre) === k);
  if (exacto) return { pais: exacto.pais, via: 'fts' };
  const mias = palabras(nombre);
  if (mias.size < 2) return null;
  const candidatos = beneficiarios.filter((b) => {
    const suyas = palabras(b.nombre);
    let comunes = 0;
    for (const w of mias) if (suyas.has(w)) comunes++;
    return comunes >= 2 && comunes >= Math.min(mias.size, suyas.size) * 0.6;
  });
  return candidatos.length === 1 ? { pais: candidatos[0].pais, via: 'fts-aprox' } : null;
}

// ---------- tabla manual ----------
// datos/life-paises.csv: nombre;pais;fuente. Es la ultima via de la cadena y la
// unica que edita una persona.
export function leerTablaManual(ruta) {
  const m = new Map();
  if (!fs.existsSync(ruta)) return m;
  const lineas = fs.readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).slice(1);
  for (const l of lineas) {
    const [nombre, pais] = l.split(';');
    if (nombre && pais && pais.trim()) m.set(claveNombre(nombre), pais.trim().toUpperCase());
  }
  return m;
}

export function escribirPendientes(ruta, pendientes) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const filas = [...pendientes].sort().map((n) => `${n};;`);
  fs.writeFileSync(ruta, ['nombre;pais;fuente', ...filas, ''].join('\n'));
}

// ---------- integracion con el analisis ----------
// dd/mm/aaaa -> aaaa-mm-dd; el resto de campos de fecha pasan tal cual.
const isoFecha = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (s || '');
};
const importe = (s) => String(s ?? '').replace(/,/g, '');   // "656,090" -> "656090"
const slug = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

export const ID_LIFE = (projectId) => `LIFE-${projectId}`;
export const grantDe = (referencia) => /\/(\d{9})$/.exec(referencia || '')?.[1] ?? null;

// Entrega al analisis un proyecto LIFE con la forma de project.csv.
export function registroProyecto(x, descripcion) {
  return {
    id: ID_LIFE(x.projectId),
    acronym: x.acronym || '',
    title: x.title || '',
    objective: descripcion || '',
    keywords: x.keywords || '',
    status: '',
    startDate: isoFecha(x.startDate),
    endDate: isoFecha(x.endDate),
    ecMaxContribution: importe(x.ecContribution),
    totalCost: importe(x.totalBudget),
    fundingScheme: x.priorityArea || '',
    ecSignatureDate: x.year ? `${x.year}-01-01` : '',
    url: x.projectPublicPageFriendlyUrl || '',
    referencia: x.reference || '',
  };
}

export function registroBaseLegal(x) {
  return { projectID: ID_LIFE(x.projectId), legalBasis: `LIFE-${slug(x.priorityArea)}`, title: x.priorityArea || '' };
}

// Resuelve el pais de cada socio por la cadena: ficha -> CORDIS (nombre legal
// exacto, que ademas da el PIC) -> FTS -> forma juridica -> tabla manual.
// `cordis` es Map(claveNombre -> {pais, pic}); `fts` la lista de beneficiarios
// de esa subvencion o null; `manual` Map(claveNombre -> pais).
export function registrosParticipacion(x, ficha, { cordis, fts, manual }) {
  const salida = [];
  const socios = ficha.socios.length ? ficha.socios : [];
  // Si la tabla no trae coordinador, se toma del bloque de contacto.
  if (ficha.coordinador && !socios.some((s) => s.rol === 'coordinator')) {
    socios.unshift({ nombre: ficha.coordinador.nombre, siglas: '', pais: ficha.coordinador.pais, rol: 'coordinator', activo: true });
  }
  for (const s of socios) {
    let pais = s.pais, via = pais ? 'ficha' : '', pic = '';
    const k = claveNombre(s.nombre);
    const enCordis = cordis.get(k);
    if (enCordis) pic = enCordis.pic || '';
    if (!pais && enCordis?.pais) { pais = enCordis.pais; via = 'cordis'; }
    if (!pais && s.rol === 'coordinator' && ficha.coordinador?.pais) { pais = ficha.coordinador.pais; via = 'ficha'; }
    if (!pais && fts) { const c = casarEnFts(s.nombre, fts); if (c?.pais) { pais = c.pais; via = c.via; } }
    if (!pais) { const f = paisPorForma(s.nombre); if (f) { pais = f; via = 'forma-juridica'; } }
    if (!pais && manual.has(k)) { pais = manual.get(k); via = 'manual'; }
    salida.push({
      projectID: ID_LIFE(x.projectId),
      organisationID: pic,
      name: s.nombre,
      shortName: s.siglas,
      country: pais || '',
      activityType: '',
      role: s.rol,
      netEcContribution: '',
      ecContribution: '',
      paisVia: pais ? via : 'sin-pais',
    });
  }
  return salida;
}
