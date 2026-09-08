// Dos pestañas: programas europeos (app.js) y convocatorias españolas
// (espana.js). La activa va en la URL (#europa, #espana) para poder enlazarla.
// La española se inicializa la primera vez que se abre: asi la europea, que es
// la portada, no espera a un JSON que quiza no se mire.
import { init as initEspana } from './espana.js';

const VISTAS = { europa: '#vista-europa', espana: '#vista-espana' };
let espanaLista = false;

export function activar(clave, { empujar = true } = {}) {
  if (!VISTAS[clave]) clave = 'europa';
  for (const [k, sel] of Object.entries(VISTAS)) {
    document.querySelector(sel).hidden = k !== clave;
    const b = document.querySelector(`#pestana-${k}`);
    b.setAttribute('aria-selected', String(k === clave));
    b.tabIndex = k === clave ? 0 : -1;
  }
  document.body.dataset.pestana = clave;
  if (empujar && window.location.hash !== `#${clave}`) window.history.replaceState(null, '', `#${clave}`);
  if (clave === 'espana' && !espanaLista) { espanaLista = true; initEspana(); }
  // El grafico de la pestaña recien mostrada se dibujo con ancho 0 si estaba oculta.
  window.dispatchEvent(new Event('resize'));
}

export function instalarPestanas() {
  const nav = document.querySelector('.pestanas');
  nav.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-pestana]');
    if (b) activar(b.dataset.pestana);
  });
  nav.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const claves = Object.keys(VISTAS);
    const i = claves.indexOf(document.body.dataset.pestana || 'europa');
    const sig = claves[(i + (ev.key === 'ArrowRight' ? 1 : claves.length - 1)) % claves.length];
    activar(sig);
    document.querySelector(`#pestana-${sig}`).focus();
  });
  window.addEventListener('hashchange', () => activar(window.location.hash.slice(1), { empujar: false }));
  activar(window.location.hash.slice(1) || 'europa', { empujar: false });
}
