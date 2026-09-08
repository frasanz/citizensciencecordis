// Fundacion Biodiversidad (MITECO). Su web es un WordPress con la API REST
// abierta, y cada proyecto financiado es una entrada de uno de varios tipos
// (convocatorias generales, PRTR, Empleaverde, Pleamar, FEDER, LIFE, Biodiversa+).
// La API da titulo y descripcion de todas las fichas; el resto (entidad
// beneficiaria, importe, presupuesto, años, localizacion) solo esta en el HTML
// de la ficha, que se baja unicamente para las que cumplen el criterio.
import { ccaaDe } from './fecyt.js';

export const BASE_FB = 'https://fundacion-biodiversidad.es';
const API = `${BASE_FB}/wp-json/wp/v2`;

// Tipo de entrada -> nombre del programa, tal como lo llama la propia web.
export const PROGRAMAS_FB = {
  proyectos_ficha: 'Convocatorias de ayudas',
  proyecto_prtr: 'Plan de Recuperación (PRTR)',
  programa_empleaverde: 'Programa Empleaverde',
  programa_pleamar: 'Programa Pleamar',
  proyecto_feder: 'Convocatorias FEDER',
  life: 'LIFE',
  proyecto_biodiversa: 'Biodiversa+',
};

async function pedirJson(url) {
  for (let intento = 1; ; intento++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    if (res.ok) return { datos: await res.json(), total: +res.headers.get('x-wp-total') || 0, paginas: +res.headers.get('x-wp-totalpages') || 0 };
    if (intento >= 3 || res.status < 500) throw new Error(`Fundación Biodiversidad devolvio ${res.status} al pedir ${url}`);
    await new Promise((r) => setTimeout(r, 1500 * intento));
  }
}

export const quitarHtml = (s) => String(s ?? '')
  .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h\d>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
  .replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

// Todas las entradas de un tipo, con lo justo para aplicar el criterio.
export async function listarTipo(tipo, onProgreso) {
  const campos = 'id,link,title,content,type,financiaci_n,lineas_actuacion_tematicas,date,modified';
  const out = [];
  for (let pagina = 1; ; pagina++) {
    const { datos, paginas } = await pedirJson(`${API}/${tipo}?per_page=100&page=${pagina}&_fields=${campos}`);
    for (const d of datos) {
      out.push({
        id: d.id, tipo, url: d.link, publicado: d.date, modificado: d.modified,
        titulo: quitarHtml(d.title?.rendered), descripcion: quitarHtml(d.content?.rendered),
        financiacion: d.financiaci_n ?? [], lineas: d.lineas_actuacion_tematicas ?? [],
      });
    }
    onProgreso?.(out.length, paginas);
    if (pagina >= paginas || !datos.length) break;
  }
  return out;
}

export async function listarTerminos(taxonomia) {
  const m = new Map();
  for (let pagina = 1; ; pagina++) {
    const { datos, paginas } = await pedirJson(`${API}/${taxonomia}?per_page=100&page=${pagina}&_fields=id,name`);
    for (const t of datos) m.set(t.id, quitarHtml(t.name));
    if (pagina >= paginas || !datos.length) break;
  }
  return m;
}

export async function descargarFicha(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Fundación Biodiversidad devolvio ${res.status} al pedir la ficha ${url}`);
  return res.text();
}

// La ficha lleva sus datos como pares <h4>Etiqueta:</h4> valor dentro de la
// pestaña "Proyecto", y la entidad y los objetivos en pestañas propias.
export function leerFicha(html) {
  const zona = /<div class="box-proyectos">([\s\S]*?)<footer|<div class="box-proyectos">([\s\S]*)/.exec(html);
  const h = zona ? (zona[1] ?? zona[2]) : html;
  const datos = {};
  // El valor va suelto tras el <h4> o, en Pleamar y PRTR, dentro de un <span>.
  for (const m of h.matchAll(/<h4>\s*([^<]+?)\s*:?\s*<\/h4>\s*(?:<span>)?\s*([^<]*)/g)) datos[quitarHtml(m[1]).replace(/:$/, '')] = quitarHtml(m[2]);
  const pestanas = {};
  for (const m of h.matchAll(/<label class="tab-label"[^>]*>\s*([^<]+?)\s*<\/label>\s*<div class="tab-content">([\s\S]*?)<\/div>\s*<\/div>/g)) pestanas[quitarHtml(m[1])] = quitarHtml(m[2]);
  const conv = /<a href="([^"]+)"[^>]*class="btn_convocatoria_verde"/.exec(h);
  const importe = (s) => { const m = /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*€/.exec(s || ''); return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : 0; };
  const anio = (s) => { const m = /(\d{4})/.exec(s || ''); return m ? +m[1] : null; };
  const duracion = /(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(datos['Duración'] || '');
  const localizacion = datos['Localización'] || '';
  return {
    linea: datos['Linea de actuación'] || datos['Línea de actuación'] || '',
    estado: datos['Estado'] || '',
    localizacion,
    inicio: duracion ? `${duracion[3]}-${duracion[2]}-${duracion[1]}` : (anio(datos['Fecha de ejecución']) ? `${anio(datos['Fecha de ejecución'])}` : ''),
    fin: duracion ? `${duracion[6]}-${duracion[5]}-${duracion[4]}` : (anio(datos['Fecha de finalización']) ? `${anio(datos['Fecha de finalización'])}` : ''),
    presupuesto: importe(datos['Presupuesto total']),
    importe: importe(datos['Importe de la ayuda de la Fundación Biodiversidad'] || datos['Importe de la ayuda']),
    entidad: pestanas['Entidad beneficiaria'] || '',
    objetivos: pestanas['Objetivos'] || '',
    antecedentes: pestanas['Antecedentes'] || '',
    convocatoriaUrl: conv ? conv[1] : '',
    webProyecto: datos['Página web del proyecto'] || '',
  };
}

// CCAA a partir de la localizacion de la ficha: solo si nombra una unica comunidad.
export function ccaaDeLocalizacion(s) {
  const encontradas = new Set();
  const texto = ` ${String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()} `;
  for (const nombre of ['andalucia', 'aragon', 'asturias', 'baleares', 'balears', 'canarias', 'cantabria', 'castilla y leon', 'castilla-la mancha', 'castilla la mancha',
    'cataluna', 'catalunya', 'comunidad valenciana', 'comunitat valenciana', 'extremadura', 'galicia', 'madrid', 'murcia', 'navarra', 'pais vasco', 'euskadi', 'la rioja', 'ceuta', 'melilla']) {
    if (texto.includes(` ${nombre} `) || texto.includes(`(${nombre})`) || texto.includes(` ${nombre},`) || texto.includes(` ${nombre}.`) || texto.includes(` ${nombre})`)) encontradas.add(ccaaDe(nombre));
  }
  return encontradas.size === 1 ? [...encontradas][0] : null;
}

export function registroFb(entrada, ficha, terminos) {
  const fondo = entrada.financiacion.map((id) => terminos.financiacion.get(id)).filter(Boolean).join(' · ');
  const lineas = entrada.lineas.map((id) => terminos.lineas.get(id)).filter(Boolean).join(' · ');
  const anioDe = (s) => { const y = parseInt(String(s || '').slice(0, 4), 10); return Number.isFinite(y) ? y : null; };
  return {
    id: `FB:${entrada.id}`,
    financiador: 'FB',
    convocatoria: PROGRAMAS_FB[entrada.tipo] || entrada.tipo,
    // Año de inicio segun la ficha; si no lo trae, el de publicacion de la ficha en la web.
    anio: anioDe(ficha.inicio) ?? anioDe(entrada.publicado),
    referencia: String(entrada.id),
    titulo: entrada.titulo,
    resumen: [entrada.descripcion, ficha.objetivos ? `Objetivos: ${ficha.objetivos}` : ''].filter(Boolean).join('\n'),
    categoria: ficha.linea || lineas,
    entidad: ficha.entidad,
    cif: '',
    ccaa: '',
    ccaaVia: 'sin-ccaa',
    localizacion: ficha.localizacion,
    inicio: ficha.inicio,
    fin: ficha.fin,
    estado: ficha.estado,
    importe: ficha.importe,
    presupuesto: ficha.presupuesto,
    fondo,
    url: entrada.url,
    anioVia: ficha.inicio ? 'ficha' : 'publicacion',
  };
}
