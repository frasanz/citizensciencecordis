// Lo que comparten las dos pestañas (programas europeos y convocatorias
// españolas): formato, tablas, ayuda contextual, grafico de barras, buscador
// de entidad y descargas. Sin estado propio: cada pestaña guarda el suyo.

// ---------- formato ----------
export const nf = new Intl.NumberFormat('es-ES');
export const n1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const num = (v) => nf.format(Math.round(v ?? 0));
export const pc = (v) => `${n1.format(v ?? 0)} %`;
export const millones = (v) => `${n1.format((v ?? 0) / 1e6)} M€`;
export const euros = (v) => (v ? `${nf.format(Math.round(v))} €` : '—');
// "2022-09-01" -> "09/2022"
export const mesAnio = (f) => (f && f.length >= 7 ? `${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');
export const el = (sel) => document.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Texto sin acentos ni mayusculas, para que "malaga" encuentre "MÁLAGA".
export const normaliza = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function fecha(v) {
  const d = new Date(v);
  return isNaN(d) ? String(v ?? '') : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const tile = (n, et, sub, foco, clave) =>
  `<div class="cifra${foco ? ' foco' : ''}"><div class="n">${n}</div>`
  + `<div class="et">${et}${clave ? boton(clave) : ''}</div><div class="sub">${sub}</div></div>`;

// ---------- ayuda contextual ----------
// Cada cifra, grafico y tabla lleva un "?" que explica de donde sale el dato.
// Cada pestaña registra sus textos; el globo es el mismo para todas.
const AYUDA = {};
export const registrarAyuda = (textos) => Object.assign(AYUDA, textos);

export const boton = (clave) => `<button class="ayuda" type="button" data-ayuda="${clave}"
  aria-expanded="false" aria-label="Qué significa: ${esc(AYUDA[clave]?.[0] ?? clave)}">?</button>`;

let globo = null;
export function cerrarAyuda() {
  globo?.remove();
  globo = null;
  document.querySelectorAll('.ayuda[aria-expanded=true]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

let ayudaInstalada = false;
export function instalarAyuda() {
  if (ayudaInstalada) return;
  ayudaInstalada = true;
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ayuda]');
    if (!b) { if (!ev.target.closest('.globo')) cerrarAyuda(); return; }
    const abierto = b.getAttribute('aria-expanded') === 'true';
    cerrarAyuda();
    if (abierto) return;

    const [titulo, ...parrafos] = AYUDA[b.dataset.ayuda] ?? ['', ''];
    globo = document.createElement('div');
    globo.className = 'globo';
    globo.setAttribute('role', 'dialog');
    globo.innerHTML = `<h4>${esc(titulo)}</h4>${parrafos.map((p) => `<p>${p}</p>`).join('')}`;
    document.body.appendChild(globo);

    // Se ancla bajo el boton y se mete dentro de la ventana; si abajo no cabe, arriba.
    const r = b.getBoundingClientRect();
    const g = globo.getBoundingClientRect();
    const margen = 10;
    const { innerWidth: vw, innerHeight: vh } = window;
    const x = Math.min(Math.max(margen, r.left + r.width / 2 - g.width / 2), vw - g.width - margen);
    const y = r.bottom + 7 + g.height > vh - margen && r.top - 7 - g.height > margen
      ? r.top - 7 - g.height
      : r.bottom + 7;
    globo.style.left = `${Math.round(x)}px`;
    globo.style.top = `${Math.round(Math.max(margen, Math.min(y, vh - g.height - margen)))}px`;
    b.setAttribute('aria-expanded', 'true');
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrarAyuda(); });
  window.addEventListener('resize', cerrarAyuda, { passive: true });
  window.addEventListener('scroll', cerrarAyuda, { passive: true });
}

// ---------- tablas ----------
export function tabla(sel, titulo, nota, csv, cabeceras, filas, mapa, clave, alDescargar) {
  el(sel).innerHTML = `
    <div class="cabecera-tabla"><div><h2>${titulo}${clave ? boton(clave) : ''}</h2><p class="nota">${nota}</p></div>
      <button data-csv="${csv}">CSV</button></div>
    <div class="tabla-scroll"><table><thead><tr>${cabeceras.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${filas.map((f) => `<tr>${mapa(f).map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  el(sel).querySelector('[data-csv]').addEventListener('click', () => alDescargar(csv));
}

// ---------- grafico de barras apiladas por año ----------
// `serie` es [{anio, total, <campo>: {clave: n}}]; `claves` fija el orden de
// apilado y `color`/`etiqueta` dan el color y el nombre de cada clave.
export function grafico(cont, leyendaEl, serie, { claves, color, etiqueta, campo, titulo = 'Proyectos por año' }) {
  if (!serie.length) { cont.innerHTML = ''; leyendaEl.innerHTML = ''; return; }

  // Se trabaja en pixeles reales (1 unidad de viewBox = 1 px) para poder decidir
  // segun el ancho de verdad cuantas etiquetas de año caben.
  const dispo = Math.max(cont.clientWidth || 0, 280);
  const ml = 30, mb = 24;
  const MIN_ANIO = 22;                                   // ancho minimo por barra
  const W = Math.max(dispo, ml + serie.length * MIN_ANIO);
  const H = dispo < 520 ? 165 : 210;
  const paso = (W - ml) / serie.length;
  const max = Math.max(...serie.map((s) => s.total)) || 1;
  const y = (v) => (H - mb) * (1 - v / max);
  const cadaN = paso >= 38 ? 1 : paso >= 24 ? 2 : 3;
  const conCifra = paso >= 26;

  const barras = serie.map((s, i) => {
    const x = ml + i * paso + paso * 0.15;
    const w = paso * 0.7;
    let acc = 0;
    const trozos = claves.map((c) => {
      const v = s[campo][c] || 0;
      if (!v) return '';
      const y0 = y(acc + v), y1 = y(acc);
      acc += v;
      return `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${(y1 - y0).toFixed(1)}"
               fill="${color(c)}" rx="1.5"><title>${s.anio} · ${esc(etiqueta(c))}: ${v}</title></rect>`;
    }).join('');
    const et = i % cadaN === 0 || i === serie.length - 1 ? s.anio : '';
    return trozos
      + (conCifra ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y(s.total) - 4).toFixed(1)}" text-anchor="middle"
          font-size="10.5" fill="currentColor" opacity=".72">${s.total}</text>` : '')
      + `<text x="${(x + w / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle"
          font-size="10.5" fill="currentColor" opacity=".55">${et}</text>`;
  }).join('');

  const guias = [0, 0.5, 1].map((f) => {
    const v = Math.round(max * f);
    return `<line x1="${ml}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" opacity=".12"/>
            <text x="${ml - 6}" y="${y(v) + 3.5}" text-anchor="end" font-size="10.5" fill="currentColor" opacity=".55">${v}</text>`;
  }).join('');

  cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
    role="img" aria-label="${esc(titulo)}">${guias}${barras}</svg>`;
  leyendaEl.innerHTML = claves.map((c) =>
    `<span><i style="background:${color(c)}"></i>${esc(etiqueta(c))}</span>`).join('');
}

// ---------- buscador de entidad ----------
// Caja con sugerencias y teclado; con una entidad elegida se muestra como chip
// con su aspa. `sugerir(texto)` devuelve las opciones; `opcion(e)` y `chip(e)`
// pintan cada una. Los ids salen de `idBase` para que cada pestaña tenga el suyo.
export function buscadorEntidad({ cont, idBase, elegida, chip, sugerir, opcion, alElegir, alQuitar, placeholder }) {
  if (elegida) {
    cont.innerHTML = `<span class="chip on socio-elegido" title="${esc(elegida.nombre)}">${chip(elegida)}
        <button type="button" id="${idBase}-quitar" aria-label="Quitar" title="Quitar">×</button></span>`;
    el(`#${idBase}-quitar`).addEventListener('click', () => { alQuitar(); el(`#${idBase}`)?.focus(); });
    return;
  }
  cont.innerHTML = `<input type="search" id="${idBase}" placeholder="${esc(placeholder)}"
      autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false"
      aria-autocomplete="list" aria-controls="${idBase}-lista">
    <ul id="${idBase}-lista" class="sugerencias" role="listbox" hidden></ul>`;
  const caja = el(`#${idBase}`), lista = el(`#${idBase}-lista`);
  let activa = -1, opciones = [];

  const cerrar = () => { lista.hidden = true; lista.innerHTML = ''; opciones = []; activa = -1; caja.setAttribute('aria-expanded', 'false'); };
  const marcar = (i) => {
    activa = i;
    [...lista.children].forEach((li, k) => li.classList.toggle('activa', k === i));
  };
  const mostrar = () => {
    opciones = sugerir(caja.value);
    if (!opciones.length) {
      if (caja.value.trim()) { lista.innerHTML = '<li class="nada">Ninguna entidad coincide</li>'; lista.hidden = false; }
      else cerrar();
      return;
    }
    lista.innerHTML = opciones.map((e, i) => `<li role="option" data-i="${i}" title="${esc(e.nombre)}">${opcion(e)}</li>`).join('');
    lista.hidden = false;
    caja.setAttribute('aria-expanded', 'true');
    marcar(0);
  };
  caja.addEventListener('input', mostrar);
  caja.addEventListener('focus', () => { if (caja.value.trim()) mostrar(); });
  caja.addEventListener('keydown', (ev) => {
    if (lista.hidden || !opciones.length) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); marcar((activa + 1) % opciones.length); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); marcar((activa - 1 + opciones.length) % opciones.length); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (activa >= 0) alElegir(opciones[activa]); }
    else if (ev.key === 'Escape') cerrar();
  });
  // mousedown y no click: el blur de la caja cerraria la lista antes del click.
  lista.addEventListener('mousedown', (ev) => {
    const li = ev.target.closest('[data-i]');
    if (!li) return;
    ev.preventDefault();
    alElegir(opciones[+li.dataset.i]);
  });
  caja.addEventListener('blur', () => setTimeout(cerrar, 120));
}

// ---------- descargas ----------
export function descargarCsv(csv, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `ciencia-ciudadana-${nombre}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Vuelve a dibujar un grafico cuando cambia el ancho (girar el movil, redimensionar).
export function alRedimensionar(fn) {
  let t = null;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(fn, 150); });
}
