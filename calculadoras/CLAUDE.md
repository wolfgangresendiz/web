# Calculadoras de ingeniería

Proyecto `calculadoras` del sitio WR. Entorno de Claude Code: `WEB_PROYECTO=calculadoras`.

## Zona

- Este proyecto solo edita `calculadoras/`. Todo lo demás se puede leer, pero no se modifica desde aquí.
- Lo común (`../css/styles.css`, la portada `../index.html`) es de la zona general. Si algo de ahí no sirve, se sobrescribe en un CSS propio (`calculadoras/css/`) o se le pide el cambio al entorno general.
- Para que una calculadora nueva aparezca en la portada, pide al entorno general que agregue su tarjeta en `index.html`.

## Estructura

| Ruta | Qué es |
|---|---|
| `calculadoras/caudal.html` | Calculadora de caudal en tuberías: $Q = \frac{\pi}{4} d^2 v$, con gráfica $V$ vs $Q$. |
| `calculadoras/js/units.js` | Motor de unidades compartido por todas las calculadoras: magnitudes, conversiones a la base SI, barra de unidades y preferencias guardadas. |
| `calculadoras/js/caudal.js` | Declara entradas, magnitudes y cálculo de la calculadora de caudal. |
| `calculadoras/js/grafica-caudal.js` | Gráfica SVG interactiva con los límites de velocidad de referencia (IWA, CONAGUA). |

## Cómo se hace una calculadora

- Cada calculadora es un HTML en `calculadoras/` que carga, con `defer` y en este orden, `js/units.js`, sus scripts propios y su script principal.
- Todo se calcula en unidades base (SI). La calculadora solo declara sus entradas (`magnitud`, `positivo`) y su función de cálculo en `crearCalculadora`; el motor arma la barra de unidades y convierte.
- Una magnitud nueva se agrega en `MAGNITUDES` de `units.js` con su unidad base y factores.
- Las ecuaciones se escriben en LaTeX (`data-latex`) y las renderiza KaTeX (CDN con versión fija), con texto de respaldo.
- Los scripts son clásicos (IIFE y `window`), no módulos, para que la página funcione también abierta como archivo (`file://`).
- Al terminar, abre la página en el navegador (Playwright) y comprueba un cálculo conocido, p. ej. $d = 100\ \text{mm}$, $v = 1\ \text{m/s} \Rightarrow Q \approx 7.85\ \text{L/s}$.
