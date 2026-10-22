# Ciencia ciudadana en la financiación pública

### → **[frasanz.github.io/citizensciencecordis](https://frasanz.github.io/citizensciencecordis/)**

Calcula los indicadores de los proyectos de ciencia ciudadana financiados con dinero público y los
publica como una web estática desde la que se pueden consultar, filtrar y descargar en CSV. Tiene
dos pestañas, porque las dos mitades no comparten ni criterio ni unidad de medida:

- **Programas europeos**: FP7, Horizonte 2020 y Horizonte Europa, a partir de los datos abiertos de
  [CORDIS](https://cordis.europa.eu/datalab/browse.html), y LIFE, a partir de la
  [base de datos pública de CINEA](https://webgate.ec.europa.eu/life/publicWebsite/search).
  La unidad es el proyecto con todo su consorcio: se puede filtrar por programa, por país de
  referencia, por mes de inicio y por socio, y ver cuota, coordinaciones y dinero recibido por país.
  Además, como **programas complementarios** (desmarcados por defecto, fuera de las cifras de partida):
  Erasmus+ y Europa Creativa, de la [plataforma de resultados de proyectos](https://erasmus-plus.ec.europa.eu/projects),
  y los fondos de cohesión (FEDER, FSE+, Interreg) de [Kohesio](https://kohesio.ec.europa.eu).
- **Convocatorias españolas**: la [AEI](https://www.aei.gob.es/ayudas-concedidas/buscador-ayudas-concedidas),
  [FECYT](https://www.convocatoria.fecyt.es/Publico/Convocatoria/ConvocatoriasAnteriores.aspx) y la
  [Fundación Biodiversidad](https://fundacion-biodiversidad.es/buscador-de-proyectos/). La unidad es
  la ayuda a una entidad, sin consorcios: se filtra por financiador, comunidad autónoma, año, vía
  de entrada y entidad, y se ve el reparto por convocatoria, comunidad y entidad con el importe concedido.

Cada cifra lleva una explicación de dónde sale, y cada registro anota por qué vía ha entrado.

Sustituye el proceso manual en Excel con el que se elaboraron las cifras del documento de
abril de 2026, que no eran reproducibles.

## Uso

```sh
npm install
brew install poppler          # pdftotext y pdftohtml, para los listados en PDF de FECYT (apt: poppler-utils)
node scripts/snapshot.js      # descarga todas las fuentes y regenera web/data/
node scripts/serve.js         # http://localhost:8000
npm test                      # parser + web + navegador real
```

Opciones de `snapshot.js`:

```sh
node scripts/snapshot.js --programas=HORIZON,H2020,FP7,LIFE     # solo la parte europea
node scripts/snapshot.js --programas=AEI,FECYT,FB               # solo la española (no toca indicadores.json)
node scripts/snapshot.js --frase="citizen science" --campos=objective,title,keywords
node scripts/snapshot.js --sin-cache      # ignora lo ya descargado en .cache/
```

## Factsheet

`node scripts/factsheet.js --pdf` genera `web/factsheet.html` y `web/factsheet.pdf`: seis páginas A4,
«La ciencia ciudadana en España», con la identidad de Ibercivis (logo en `web/img/`). Lee los mismos
JSON que la web, así que las cifras no pueden diverger; en la parte española cuenta solo proyectos.
La comparación por habitante usa `datos/poblacion.csv` (población a 1 de enero, Eurostat `demo_pjan`),
que se refresca a mano con `node scripts/poblacion.js` (cambia una vez al año). Solo entran los países con
al menos 15 proyectos, y Reino Unido queda fuera porque Eurostat ya no publica su población.
El PDF necesita Playwright y Chromium (`npx playwright install chromium`); el HTML, solo Node.

## Criterio de selección

En los programas europeos, un proyecto entra si la expresión **`citizen science`** aparece en su
**título o descripción** (`objective`), tolerando guion y saltos de línea (`citizen-science`).

En las convocatorias españolas, una ayuda entra si **`ciencia ciudadana`** o `citizen science` (o
sus variantes en catalán, gallego y euskera) aparece en el **título o el resumen**. Hay dos vías más,
porque las fuentes no dan lo mismo: en FECYT entran también las ayudas concedidas en la **línea de
ciencia ciudadana** de su convocatoria, que existe desde 2018; y en la AEI y en FECYT, las que
declaran la frase entre sus **palabras clave**. Las de FECYT son los descriptores de la ficha de cada
proyecto y se comprueban; las de la AEI, su buscador las permite consultar pero no exportar. Cada
ayuda lleva anotada su vía (`via` en el CSV), y la web permite filtrar por ella.

El criterio queda guardado en `meta.filtro` dentro de `web/data/indicadores.json` y de
`web/data/nacional.json`, de modo que cualquier cifra publicada se puede auditar y volver a generar.

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

Lo que la API de LIFE no publica y CORDIS sí: el PIC de cada socio, su tipo de entidad, el reparto del
dinero por socio (que sale de otra fuente, ver abajo) y, en los proyectos posteriores a 2020, el país de los socios. El país se
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

## Erasmus+ y Europa Creativa

`scripts/erasmus.js` lee la API JSON de la plataforma de resultados de proyectos de la Comisión (la que
usa su buscador, sin autenticación ni documentación pública), con la frase entre comillas, y vuelve a
aplicar el criterio sobre el texto devuelto. Son **programas complementarios** (`complementario: true`
en `compute.js`): están en los datos y en el filtro de programa, pero fuera de las cifras de partida y
del factsheet. Solo dan un importe por proyecto, no por socio; los límites están escritos en la propia
web («Límites de estos datos») y en la página de metodología.

### El dinero por socio de LIFE

Sale del panel público *LIFE Project Portfolio* de CINEA (Qlik Sense), que da la contribución de la UE por
participante para las convocatorias desde 2014 (en las anteriores, todo al coordinador). Se guarda en
`datos/life-importes.csv` (proyecto; participante; importe_ue_eur; participaciones) y `snapshot.js` lo
cruza con las fichas por nombre. Lo que no se puede atribuir a un socio (filas sin PIC) no se reparte.
**No se regenera solo**; para actualizarlo, abrir la vista de tabla del panel
(`…/public/single/?appid=8298c020-48a6-4b84-91f4-f6f2665c0f99&obj=djMUAV&opt=ctxmenu,currsel&select=$::%25Dimension,Participant%20short%20name,PIC%20participant%20legal%20name,Project%20acronym,Project%20number,Project%20title&select=$::%25Measure,EU%20contribution,Number%20of%20participations,Number%20of%20projects`),
filtrar por `&select=Project%20acronym,<valores>` con los acrónimos de los proyectos (los recientes con el formato
`LIFE21-NAT-BE-LIFE HARWIN`; los antiguos con `<referencia>-<acrónimo>`) y exportar o copiar la tabla.

## Kohesio

`scripts/kohesio.js` lee la API JSON de la web de Kohesio (proyectos de la política de cohesión: FEDER, FSE+,
Interreg…): lista por la frase exacta y detalle de cada proyecto (beneficiarios, fondo, programa). Es un
programa **complementario**, como Erasmus+: fuera de las cifras de partida y del factsheet. No da el país de
cada beneficiario (solo el del proyecto), ni el socio principal, ni el reparto del dinero. Límites completos en
la web y en la metodología.

## Convocatorias españolas

Ninguno de los tres financiadores publica un volcado de datos. `scripts/nacional.js` orquesta lo
que hay:

| Fuente | De dónde sale | Qué da | Qué no da |
|---|---|---|---|
| **AEI** (`scripts/aei.js`) | El [buscador de ayudas concedidas](https://www.aei.gob.es/ayudas-concedidas/buscador-ayudas-concedidas) exporta a CSV con los mismos filtros que la web. Se consulta por título, resumen y palabras clave, con cada frase, y se unen los resultados por referencia. | Año, convocatoria, referencia, área, título, CIF y entidad, comunidad autónoma, provincia, importe y **resumen**. | Fechas de ejecución. Las palabras clave, que no se exportan. Incluye contratos y estancias, no solo proyectos: cada ayuda lleva su `tipo` (proyecto, contrato de personal, estancia) y se puede filtrar. |
| **FECYT** (`scripts/fecyt.js`) | Dos cosas. El [listado de concedidas](https://www.convocatoria.fecyt.es/Publico/Convocatoria/ConvocatoriasAnteriores.aspx) de cada año desde 2012, un PDF que se convierte con `pdftotext -bbox-layout` y cuyas tablas se reconstruyen por las coordenadas de cada palabra. Y la **ficha resumen** de cada proyecto, una página HTML a la que apunta el enlace «Ver resumen» de cada fila; los enlaces se sacan del PDF con `pdftohtml -xml` y sirven además de lista de referencias del año, que tiene que cuadrar con las filas leídas. | Del PDF: comunidad autónoma, presupuesto, solicitado, **importe concedido** y la categoría de la convocatoria con su nombre literal. De la ficha: referencia, título, entidad, su localidad y tipo, **resumen**, descriptores y fechas de ejecución. | CIF. Antes de 2012 no hay ficha, y no se leen esos años. |
| **Fundación Biodiversidad** (`scripts/biodiversidad.js`) | La API REST de su WordPress (sin autenticación) da todas las fichas de proyecto de sus programas; para las candidatas se baja la ficha HTML, donde están los datos. | Título, descripción y objetivos, línea de actuación, estado, años de ejecución, presupuesto, importe, entidad beneficiaria, localización y fondo (FEDER, FSE+, PRTR…). | CIF. El importe, en muchas fichas. La comunidad autónoma de la entidad. |

El servidor de la AEI sirve su certificado sin la CA intermedia de la FNMT; `vendor/fnmt-ac-componentes.pem`
la añade para que Node pueda verificarlo.

La **comunidad autónoma** es la de la sede de la entidad beneficiaria. AEI y FECYT la dan; para la
Fundación Biodiversidad se resuelve por una cadena de fuentes, anotada en la columna `ccaa_via`:

| Vía | Qué es |
|---|---|
| `fuente` | La da la propia fuente (AEI y FECYT). |
| `cruce` | Misma entidad, por nombre, en AEI o FECYT. |
| `localizacion` | La ficha de la Fundación Biodiversidad localiza el proyecto en una única comunidad. |
| `localidad` | La ficha de FECYT da la localidad de la entidad, y esta nombra una comunidad, provincia o ciudad. |
| `nombre` | El nombre de la entidad nombra la comunidad, una provincia o una ciudad, y solo una. |
| `manual` | `datos/ccaa-entidades.csv`, la única tabla que edita una persona. |
| `sin-ccaa` | No se ha podido determinar. Cuenta en el total, no en ninguna cifra por comunidad. |

Cada ejecución deja en `datos/ccaa-entidades-pendientes.csv` las entidades sin comunidad, para
copiarlas a `datos/ccaa-entidades.csv` con su comunidad y la fuente consultada.

Las entidades se identifican por CIF cuando la AEI lo da, y por nombre normalizado si no; una
ayuda sin CIF se engancha al CIF de otra con el mismo nombre. El año es el de la convocatoria en
AEI y FECYT y el de inicio de ejecución en la Fundación Biodiversidad.

Los fondos europeos que gestiona la Fundación Biodiversidad (FEDER, FSE, PRTR) se quedan en la
pestaña española: la línea entre pestañas es quién concede la ayuda, no de dónde sale el dinero.

## Estructura

```
web/                 sitio estático (es la raíz publicada en GitHub Pages)
  index.html         las dos pestañas
  app.js             pestaña europea: filtros, cifras, tablas y ayuda contextual
  espana.js          pestaña española: lo mismo sobre las ayudas nacionales
  comun.js           lo que comparten: formato, tablas, gráfico, buscador de entidad, ayuda
  pestanas.js        cambio de pestaña; la activa va en la URL (#europa, #espana)
  src/               módulos compartidos con Node, sin build step
    compute.js       cálculo de indicadores europeos
    nacional.js      cálculo de indicadores de las convocatorias españolas
    csv.js           parser CSV incremental
    exportar.js      generación de CSV
  data/              resultados que genera snapshot.js (indicadores.json, nacional.json y los CSV)
datos/
  life-paises.csv    países de socios de LIFE resueltos a mano
  life-paises-pendientes.csv   los que quedan sin país (lo regenera snapshot.js)
  ccaa-entidades.csv           comunidad autónoma de entidades resuelta a mano
  ccaa-entidades-pendientes.csv   las que quedan sin comunidad (lo regenera snapshot.js)
scripts/
  snapshot.js        descarga todas las fuentes y regenera web/data/
  cordis.js          descarga y lectura en streaming de los ZIP
  life.js            API de LIFE, fichas, FTS y cadena de países
  nacional.js        orquesta AEI, FECYT y Fundación Biodiversidad y la cadena de comunidades
  aei.js             CSV del buscador de la AEI (con la CA de la FNMT)
  fecyt.js           listados de concedidas de FECYT (PDF, por coordenadas) y fichas resumen (HTML)
  biodiversidad.js   API y fichas de la Fundación Biodiversidad
  factsheet.js       factsheet de 4 páginas (HTML y PDF) a partir de los JSON
  serve.js           servidor de desarrollo
  test-csv.js        casos del parser, incluidos los malformados de CORDIS
  smoke.js           la web sobre un DOM real (jsdom), las dos pestañas
  responsive.js      la web en un navegador real, con capturas de las dos pestañas
vendor/fflate.js     descompresión de ZIP (solo lo usa Node)
vendor/fnmt-ac-componentes.pem   CA intermedia que le falta al servidor de la AEI
```

`web/src/` es la misma copia que usan Node y el navegador: no hay compilación ni
duplicación. Todo lo que solo necesita Node vive fuera de `web/`, para que el sitio
publicado no cargue con ello.

## Cómo se actualizan los datos

La web **no descarga nada de ninguna fuente**: lee `web/data/indicadores.json` y
`web/data/nacional.json` ya calculados y aplica los filtros en el navegador. Para traer datos nuevos
hay que ejecutar el snapshot, a mano o desde el workflow, que instala poppler para los PDF de FECYT.
Las fichas de FECYT se guardan en `.cache/fecyt/fichas/` y solo se bajan las que faltan.

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
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Erasmus+, Europa Creativa y Kohesio (API internas de sus webs, sin
licencia de reutilización confirmada; se cita el origen). Buscador de ayudas concedidas de la AEI,
listados de concedidas y fichas resumen de FECYT y buscador de proyectos de la Fundación Biodiversidad: información pública de
cada organismo, reutilizada según la Ley 37/2007 y la Ley 19/2013 de transparencia. El código, MIT.

---

**[frasanz.github.io/citizensciencecordis](https://frasanz.github.io/citizensciencecordis/)**
