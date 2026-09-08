# Ciencia ciudadana en los programas marco europeos

### → **[frasanz.github.io/citizensciencecordis](https://frasanz.github.io/citizensciencecordis/)**

Calcula, a partir de los datos abiertos de [CORDIS](https://cordis.europa.eu/datalab/browse.html)
y de la [base de datos pública de LIFE](https://webgate.ec.europa.eu/life/publicWebsite/search),
los indicadores de participación en proyectos europeos de ciencia ciudadana, y los publica
como una web estática desde la que se pueden consultar, filtrar y descargar en CSV.

La web permite filtrar por programa marco, por país de referencia, por mes de inicio y por socio
(cualquier entidad participante, buscándola por nombre o siglas), ver la evolución año a año y
descargar cualquier tabla. Cada cifra lleva una explicación de dónde sale.

Sustituye el proceso manual en Excel con el que se elaboraron las cifras del documento de
abril de 2026, que no eran reproducibles.

## Uso

```sh
npm install
node scripts/snapshot.js      # descarga CORDIS y LIFE y regenera web/data/
node scripts/serve.js         # http://localhost:8000
npm test                      # parser + web + navegador real
```

Opciones de `snapshot.js`:

```sh
node scripts/snapshot.js --programas=HORIZON,H2020,FP7,LIFE
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

## LIFE

LIFE, el programa de medio ambiente y clima, no está en CORDIS. `scripts/life.js` lo lee de la
API REST de la base de datos pública de CINEA (la misma que usa su web, sin autenticación): el
volcado completo de proyectos desde 1992 y, para los candidatos que devuelve su buscador, la
ficha HTML de cada uno, que es donde vive la descripción. El criterio se aplica sobre el título y
la descripción (*Background* y *Objectives*), igual que en CORDIS. La mención en *Results* no
cuenta: se redacta al terminar el proyecto, no al firmarlo.

Lo que LIFE no publica y CORDIS sí: el PIC de cada socio, su tipo de entidad, el reparto del
dinero por socio y, en los proyectos posteriores a 2020, el país de los socios. El país se
resuelve por una cadena de fuentes, y cada participación lleva anotada la vía en la columna
`pais_via` del CSV:

| Vía | Qué es |
|---|---|
| `ficha` | La ficha de LIFE lo trae: socios de proyectos hasta 2020 y coordinadores. |
| `cordis` | Mismo nombre legal en `organization.csv` de CORDIS. Da también el PIC. |
| `fts` / `fts-aprox` | Beneficiario de la misma subvención en el [Sistema de Transparencia Financiera](https://ec.europa.eu/budget/financial-transparency-system/), por nombre exacto o por palabras compartidas. Solo desde 2025, que es cuando el FTS rellena el número de proyecto. |
| `forma-juridica` | Forma jurídica o gentilicio del nombre, solo cuando apunta a un único país. |
| `manual` | `datos/life-paises.csv`, la única tabla que edita una persona. |
| `sin-pais` | No se ha podido determinar. Cuenta en el total, no en ninguna cifra por país. |

Cada ejecución deja en `datos/life-paises-pendientes.csv` los nombres que quedan sin país, para
copiarlos a `datos/life-paises.csv` con su código de país y la fuente consultada.

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
datos/
  life-paises.csv    países de socios de LIFE resueltos a mano
  life-paises-pendientes.csv   los que quedan sin país (lo regenera snapshot.js)
scripts/
  snapshot.js        descarga CORDIS y LIFE y regenera web/data/
  cordis.js          descarga y lectura en streaming de los ZIP
  life.js            API de LIFE, fichas, FTS y cadena de países
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

La web **no descarga nada de CORDIS ni de LIFE**: lee el `web/data/indicadores.json` ya calculado y
aplica los filtros en el navegador. Para traer datos nuevos hay que ejecutar el snapshot,
a mano o desde el workflow.

Los ZIP descargados quedan en `.cache/` junto a la fecha real del volcado en CORDIS
(cabecera `Last-Modified`), que es la que muestra la web. Esa fecha no es la de la
descarga: FP7, por ejemplo, está cerrado y CORDIS no lo toca desde enero de 2025.
LIFE no da fecha de volcado, así que para él se muestra la de descarga. Sus fichas se
guardan en `.cache/life/fichas/` y solo se bajan las nuevas.

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

CORDIS y base de datos pública de LIFE (CINEA), Comisión Europea —
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). El código, MIT.

---

**[frasanz.github.io/citizensciencecordis](https://frasanz.github.io/citizensciencecordis/)**
