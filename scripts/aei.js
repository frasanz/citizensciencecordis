// AEI, Agencia Estatal de Investigacion. Su buscador de ayudas concedidas
// (https://www.aei.gob.es/ayudas-concedidas/buscador-ayudas-concedidas) admite
// buscar por titulo, por resumen y por palabras clave, y exporta el resultado a
// CSV con el mismo filtro. No hay volcado completo: se piden los candidatos por
// cada frase y cada campo, se unen por referencia y el criterio se vuelve a
// aplicar aqui sobre el titulo y el resumen, que si vienen en el CSV.
//
// Las palabras clave no se exportan, asi que una ayuda que solo casa por ellas
// no se puede comprobar en local: se acepta con la via 'palabras-clave', que
// queda anotada en cada registro.
//
// El servidor sirve el certificado sin la CA intermedia de la FNMT, asi que
// Node no puede verificarlo por si solo: se añade esa CA (vendor/) a las raices.
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCsvParser } from '../web/src/csv.js';
import { ccaaDe } from './fecyt.js';

export const BASE_AEI = 'https://www.aei.gob.es/ayudas-concedidas/buscador-ayudas-concedidas';
const CA_FNMT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'fnmt-ac-componentes.pem');
let agente = null;
const agenteAei = () => agente ??= new https.Agent({ ca: [...tls.rootCertificates, fs.readFileSync(CA_FNMT, 'utf8')], keepAlive: true });

export function descargarTextoAei(url, intentos = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: agenteAei(), headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 120000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve(descargarTextoAei(new URL(res.headers.location, url).href, intentos));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`AEI devolvio ${res.statusCode} al pedir ${url}`)); }
      const trozos = [];
      res.on('data', (d) => trozos.push(d));
      res.on('end', () => resolve(Buffer.concat(trozos).toString('utf8').replace(/^﻿/, '')));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => (intentos > 1 ? resolve(descargarTextoAei(url, intentos - 1)) : reject(e)));
  });
}

// Una consulta por campo y frase. El buscador compara como subcadena, sin
// acentos ni mayusculas.
export const CAMPOS_AEI = { titulo: 'title', resumen: 'summary', 'palabras-clave': 'keywords' };
export const urlCsvAei = (campo, frase) => `${BASE_AEI}/download/All/All/All/All?${CAMPOS_AEI[campo]}=${encodeURIComponent(frase)}`;
export const urlFichaAei = (referencia) => `${BASE_AEI}?code=${encodeURIComponent(referencia)}`;

// Cabecera real del CSV (sep ';', importes "69.500,00"):
// Año;Convocatoria;Referencia;Género;Área;Subárea;Título;C.I.F.;Entidad;CC.AA.;Provincia;€ Conced.;Resumen
export function leerCsvAei(texto) {
  const filas = [];
  let cab = null;
  const parser = createCsvParser({ delimiter: ';', onRow: (r) => {
    if (!cab) { cab = r.map((c) => c.replace(/^﻿/, '').trim()); return; }
    if (r.length < 5 || r.every((c) => !c)) return;
    const o = {};
    cab.forEach((c, i) => { o[c] = (r[i] ?? '').trim(); });
    filas.push(o);
  } });
  parser.push(texto);
  parser.end?.();
  return filas;
}

const importe = (s) => {
  const n = Number(String(s ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function registroAei(f, via) {
  const ccaa = ccaaDe(f['CC.AA.']) ?? '';
  return {
    id: `AEI:${f.Referencia}`,
    financiador: 'AEI',
    convocatoria: f.Convocatoria || '',
    anio: +f['Año'] || null,
    referencia: f.Referencia || '',
    titulo: f['Título'] || '',
    resumen: f.Resumen || '',
    categoria: [f['Área'], f['Subárea']].filter(Boolean).join(' · '),
    entidad: f.Entidad || '',
    cif: f['C.I.F.'] || '',
    ccaa,
    ccaaVia: ccaa ? 'fuente' : (f['CC.AA.'] ? 'sin-ccaa' : 'sin-ccaa'),
    ccaaOriginal: f['CC.AA.'] || '',
    provincia: f.Provincia || '',
    localizacion: '',
    inicio: '',
    fin: '',
    importe: importe(f['€ Conced.']),
    presupuesto: 0,
    fondo: '',
    via,
    url: urlFichaAei(f.Referencia),
  };
}
