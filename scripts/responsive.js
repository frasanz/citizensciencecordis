// Comprueba el diseno en anchos reales con un navegador de verdad.
// jsdom no calcula layout, asi que esto es lo unico que prueba que algo "cabe".
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, '.capturas');
const URL_BASE = process.env.URL_BASE || 'http://localhost:8000/';

const PANTALLAS = [
  { nombre: 'movil-360',     ancho: 360,  alto: 760 },
  { nombre: 'movil-390',     ancho: 390,  alto: 844 },
  { nombre: 'tablet-768',    ancho: 768,  alto: 1024 },
  { nombre: 'portatil-1280', ancho: 1280, alto: 800 },
];

fs.mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
let fallos = 0;

for (const p of PANTALLAS) {
  const ctx = await navegador.newContext({ viewport: { width: p.ancho, height: p.alto },
    deviceScaleFactor: 2, locale: "es-ES", timezoneId: "Europe/Madrid" });
  const pag = await ctx.newPage();
  const errores = [];
  pag.on('pageerror', (e) => errores.push(e.message));
  await pag.goto(URL_BASE, { waitUntil: 'networkidle' });
  await pag.waitForSelector('#p-proyectos tbody tr');

  const r = await pag.evaluate(() => {
    const de = document.documentElement;
    // Elementos que se salen del ancho de la ventana: eso es lo que rompe el movil.
    const desbordan = [];
    for (const n of document.querySelectorAll('body *')) {
      const c = n.getBoundingClientRect();
      if (c.width === 0) continue;
      if (c.right > de.clientWidth + 1 || c.left < -1) {
        // Se permite si el elemento o algun ancestro tiene scroll horizontal propio.
        // Se sube hasta body: desde un <span> dentro de una celda hay muchos
        // niveles hasta el contenedor con scroll, y quedarse corto da falsos positivos.
        let a = n, permitido = false;
        for (; a && a !== document.body; a = a.parentElement) {
          const o = getComputedStyle(a).overflowX;
          if (o === 'auto' || o === 'scroll') { permitido = true; break; }
        }
        if (!permitido) desbordan.push(`${n.tagName.toLowerCase()}.${n.className || '·'}`.slice(0, 54));
      }
    }
    return {
      scrollH: de.scrollWidth > de.clientWidth,
      ancho: de.clientWidth,
      desbordan: [...new Set(desbordan)].slice(0, 6),
      cifras: getComputedStyle(document.querySelector('.cifras')).gridTemplateColumns.split(' ').length,
      grafico: document.querySelector('#grafico svg')?.getAttribute('width'),
      colsProy: [...document.querySelectorAll('#p-proyectos thead th')]
        .filter((t) => getComputedStyle(t).display !== 'none').length,
    };
  });

  // El globo de ayuda debe abrirse y quedar entero dentro de la ventana.
  const ayuda = await pag.evaluate(() => {
    const botones = [...document.querySelectorAll('button.ayuda')];
    const mal = [];
    for (const b of botones) {
      b.click();
      const g = document.querySelector('.globo');
      if (!g) { mal.push(`${b.dataset.ayuda}: no abre`); continue; }
      const c = g.getBoundingClientRect();
      if (c.left < -1 || c.top < -1 || c.right > innerWidth + 1 || c.bottom > innerHeight + 1)
        mal.push(`${b.dataset.ayuda} en ${Math.round(c.left)},${Math.round(c.top)} (${Math.round(c.width)}x${Math.round(c.height)})`);
      b.click();
    }
    return { total: botones.length, mal };
  });

  await pag.screenshot({ path: path.join(SALIDA, `${p.nombre}.png`), fullPage: true });
  // Una captura con la ayuda abierta, para revisarla de un vistazo.
  await pag.click('button.ayuda[data-ayuda=entidades]');
  await pag.screenshot({ path: path.join(SALIDA, `${p.nombre}-ayuda.png`) });
  await pag.click('button.ayuda[data-ayuda=entidades]');

  // La pestaña española, con la misma comprobacion de desbordes y un detalle abierto.
  await pag.click('#pestana-espana');
  await pag.waitForSelector('#p-ayudas tbody tr');
  await pag.click('#p-ayudas .desplegar');
  const es = await pag.evaluate(() => {
    const de = document.documentElement;
    const desbordan = [];
    for (const n of document.querySelectorAll('#vista-espana *')) {
      const c = n.getBoundingClientRect();
      if (c.width === 0) continue;
      if (c.right > de.clientWidth + 1 || c.left < -1) {
        let a = n, permitido = false;
        for (; a && a !== document.body; a = a.parentElement) {
          const o = getComputedStyle(a).overflowX;
          if (o === 'auto' || o === 'scroll') { permitido = true; break; }
        }
        if (!permitido) desbordan.push(`${n.tagName.toLowerCase()}.${n.className || '·'}`.slice(0, 54));
      }
    }
    // Al pulsar el desplegable la pagina ha bajado; los globos se miden con cada
    // boton a la vista, que es la unica situacion en la que alguien puede pulsarlo.
    const botones = [...document.querySelectorAll('#vista-espana button.ayuda')];
    const mal = [];
    for (const b of botones) {
      b.scrollIntoView({ block: 'center' });
      b.click();
      const g = document.querySelector('.globo');
      if (!g) { mal.push(`${b.dataset.ayuda}: no abre`); continue; }
      const c = g.getBoundingClientRect();
      if (c.left < -1 || c.top < -1 || c.right > innerWidth + 1 || c.bottom > innerHeight + 1)
        mal.push(`${b.dataset.ayuda} en ${Math.round(c.left)},${Math.round(c.top)}`);
      b.click();
    }
    return { scrollH: de.scrollWidth > de.clientWidth, desbordan: [...new Set(desbordan)].slice(0, 6), ayudas: botones.length, mal,
      grafico: document.querySelector('#grafico-es svg')?.getAttribute('width') };
  });
  await pag.screenshot({ path: path.join(SALIDA, `${p.nombre}-espana.png`), fullPage: true });

  const ok = !r.scrollH && !r.desbordan.length && !errores.length && !ayuda.mal.length && !es.scrollH && !es.desbordan.length && !es.mal.length;
  if (!ok) fallos++;
  console.log(`${ok ? 'ok   ' : 'FALLO'} ${p.nombre.padEnd(14)} ancho=${String(r.ancho).padStart(4)}`
    + ` · scroll horiz: ${r.scrollH ? 'SI' : 'no'} · cifras/fila: ${r.cifras}`
    + ` · grafico: ${r.grafico}px · cols proy: ${r.colsProy} · ayudas: ${ayuda.total}`
    + ` · España: grafico ${es.grafico}px, ayudas ${es.ayudas}, scroll horiz ${es.scrollH ? 'SI' : 'no'}`);
  if (r.desbordan.length) console.log(`      desbordan: ${r.desbordan.join(', ')}`);
  if (es.desbordan.length) console.log(`      desbordan (España): ${es.desbordan.join(', ')}`);
  if (ayuda.mal.length) console.log(`      ayuda fuera de pantalla: ${ayuda.mal.slice(0, 3).join(' | ')}`);
  if (es.mal.length) console.log(`      ayuda fuera de pantalla (España): ${es.mal.slice(0, 3).join(' | ')}`);
  if (errores.length) console.log(`      errores JS: ${errores.join(' | ')}`);
  await ctx.close();
}
await navegador.close();
console.log(fallos ? `\n${fallos} pantallas con problemas · capturas en .capturas/` : '\ntodas las pantallas correctas · capturas en .capturas/');
process.exit(fallos ? 1 : 0);
