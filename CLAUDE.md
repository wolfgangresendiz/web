# CLAUDE.md

Sitio personal **WR** (GitHub Pages, se publica desde `main`): calculadoras de ingeniería y el **catálogo de cotizaciones de agua potable** en `/catalogo/` (https://wolfgangresendiz.github.io/web/catalogo/).

Preferencias del dueño: responder en español; no usar el guion largo (U+2014) en textos, interfaz ni mensajes; notación formal cuando aporte.

## Lo primero: el repositorio es PÚBLICO

- Los datos del catálogo solo se publican **cifrados** (`catalogo/datos/catalogo.enc`). La copia en claro vive en `.catalogo/` (en `.gitignore`). Jamás la agregues al repo ni la copies a otra ruta versionada.
- Mensajes de commit, títulos y cuerpos de PR y comentarios en GitHub **sin** nombres de proveedores, productos, precios ni contactos: usa el mensaje que sugiere `cerrar` (solo identificadores y conteos, p. ej. `Catálogo: +1 cotización, +3 productos`).
- Nunca pidas contraseñas ni llaves en el chat, ni imprimas `.catalogo/llavero.txt` o las variables `CATALOGO_*`.

## Cómo está armado el catálogo

| Ruta | Qué es |
|---|---|
| `catalogo/index.html`, `css/`, `js/` | Web estática (módulos ES, sin build). Descifra la bóveda en el navegador tras el inicio de sesión. |
| `catalogo/js/boveda.js` | Cifrado: AES-256-GCM sobre gzip(JSON); DEK envuelta por usuario con PBKDF2-SHA256 (600 000 iteraciones). Corre igual en Node. |
| `catalogo/js/modelo.js` | Índices, normalización de precios, resúmenes, historial. |
| `catalogo/js/buscar.js`, `grafica.js`, `vistas/*.js` | Búsqueda, gráfica de historial y pantallas. |
| `catalogo/datos/acceso.json` | Público: por usuario, la DEK envuelta con su contraseña; por administrador, el llavero sellado. |
| `herramientas/catalogo.mjs` | CLI de gestión (`npm run catalogo -- ayuda`). |
| `herramientas/semilla/taxonomia.json` | Taxonomía inicial (solo para `iniciar` y el demo). |
| `herramientas/demo/datos.json` | Datos ficticios para probar la interfaz. |
| `.catalogo/fuente/` | Copia de trabajo en claro: un JSON por registro. |

Credenciales: la CLI abre la bóveda con `CATALOGO_USUARIO` y `CATALOGO_CONTRASENA` (variables del entorno de Claude Code, cuenta de administrador). Si faltan, `abrir` lo dice: pide al usuario que las configure en el entorno (menú del entorno en la barra de título → Editar) y que abra una sesión nueva. No hay otra forma válida de obtenerlas.

## Sesión de trabajo

```bash
npm run catalogo -- abrir          # descifra en .catalogo/fuente/
# ... editar JSON ...
npm run catalogo -- cerrar         # valida, anota en la bitácora y vuelve a cifrar
npm run catalogo -- estado         # qué cambió respecto a la bóveda
git add catalogo/datos && git commit -m "Catálogo: <resumen sugerido por cerrar>"
```

Consultas útiles: `arbol --atributos`, `buscar "<texto>"`, `producto P-0001`, `siguiente producto|cotizacion|ficha [n]`, `archivo C-0001|FT-0001`, `verificar`.

Los cambios se ven en la web cuando llegan a `main`. Sigue las instrucciones de rama de la sesión; si `cerrar` falló a medio camino, `git checkout catalogo/datos/` restaura la última versión buena.

## Flujo principal: «procesa la bandeja»

El usuario guarda los PDF en Drive, carpeta **Catálogo de cotizaciones · Agua potable / 00 Bandeja de entrada** (IDs de carpetas en `.catalogo/fuente/config.json` → `drive`). Si adjunta un PDF en el chat, igual pídele que lo deje en la bandeja: el catálogo siempre enlaza el archivo de Drive.

1. `abrir`. Lista la bandeja con `search_files` (`parentId = '<drive.bandeja>'`) y lee cada PDF con `read_file_content`.
2. Decide si es **cotización** o **ficha técnica**. Si no está claro, pregunta.
3. **Cotización**
   1. Proveedor: `buscar "<nombre>"`. Si no existe, crea `proveedores/<slug>.json` con razón social, RFC, ciudad, teléfono, correo, sitio y `contactos` (`id` en slug). El contacto que firma va en `cotizacion.contacto`.
   2. Por cada partida, busca el producto equivalente (`buscar`, `producto P-…`) y aplica las reglas de agrupación de abajo. Producto nuevo: id con `siguiente producto`, familia final (hoja) correcta y los mismos nombres de atributo que ya usa esa familia (`arbol --atributos`).
   3. Crea `cotizaciones/C-xxxx.json` (id con `siguiente cotizacion`) siguiendo el esquema de abajo.
   4. Drive: `archivo C-xxxx` da el nombre, la carpeta y la descripción. Con `update_file` cambia `title`, `parentId` (carpeta del año en `01 Cotizaciones`; si no existe, créala y anótala en `config.drive.cotizaciones_por_anio`) y `description`. Guarda `archivo: { drive_id, nombre }`.
4. **Ficha técnica** (siempre de un producto específico)
   1. Identifica el producto; si no existe, créalo. Si la ficha cubre varios productos del catálogo, una ficha por producto con el mismo `drive_id`.
   2. `fichas/FT-xxxx.json` con los datos clave: `{ parametro, valor (con unidades), pagina }`. Los datos son un resumen; el PDF es la fuente.
   3. Drive: carpeta `02 Fichas técnicas/<Fabricante>` (créala si falta y anótala en `config.drive.fichas_por_fabricante`); nombre y descripción con `archivo FT-xxxx`.
5. `cerrar`. Corrige todos los errores; revisa los avisos (equivalencias, tipo de cambio fuera de rango, atributos escritos distinto).
6. Revisa `producto P-…` de lo que cambió: precios normalizados razonables, agrupación correcta.
7. Commit y push de `catalogo/datos/` con el mensaje sugerido. La bandeja debe quedar vacía.
8. Reporta al usuario: qué se cargó (con enlaces `…/catalogo/#/cotizacion/C-xxxx`), qué se agrupó con productos existentes, diferencias detectadas, tipo de cambio usado y cualquier duda pendiente.

### Reglas de agrupación

- Un **producto** es una especificación funcional, no una marca. Es el mismo si coinciden los atributos que definen su familia: tipo, medida, clase o presión, material, extremos o conexión y norma.
- Marca o modelo distintos: mismo producto. Se registran en la partida (`marca`, `modelo`) y la web los muestra como diferencia.
- Diferencias menores (recubrimiento, accesorios o tornillería incluidos, presentación, garantía): mismo producto y se anotan en `diferencias` de la partida.
- Diferencias que cambian la especificación (otro diámetro, presión, norma o material): producto distinto.
- Servicios: mismo producto si el alcance es equivalente; las diferencias de alcance van en `diferencias`.
- Ante la duda, pregunta antes de agrupar.

### Precios, divisas e IVA

Para comparar, la web lleva todo a MXN sin IVA por unidad del producto:

$$p_{\text{MXN}} = \frac{p \cdot TC}{(1+\tau)^{[\text{IVA incluido}]} \cdot e}$$

- `precio_unitario` (`p`): el **neto** que trae el documento (después de descuentos), en la moneda del documento. El descuento va solo como texto en `descuento`.
- `moneda` distinta de MXN exige `tipo_cambio: { valor, fecha, fuente }`. Usa el **FIX de Banxico** del día de emisión (si es inhábil, el último publicado antes) con `fuente: "Banxico FIX"`. Si el documento fija su propio tipo de cambio, usa ese con `fuente: "TC indicado en la cotización"`. Nunca inventes un valor: si no lo puedes consultar, pregunta.
- `precios_incluyen_iva: true` si los precios unitarios ya traen IVA. `iva`: 0.16 general, 0.08 región fronteriza, 0 exento.
- `equivalencia` (`e`): unidades del producto por unidad cotizada (p. ej. tramo de 6 m y producto por metro: `unidad: "tramo"`, `equivalencia: 6`).

### Esquema de registros

```jsonc
// proveedores/<slug>.json
{ "id": "tubos-del-norte", "nombre": "Tubos del Norte", "razon_social": "…", "rfc": "…", "tipo": "Distribuidor",
  "sitio_web": "https://…", "telefono": "…", "correo": "…", "direccion": "…", "ciudad": "Monterrey, N.L.",
  "marcas": ["…"], "notas": "…",
  "contactos": [{ "id": "juan-perez", "nombre": "Juan Pérez", "puesto": "…", "telefono": "…", "celular": "…", "correo": "…" }] }

// productos/P-0001.json  (categoria = id de una familia final de la taxonomía)
{ "id": "P-0001", "tipo": "producto", "nombre": "Válvula de compuerta 4\" vástago fijo, bridada", "categoria": "val-compuerta",
  "unidad": "pza", "atributos": { "Diámetro nominal": "4\"", "Presión de trabajo": "250 psi" },
  "palabras_clave": ["gate valve"], "descripcion": "…", "notas": "…" }

// cotizaciones/C-0001.json
{ "id": "C-0001", "proveedor": "tubos-del-norte", "contacto": "juan-perez", "folio": "COT-4587",
  "fecha": "2026-10-15", "vigencia": "2026-11-14", "moneda": "USD",
  "tipo_cambio": { "valor": 18.42, "fecha": "2026-10-15", "fuente": "Banxico FIX" },
  "precios_incluyen_iva": false, "iva": 0.16, "proyecto": "…", "solicitante": "…",
  "condiciones": { "pago": "…", "entrega": "…", "lab": "…", "flete": "…", "garantia": "…", "otras": "…" },
  "archivo": { "drive_id": "…", "nombre": "2026-10-15_C-0001_tubos-del-norte_COT-4587.pdf" },
  "partidas": [{ "producto": "P-0001", "descripcion": "texto literal del proveedor", "clave": "…", "marca": "…", "modelo": "…",
                 "cantidad": 10, "unidad": "pza", "precio_unitario": 650.0, "equivalencia": 1, "descuento": "10 %",
                 "diferencias": ["…"], "notas": "…", "seccion": "…" }],
  "notas": "…" }

// fichas/FT-0001.json
{ "id": "FT-0001", "producto": "P-0001", "titulo": "…", "fabricante": "…", "modelo": "…", "revision": "…", "fecha": "2025-03-01",
  "archivo": { "drive_id": "…", "nombre": "FT-0001_P-0001_fabricante_modelo.pdf" },
  "datos": [{ "parametro": "Presión de trabajo", "valor": "250 psi (17.2 bar)", "pagina": 2 }], "notas": "…" }
```

Partidas que no son catálogo (maniobras, fletes sueltos): `producto: null`. Cuentan en los totales y la validación lo avisa.

## Taxonomía (3 niveles, la administra Claude)

- Vive en `.catalogo/fuente/taxonomia.json`: nodos `{ id, nombre, descripcion?, atributos?, alias?, hijos? }`. Máximo 3 niveles; los productos cuelgan solo de hojas (`categoria`).
- `atributos` sugiere columnas y se hereda a los hijos; usa exactamente esos nombres en los productos.
- Para reorganizar: edita el árbol y el campo `categoria` de los productos afectados. Si un id desaparece (fusión o cambio), agrégalo a `alias` del nodo que lo reemplaza para que los enlaces viejos sigan funcionando.
- Las carpetas de Drive no dependen de la taxonomía: no hay que mover PDF al reorganizar.

## Usuarios y acceso

```bash
npm run catalogo -- usuario agregar <usuario> --nombre "Nombre Apellido"   # imprime la contraseña generada
npm run catalogo -- usuario contrasena <usuario>
npm run catalogo -- usuario quitar <usuario>    # rota la llave; los demás conservan su contraseña
npm run catalogo -- usuario admin <usuario>     # puede editar
npm run catalogo -- usuario listar
```

Después, commit de `catalogo/datos/`. Para que vean los PDF, comparte la carpeta raíz de Drive (`drive.raiz`) con su correo como lector (`share_file`). Si cambia la contraseña de un administrador, debe actualizar `CATALOGO_CONTRASENA` en el entorno.

## Código de la web

- JavaScript sin dependencias ni build; comentarios en español, como el resto del sitio. Los datos se interpolan siempre con `html\`…\`` (escapa por defecto).
- Pruebas: `npm test`. Revisión visual: `npm run capturas` (genera el demo, entra con Playwright y guarda capturas en `.catalogo/capturas/`; reporta errores de consola).
- Demo manual: `npm run demo`, luego `npx serve .catalogo/demo` y entra a `/catalogo/` con `demo` / `demo-catalogo`.
- Si cambias el formato de los datos, sube `ESQUEMA` en `catalogo/js/modelo.js` y adapta `validar.mjs`.
