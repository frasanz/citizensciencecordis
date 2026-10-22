// Geometrías para los mapas del factsheet: países europeos (NUTS 0) y comunidades autónomas
// españolas (NUTS 2), de Eurostat GISCO, 1:10 millones, ETRS89 (EPSG:4326).
// Se simplifican y se redondean para que el fichero ocupe poco; se ejecuta a mano cuando
// cambie la versión de NUTS, no en cada actualización.
//
//   node scripts/mapas.js   -> datos/mapas.json
//
// © EuroGeographics para los límites administrativos (reutilización libre con cita del origen).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = (n) => `https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_10M_2021_4326_LEVL_${n}.geojson`;
const bajar = async (n) => { const r = await fetch(URL(n)); if (!r.ok) throw new Error(`GISCO ${n}: ${r.status}`); return r.json(); };

// Douglas-Peucker sobre un anillo; tolerancia en grados.
function simplificar(pts, tol) {
  if (pts.length < 8) return pts;
  const dist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const mantener = new Uint8Array(pts.length); mantener[0] = mantener[pts.length - 1] = 1;
  const pila = [[0, pts.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop();
    let m = 0, k = -1;
    for (let x = i + 1; x < j; x++) { const d = dist(pts[x], pts[i], pts[j]); if (d > m) { m = d; k = x; } }
    if (m > tol) { mantener[k] = 1; pila.push([i, k], [k, j]); }
  }
  return pts.filter((_, i) => mantener[i]);
}
const redondear = (pts) => pts.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
const centro = (anillo) => { const xs = anillo.map((p) => p[0]), ys = anillo.map((p) => p[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; };

// Un MultiPolygon -> lista de anillos exteriores (los huecos no se dibujan), simplificados.
function anillos(geom, tol, filtro = () => true) {
  const polis = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polis.map((p) => p[0]).filter((a) => filtro(centro(a))).map((a) => redondear(simplificar(a, tol))).filter((a) => a.length >= 4);
}

const n0 = await bajar(0);
const n2 = await bajar(2);
// Europa continental e islas mayores: fuera territorios de ultramar, Canarias, Madeira, Azores y Svalbard.
const enEuropa = ([x, y]) => x > -25 && x < 45 && y > 34 && y < 72;
const paises = n0.features.map((f) => ({
  id: f.properties.NUTS_ID, nombre: f.properties.NAME_LATN, anillos: anillos(f.geometry, 0.04, enEuropa),
})).filter((p) => p.anillos.length);
const ccaa = n2.features.filter((f) => f.properties.CNTR_CODE === 'ES').map((f) => ({
  id: f.properties.NUTS_ID, nombre: f.properties.NAME_LATN, anillos: anillos(f.geometry, 0.012),
}));
const salida = { fuente: 'Eurostat GISCO, NUTS 2021, 1:10M. © EuroGeographics', paises, ccaa };
fs.mkdirSync(path.join(RAIZ, 'datos'), { recursive: true });
fs.writeFileSync(path.join(RAIZ, 'datos', 'mapas.json'), JSON.stringify(salida));
const kb = (fs.statSync(path.join(RAIZ, 'datos', 'mapas.json')).size / 1024).toFixed(0);
console.log(`datos/mapas.json: ${paises.length} países, ${ccaa.length} comunidades autónomas, ${kb} KB`);
