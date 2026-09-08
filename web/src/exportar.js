// Generacion de CSV a partir del resultado. Compartido: el script lo escribe a
// disco y el navegador lo ofrece como descarga.

const escapa = (v) => {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function aCsv(filas, columnas) {
  const cab = columnas.map((c) => escapa(c.titulo)).join(';');
  const cuerpo = filas.map((f) => columnas.map((c) => escapa(c.valor(f))).join(';'));
  // BOM para que Excel en espanol abra los acentos bien al hacer doble clic
  return '﻿' + [cab, ...cuerpo].join('\r\n') + '\r\n';
}

const dec = (n, d = 2) => (n ?? 0).toFixed(d).replace('.', ',');

export const TABLAS = {
  proyectos: (r) => aCsv(r.proyectos, [
    { titulo: 'id', valor: (p) => p.id },
    { titulo: 'programa', valor: (p) => p.programa },
    { titulo: 'referencia', valor: (p) => p.referencia || '' },
    { titulo: 'acronimo', valor: (p) => p.acronimo },
    { titulo: 'titulo', valor: (p) => p.titulo },
    { titulo: 'subprograma', valor: (p) => p.subprograma },
    { titulo: 'subprograma_nombre', valor: (p) => p.subprogramaTitulo },
    { titulo: 'familia', valor: (p) => p.familia },
    { titulo: 'tipo_accion', valor: (p) => p.esquema },
    { titulo: 'coordinador', valor: (p) => p.coordinadorNombre },
    { titulo: 'coordinador_pais', valor: (p) => p.coordinadorPais },
    { titulo: 'entidades_pais_foco', valor: (p) => (p.entidadesFocoNombres || []).join(' | ') },
    { titulo: 'estado', valor: (p) => p.estado },

    { titulo: 'inicio', valor: (p) => p.inicio },
    { titulo: 'fin', valor: (p) => p.fin },
    { titulo: 'anio_inicio', valor: (p) => p.anio },
    { titulo: 'aportacion_ue_eur', valor: (p) => dec(p.aportacionUE) },
    { titulo: 'coste_total_eur', valor: (p) => dec(p.costeTotal) },
    { titulo: 'url', valor: (p) => p.url || `https://cordis.europa.eu/project/id/${p.id}` },
  ]),

  participaciones: (r) => aCsv(r.participaciones, [
    { titulo: 'proyecto_id', valor: (p) => p.proyecto },
    { titulo: 'programa', valor: (p) => p.programa },
    { titulo: 'anio_inicio', valor: (p) => p.anio },
    { titulo: 'organizacion_id', valor: (p) => p.orgId },
    { titulo: 'nombre', valor: (p) => p.nombre },
    { titulo: 'siglas', valor: (p) => p.siglas },
    { titulo: 'pais', valor: (p) => p.pais },
    { titulo: 'pais_via', valor: (p) => p.via || 'cordis' },
    { titulo: 'tipo_entidad', valor: (p) => p.tipo },
    { titulo: 'rol', valor: (p) => p.rol },
    { titulo: 'aportacion_neta_eur', valor: (p) => dec(p.aportacionNeta) },
  ]),

  entidades: (r) => aCsv(r.entidadesFoco, [
    { titulo: 'organizacion_id', valor: (e) => e.orgId },
    { titulo: 'nombre', valor: (e) => e.nombre },
    { titulo: 'siglas', valor: (e) => e.siglas },
    { titulo: 'tipo_entidad', valor: (e) => e.tipo },
    { titulo: 'proyectos', valor: (e) => e.proyectos },
    { titulo: 'coordinados', valor: (e) => e.coordinados },
    { titulo: 'programas', valor: (e) => e.programas.join(' ') },
    { titulo: 'aportacion_neta_eur', valor: (e) => dec(e.aportacionNeta) },
  ]),

  paises: (r) => aCsv(r.paises, [
    { titulo: 'pais', valor: (p) => p.pais },
    { titulo: 'proyectos', valor: (p) => p.proyectos },
    { titulo: 'pct_sobre_total', valor: (p) => dec(p.pctSobreTotal, 1) },
    { titulo: 'coordinados', valor: (p) => p.coordinados },
    { titulo: 'pct_coordinados', valor: (p) => dec(p.pctCoordinados, 1) },
    { titulo: 'organizaciones', valor: (p) => p.organizaciones },
    { titulo: 'pct_organizaciones', valor: (p) => dec(p.pctOrganizaciones, 1) },
    { titulo: 'aportacion_neta_eur', valor: (p) => dec(p.aportacionNeta) },
    { titulo: 'pct_aportacion', valor: (p) => dec(p.pctAportacion, 1) },
  ]),

  serie: (r) => aCsv(r.serie, [
    { titulo: 'anio', valor: (s) => s.anio },
    { titulo: 'proyectos', valor: (s) => s.total },
    { titulo: 'proyectos_pais_foco', valor: (s) => s.foco },
    { titulo: 'aportacion_ue_eur', valor: (s) => dec(s.aportacionUE) },
    ...['HORIZON', 'H2020', 'FP7', 'FP6', 'LIFE'].map((p) => ({
      titulo: `proyectos_${p}`, valor: (s) => s.porPrograma[p] || 0,
    })),
  ]),

  subprogramas: (r) => aCsv(r.subprogramas, [
    { titulo: 'codigo', valor: (s) => s.clave },
    { titulo: 'nombre', valor: (s) => s.etiqueta },
    { titulo: 'proyectos', valor: (s) => s.proyectos },
    { titulo: 'proyectos_pais_foco', valor: (s) => s.foco },
    { titulo: 'pct_pais_foco', valor: (s) => dec(s.pctFoco, 1) },
    { titulo: 'aportacion_ue_eur', valor: (s) => dec(s.aportacionUE) },
  ]),
};

// ---------- convocatorias españolas ----------
// Una fila por ayuda, con la via por la que entra y como se ha resuelto la CCAA,
// para que cualquier cifra de la pestaña nacional se pueda auditar.
export const TABLAS_NACIONAL = {
  ayudas: (r) => aCsv(r.ayudas, [
    { titulo: 'id', valor: (a) => a.id },
    { titulo: 'financiador', valor: (a) => a.financiador },
    { titulo: 'convocatoria', valor: (a) => a.convocatoria },
    { titulo: 'anio', valor: (a) => a.anio ?? '' },
    { titulo: 'referencia', valor: (a) => a.referencia },
    { titulo: 'titulo', valor: (a) => a.titulo },
    { titulo: 'categoria', valor: (a) => a.categoria || '' },
    { titulo: 'entidad', valor: (a) => a.entidad },
    { titulo: 'cif', valor: (a) => a.cif || '' },
    { titulo: 'ccaa', valor: (a) => a.ccaa || '' },
    { titulo: 'ccaa_via', valor: (a) => a.ccaaVia || '' },
    { titulo: 'provincia', valor: (a) => a.provincia || '' },
    { titulo: 'localizacion', valor: (a) => a.localizacion || '' },
    { titulo: 'inicio', valor: (a) => a.inicio || '' },
    { titulo: 'fin', valor: (a) => a.fin || '' },
    { titulo: 'importe_concedido_eur', valor: (a) => dec(a.importe) },
    { titulo: 'presupuesto_total_eur', valor: (a) => dec(a.presupuesto) },
    { titulo: 'fondo', valor: (a) => a.fondo || '' },
    { titulo: 'via', valor: (a) => a.via },
    { titulo: 'url', valor: (a) => a.url || '' },
    { titulo: 'resumen', valor: (a) => a.resumen || '' },
  ]),

  'entidades-es': (r) => aCsv(r.entidades, [
    { titulo: 'entidad', valor: (e) => e.nombre },
    { titulo: 'cif', valor: (e) => e.cif || '' },
    { titulo: 'ccaa', valor: (e) => e.ccaa || '' },
    { titulo: 'ayudas', valor: (e) => e.ayudas },
    { titulo: 'financiadores', valor: (e) => e.financiadores.join(' ') },
    { titulo: 'desde', valor: (e) => e.desde ?? '' },
    { titulo: 'hasta', valor: (e) => e.hasta ?? '' },
    { titulo: 'importe_concedido_eur', valor: (e) => dec(e.importe) },
  ]),

  ccaa: (r) => aCsv(r.ccaa, [
    { titulo: 'ccaa', valor: (c) => c.etiqueta || 'Sin determinar' },
    { titulo: 'ayudas', valor: (c) => c.ayudas },
    { titulo: 'pct_ayudas', valor: (c) => dec(c.pctAyudas, 1) },
    { titulo: 'entidades', valor: (c) => c.entidades },
    { titulo: 'importe_concedido_eur', valor: (c) => dec(c.importe) },
    { titulo: 'pct_importe', valor: (c) => dec(c.pctImporte, 1) },
  ]),

  convocatorias: (r) => aCsv(r.convocatorias, [
    { titulo: 'financiador', valor: (c) => c.financiadores.join(' ') },
    { titulo: 'convocatoria', valor: (c) => c.etiqueta },
    { titulo: 'ayudas', valor: (c) => c.ayudas },
    { titulo: 'entidades', valor: (c) => c.entidades },
    { titulo: 'desde', valor: (c) => c.desde ?? '' },
    { titulo: 'hasta', valor: (c) => c.hasta ?? '' },
    { titulo: 'importe_concedido_eur', valor: (c) => dec(c.importe) },
  ]),

  'serie-es': (r) => aCsv(r.serie, [
    { titulo: 'anio', valor: (s) => s.anio },
    { titulo: 'ayudas', valor: (s) => s.total },
    { titulo: 'importe_concedido_eur', valor: (s) => dec(s.importe) },
    ...['AEI', 'FECYT', 'FB'].map((f) => ({ titulo: `ayudas_${f}`, valor: (s) => s.porFinanciador[f] || 0 })),
  ]),
};
