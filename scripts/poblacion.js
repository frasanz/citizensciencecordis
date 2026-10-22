// Poblacion a 1 de enero por pais, de Eurostat (demo_pjan, total de ambos sexos y edades).
// La usa el factsheet para comparar paises por habitante. Reino Unido ya no figura en
// Eurostat, asi que no sale en esas comparaciones.
//
//   node scripts/poblacion.js   -> datos/poblacion.csv  (pais;poblacion;anio;fuente)
//
// Los codigos son los de Eurostat, que coinciden con los de CORDIS (EL para Grecia).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const anioActual = new Date().getUTCFullYear();
const anios = [anioActual, anioActual - 1, anioActual - 2];
const url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_pjan?format=JSON&lang=EN&sex=T&age=TOTAL'
  + anios.map((a) => `&time=${a}`).join('');
const res = await fetch(url);
if (!res.ok) throw new Error(`Eurostat devolvio ${res.status}`);
const d = await res.json();
const geo = d.dimension.geo.category.index;      // codigo -> posicion
const tiempo = d.dimension.time.category.index;  // anio -> posicion
const n = Object.keys(tiempo).length;
const filas = [];
for (const [pais, i] of Object.entries(geo)) {
  if (!/^[A-Z]{2}$/.test(pais) || pais === 'EU' || pais === 'EA') continue;   // agregados (EU27_2020, EA20...) fuera
  // el anio mas reciente con dato para ese pais
  for (const anio of Object.keys(tiempo).sort().reverse()) {
    const v = d.value[String(i * n + tiempo[anio])];
    if (v != null) { filas.push([pais, v, anio]); break; }
  }
}
if (filas.length < 30) throw new Error(`Eurostat: solo ${filas.length} paises, la respuesta no es la esperada`);
filas.sort((a, b) => a[0].localeCompare(b[0]));
const fuente = `Eurostat demo_pjan (actualizado ${d.updated.slice(0, 10)})`;
fs.mkdirSync(path.join(RAIZ, 'datos'), { recursive: true });
fs.writeFileSync(path.join(RAIZ, 'datos', 'poblacion.csv'),
  'pais;poblacion;anio;fuente\n' + filas.map((f) => `${f[0]};${f[1]};${f[2]};${fuente}`).join('\n') + '\n');
console.log(`datos/poblacion.csv: ${filas.length} paises (${fuente})`);
