# Ciencia ciudadana en los programas marco europeos

Calcula, a partir de los datos abiertos de [CORDIS](https://cordis.europa.eu/datalab/browse.html),
los indicadores de participación en proyectos europeos de ciencia ciudadana, y los publica
como una web estática desde la que se pueden consultar y descargar en CSV.

Sustituye el proceso manual en Excel con el que se elaboraron las cifras del documento de
abril de 2026, que no eran reproducibles.

## Uso

```sh
npm install
node scripts/snapshot.js      # descarga CORDIS y regenera web/data/
node scripts/serve.js         # http://localhost:8000
npm test                      # parser + web + navegador real
```

Opciones de `snapshot.js`:

```sh
node scripts/snapshot.js --programas=HORIZON,H2020,FP7
node scripts/snapshot.js --frase="citizen science" --campos=objective,title,keywords
node scripts/snapshot.js --sin-cache      # ignora los ZIP ya descargados en .cache/
```

## Criterio de selección

Un proyecto entra si la expresión **`citizen science`** aparece en su **título o descripción**
(`objective`), tolerando guion y saltos de línea (`citizen-science`).

El criterio queda guardado en `meta.filtro` dentro de `web/data/indicadores.json`, de modo que
cualquier cifra publicada se puede auditar y volver a generar.

### Por qué las cifras no coinciden con las del documento de abril de 2026

Aquel documento citaba 228 proyectos «en Horizonte Europa». Ese número procede del buscador web
de CORDIS, que **no filtra por programa marco**: de sus 405 resultados actuales, 220 son de
Horizonte Europa y 185 de Horizonte 2020. Además indexa el texto de informes y entregables,
no solo la descripción del proyecto.

Como consecuencia, las cifras españolas del documento estaban infladas: Horizonte 2020 incluía
el programa SwafS (*Science with and for Society*), donde España tuvo una presencia muy alta.

Esta herramienta separa los programas de forma explícita y etiqueta cada proyecto, para que se
pueda decir con precisión qué pertenece a cada uno.

## Estructura

```
web/                 sitio estático (es la raíz publicada en GitHub Pages)
  index.html
  app.js             interfaz, filtros, gráfico y ayuda contextual
  src/               módulos compartidos con Node, sin build step
    compute.js       cálculo de indicadores
    csv.js           parser CSV incremental
    exportar.js      generación de CSV
  data/              resultados que genera snapshot.js
scripts/
  snapshot.js        descarga CORDIS y regenera web/data/
  cordis.js          descarga y lectura en streaming de los ZIP
  serve.js           servidor de desarrollo
  test-csv.js        casos del parser, incluidos los malformados de CORDIS
  smoke.js           la web sobre un DOM real (jsdom)
  responsive.js      la web en un navegador real, con capturas
vendor/fflate.js     descompresión de ZIP (solo lo usa Node)
```

`web/src/` es la misma copia que usan Node y el navegador: no hay compilación ni
duplicación. Todo lo que solo necesita Node vive fuera de `web/`, para que el sitio
publicado no cargue con ello.

## Cómo se actualizan los datos

La web **no descarga nada de CORDIS**: lee el `web/data/indicadores.json` ya calculado y
aplica los filtros en el navegador. Para traer datos nuevos hay que ejecutar el snapshot,
a mano o desde el workflow.

Los ZIP descargados quedan en `.cache/` junto a la fecha real del volcado en CORDIS
(cabecera `Last-Modified`), que es la que muestra la web. Esa fecha no es la de la
descarga: FP7, por ejemplo, está cerrado y CORDIS no lo toca desde enero de 2025.

## Comprobaciones

```sh
npm test              # los tres niveles
npm run test:csv      # parser: comillas, saltos de línea, filas malformadas
npm run test:web      # la web pinta y los filtros recalculan (jsdom)
npm run test:responsive   # anchos reales en Chromium + capturas en .capturas/
```

El nivel de navegador real es imprescindible: `jsdom` no calcula *layout*, así que no
detecta desbordes ni comprueba que un elemento quepa en pantalla.

## Actualización automática

`.github/workflows/actualizar.yml` recalcula los datos el día 8 de cada mes, los commitea si han
cambiado y despliega la web en GitHub Pages. También se puede lanzar a mano desde la pestaña
*Actions*.

La evolución temporal **no necesita histórico**: cada proyecto se cuenta en su año de inicio, así
que la serie completa se reconstruye desde una única descarga.

## Datos

CORDIS, Comisión Europea — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
