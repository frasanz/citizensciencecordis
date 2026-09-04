// Parser CSV incremental (RFC 4180 con delimitador configurable).
//
// CORDIS entrega ficheros de decenas de MB con campos citados que contienen
// saltos de linea y punto y coma dentro ("objective" son parrafos enteros), asi
// que no vale partir por lineas: hay que llevar el estado de las comillas entre
// trozo y trozo. Se alimenta por chunks para que el navegador pueda procesar el
// ZIP segun lo descomprime, sin materializar los 114 MB en memoria.

export function createCsvParser({ delimiter = ';', onRow }) {
  const special = new RegExp(`[${delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\r\\n]`, 'g');
  // Un campo citado solo puede terminar en separador, salto de linea o fin de fichero.
  const esFin = (c) => c === undefined || c === delimiter || c === '\n' || c === '\r';

  let parts = [];      // trozos del campo en curso
  let row = [];        // campos de la fila en curso
  let inQuotes = false;
  let pendingQuote = false;  // vimos una comilla dentro de comillas: aun no sabemos que es
  let pendingDouble = false; // vimos dos seguidas: hace falta el caracter siguiente
  let dirty = false;

  const endField = () => {
    row.push(parts.length === 1 ? parts[0] : parts.join(''));
    parts = [];
  };
  const endRow = () => {
    onRow(row);
    row = [];
    dirty = false;
  };

  return {
    push(str) {
      let i = 0;
      const n = str.length;
      while (i < n) {
        dirty = true;

        // Una comilla dentro de un campo citado solo cierra de verdad si detras
        // viene separador o fin de linea. CORDIS publica campos como
        //     ;""Obesity, ... modalities."";
        // (un texto entrecomillado al que no le escaparon las comillas). Sin
        // esta comprobacion el parser toma la segunda comilla por un cierre, se
        // desincroniza y se traga las filas siguientes: en FP7 se perdia el 44 %.
        if (pendingDouble) {
          pendingDouble = false;
          parts.push('"');                       // la primera comilla era contenido
          if (esFin(str[i])) inQuotes = false;   // la segunda cerraba de verdad
          continue;                              // el caracter se procesa fuera
        }
        if (pendingQuote) {
          pendingQuote = false;
          if (str[i] === '"') { pendingDouble = true; i++; }
          else if (esFin(str[i])) inQuotes = false;
          else parts.push('"');                  // comilla suelta: es contenido
          continue;
        }

        if (inQuotes) {
          const q = str.indexOf('"', i);
          if (q === -1) { parts.push(str.slice(i)); break; }
          if (q > i) parts.push(str.slice(i, q));
          i = q + 1;
          pendingQuote = true;
          continue;
        }

        special.lastIndex = i;
        const m = special.exec(str);
        if (!m) { parts.push(str.slice(i)); break; }
        if (m.index > i) parts.push(str.slice(i, m.index));
        i = m.index + 1;

        const c = m[0];
        if (c === '"') inQuotes = true;
        else if (c === delimiter) endField();
        else if (c === '\n') { endField(); endRow(); }
        // '\r' fuera de comillas se descarta (CRLF)
      }
    },

    end() {
      if (pendingDouble) { pendingDouble = false; parts.push('"'); }
      if (pendingQuote) { pendingQuote = false; }
      inQuotes = false;
      if (parts.length || row.length || dirty) { endField(); endRow(); }
    },
  };
}

// Envuelve el parser para entregar objetos usando la primera fila como cabecera.
// `columns` limita que campos se materializan: sobre organization.csv son 25
// columnas de las que usamos 9, y descartar el resto ahorra memoria y tiempo.
export function createRowParser({ delimiter = ';', columns = null, opcionales = [], onRecord }) {
  let idx = null;
  const opt = new Set(opcionales);

  return createCsvParser({
    delimiter,
    onRow(row) {
      if (!idx) {
        const header = row.map((h) => h.trim());
        idx = {};
        for (const name of columns ?? header) {
          const p = header.indexOf(name);
          if (p === -1) {
            // Los datasets no son homogeneos: FP7 no trae "keywords" y los mas
            // antiguos omiten otras columnas. Las opcionales se dan por vacias
            // en vez de abortar la lectura del fichero entero.
            if (opt.has(name)) continue;
            throw new Error(`Columna ausente en el CSV: ${name}`);
          }
          idx[name] = p;
        }
        return;
      }
      if (row.length === 1 && row[0] === '') return; // linea en blanco final
      const rec = {};
      for (const name in idx) rec[name] = row[idx[name]] ?? '';
      onRecord(rec);
    },
  });
}

// CORDIS usa coma decimal ("2073781,25").
export function parseNumber(v) {
  if (!v) return 0;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
