# CLAUDE.md

Sitio personal **WR** (GitHub Pages, se publica desde `main`): https://wolfgangresendiz.github.io/web/

Preferencias del dueño: responder en español; no usar el guion largo (U+2014) en textos, interfaz ni mensajes; notación formal cuando aporte.

## Lo primero: el repositorio es PÚBLICO

- Todo lo que se sube se publica. Nada privado va al repo en claro: datos, contraseñas, llaves, contactos.
- Nunca pidas contraseñas ni llaves en el chat ni imprimas variables de entorno con credenciales. Si faltan, pide al usuario que las configure en el entorno de Claude Code.
- Cada proyecto puede tener reglas más estrictas en su `CLAUDE.md` (p. ej. el catálogo publica sus datos solo cifrados).

## Proyectos y zonas

El sitio se divide en **proyectos**, uno por carpeta, registrados en `proyectos.json`. Todo lo que no pertenece a un proyecto es la **zona general**.

| Zona | Carpetas | Instrucciones |
|---|---|---|
| `general` | `index.html`, `css/`, `herramientas/`, `.claude/`, `.github/`, `proyectos.json`, `package.json`, `README.md` | Este archivo |
| `calculadoras` | `calculadoras/` | `calculadoras/CLAUDE.md` |
| `catalogo` | `catalogo/`, `.catalogo/` (privada) | `catalogo/CLAUDE.md` |

Reglas:

- Cada entorno de Claude Code trabaja en una zona, indicada con la variable `WEB_PROYECTO` (`general` o el id de un proyecto). Al iniciar la sesión, un hook dice cuál es.
- **Solo se edita la zona propia.** El hook de `.claude/settings.json` bloquea `Edit`/`Write` fuera de ella. Con Bash tampoco se escribe fuera, aunque el hook no lo detecte. Si hace falta un cambio en otra zona, dile al usuario qué hace falta y desde qué entorno.
- Sin `WEB_PROYECTO` no hay restricción: úsalo solo para cambios que cruzan zonas a propósito (como una reorganización).
- Cada proyecto es autocontenido: su HTML, CSS, JS, herramientas y pruebas viven en su carpeta. Lo compartido (estilos base, portada) es de la zona general y los proyectos solo lo leen. Si un proyecto necesita otro aspecto, lo sobrescribe en su propio CSS.
- Un cambio en lo compartido afecta a todos los proyectos: antes de publicarlo, revisa que cada uno se siga viendo bien (`npm run capturas` cubre el catálogo).
- Un PR toca una sola zona. La revisión «Zonas» de GitHub (`.github/workflows/zonas.yml`) falla si mezcla zonas, o si la rama se llama `<zona>/…` y toca otra. Un cruce intencional lleva la etiqueta `varias-zonas`.

Comandos (`npm run proyectos -- …`):

```bash
npm run proyectos -- listar                      # proyectos y sus carpetas
npm run proyectos -- zona <ruta>                 # a qué zona pertenece una ruta
npm run proyectos -- revisar                     # zonas que toca la copia de trabajo frente a origin/main
npm run proyectos -- nuevo <id> --nombre "…"     # crea un proyecto (solo desde el entorno general)
```

### Agregar un proyecto (entorno general)

1. `npm run proyectos -- nuevo <id> --nombre "Nombre"`: copia `herramientas/plantilla/` a `<id>/` (`CLAUDE.md` e `index.html`), lo registra en `proyectos.json` y agrega su tarjeta a la portada.
2. Commit y PR con la etiqueta `varias-zonas`.
3. El usuario crea en Claude Code un entorno con `WEB_PROYECTO=<id>`. Desde ahí se desarrolla el proyecto y se completa su `CLAUDE.md`.

Para quitar o renombrar un proyecto, edita `proyectos.json` y la portada, y mueve la carpeta (cambio de varias zonas).

## Estructura de la zona general

| Ruta | Qué es |
|---|---|
| `index.html` | Portada: una tarjeta por sección. |
| `css/styles.css` | Estilos base del sitio (tipografía, encabezado, tarjetas, formularios). |
| `proyectos.json` | Registro de proyectos y sus carpetas. |
| `herramientas/proyectos.mjs` | Zonas: comandos de arriba, hook y revisión de GitHub. Pruebas en `herramientas/pruebas/`. |
| `herramientas/plantilla/` | Plantilla de proyecto nuevo (`{{ID}}`, `{{NOMBRE}}`). |
| `.claude/settings.json` | Hooks de zona (`SessionStart` y `PreToolUse`). |
| `.github/workflows/zonas.yml` | Revisión de zonas en cada PR. |

## Código del sitio

- HTML, CSS y JavaScript sin dependencias ni build; comentarios en español. Librerías externas solo por CDN con versión fija.
- Rutas relativas (el sitio vive en `/web/`): desde un proyecto, lo común se enlaza con `../`.
- Pruebas: `npm test` corre `herramientas/pruebas/` y las de cada proyecto (`*/herramientas/pruebas/`).
