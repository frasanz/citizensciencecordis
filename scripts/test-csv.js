// Casos del parser CSV, incluidos los malformados que publica CORDIS.
import { createCsvParser } from '../web/src/csv.js';

const CASOS = [
  ['sin comillas',        'a;b\n1;2',                            [['a','b'],['1','2']]],
  ['citado',              '"a";"b"\n"1";"2"',                    [['a','b'],['1','2']]],
  ['comilla escapada',    '"x";"dice ""hola"" y"',               [['x','dice "hola" y']]],
  ['salto de linea dentro','"x";"a\nb"\n"y";"c"',                [['x','a\nb'],['y','c']]],
  ['delimitador dentro',  '"x";"a;b"',                           [['x','a;b']]],
  ['campo vacio',         '"a";"";"c"',                          [['a','','c']]],
  ['comillas finales',    '"a";"b ""cita"""',                    [['a','b "cita"']]],
  // CORDIS entrecomilla textos que ya llevaban comillas y no las escapa.
  ['CORDIS malformado',   '"300401";""Obes; modal."";"2012-10-01"\n"312902";"Socientize";"2012-10-01"',
                          [['300401','"Obes; modal."','2012-10-01'],['312902','Socientize','2012-10-01']]],
  ['malformado al final', '"1";""x""\n"2";"y"',                  [['1','"x"'],['2','y']]],
];

let fallos = 0;
for (const [nombre, entrada, esperado] of CASOS) {
  const filas = [];
  const p = createCsvParser({ onRow: (r) => filas.push(r) });
  p.push(entrada); p.end();
  const ok = JSON.stringify(filas) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`  ${ok ? 'ok  ' : 'FALLO'} ${nombre}`);
  if (!ok) { console.log('        esperado:', JSON.stringify(esperado)); console.log('        obtenido:', JSON.stringify(filas)); }
}

// El troceado no debe cambiar el resultado: el navegador alimenta por chunks.
for (const [nombre, entrada] of CASOS.map((c) => [c[0], c[1]])) {
  const uno = [], byte = [];
  { const p = createCsvParser({ onRow: (r) => uno.push(r) }); p.push(entrada); p.end(); }
  { const p = createCsvParser({ onRow: (r) => byte.push(r) }); for (const ch of entrada) p.push(ch); p.end(); }
  const ok = JSON.stringify(uno) === JSON.stringify(byte);
  if (!ok) { fallos++; console.log(`  FALLO troceo byte a byte difiere: ${nombre}`); }
}
console.log(fallos ? `\n${fallos} FALLOS` : '\ntodos los casos correctos (incluido el troceo byte a byte)');
process.exit(fallos ? 1 : 0);
