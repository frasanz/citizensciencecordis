// Lectura de los ZIP de CORDIS. Compartido por el script de actualizacion y el
// navegador: fflate funciona igual en ambos.
import { Unzip, UnzipInflate } from '../vendor/fflate.js';
import { createRowParser } from '../web/src/csv.js';
import {
  COLUMNAS_PROYECTO, OPCIONALES_PROYECTO,
  COLUMNAS_ORGANIZACION, OPCIONALES_ORGANIZACION,
  COLUMNAS_BASE_LEGAL, OPCIONALES_BASE_LEGAL,
} from '../web/src/compute.js';

export const BASE_CORDIS = 'https://cordis.europa.eu/data';

// Recorre en streaming las entradas que interesan de un ZIP en memoria.
// `quiero(nombre)` devuelve el manejador de filas o null para ignorar la entrada.
function pasada(bytes, quiero) {
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder('utf-8');
    const unzip = new Unzip();
    unzip.register(UnzipInflate);

    let abiertos = 0;
    let terminado = false;
    const comprobar = () => { if (terminado && abiertos === 0) resolve(); };

    unzip.onfile = (file) => {
      const destino = quiero(file.name);
      if (!destino) return;
      const { columnas, opcionales, onRecord } = destino;
      const parser = createRowParser({ columns: columnas, opcionales, onRecord });
      abiertos++;
      file.ondata = (err, chunk, final) => {
        if (err) return reject(err);
        // stream:true mantiene el estado entre chunks para no partir un caracter
        // multibyte por la mitad (los nombres vienen llenos de acentos).
        if (chunk?.length) parser.push(decoder.decode(chunk, { stream: !final }));
        if (final) { parser.end(); abiertos--; comprobar(); }
      };
      file.start();
    };

    try {
      const TROZO = 1 << 20;
      for (let i = 0; i < bytes.length; i += TROZO) {
        unzip.push(bytes.subarray(i, Math.min(i + TROZO, bytes.length)), i + TROZO >= bytes.length);
      }
      terminado = true;
      comprobar();
    } catch (e) { reject(e); }
  });
}

// Dos pasadas porque dentro del ZIP organization.csv aparece ANTES que
// project.csv, y hasta no saber que proyectos casan con el filtro no se puede
// decidir que organizaciones guardar. Descomprimir dos veces cuesta CPU pero
// evita tener los 114 MB de CSV en memoria a la vez.
export async function procesarPrograma(bytes, programa, analisis) {
  await pasada(bytes, (n) => n.endsWith('project.csv') && {
    columnas: COLUMNAS_PROYECTO, opcionales: OPCIONALES_PROYECTO,
    onRecord: (r) => analisis.proyecto(r, programa),
  });
  await pasada(bytes, (n) =>
    (n.endsWith('legalBasis.csv') && {
      columnas: COLUMNAS_BASE_LEGAL, opcionales: OPCIONALES_BASE_LEGAL,
      onRecord: (r) => analisis.baseLegal(r),
    }) ||
    (n.endsWith('organization.csv') && {
      columnas: COLUMNAS_ORGANIZACION, opcionales: OPCIONALES_ORGANIZACION,
      onRecord: (r) => analisis.participacion(r),
    }));
}

export async function descargarPrograma(archivo, onProgreso) {
  const res = await fetch(`${BASE_CORDIS}/${archivo}`);
  if (!res.ok) throw new Error(`CORDIS devolvio ${res.status} al pedir ${archivo}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const ultimaMod = res.headers.get('last-modified') || '';

  if (!res.body || !onProgreso) {
    return { bytes: new Uint8Array(await res.arrayBuffer()), ultimaMod };
  }
  const lector = res.body.getReader();
  const trozos = [];
  let leido = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    trozos.push(value);
    leido += value.length;
    onProgreso(leido, total);
  }
  const bytes = new Uint8Array(leido);
  let off = 0;
  for (const t of trozos) { bytes.set(t, off); off += t.length; }
  return { bytes, ultimaMod };
}
