# {{NOMBRE}}

Proyecto `{{ID}}` del sitio WR. Entorno de Claude Code: `WEB_PROYECTO={{ID}}`.

## Zona

- Este proyecto solo edita `{{ID}}/`. Todo lo demás se puede leer, pero no se modifica desde aquí.
- Lo común (`../css/styles.css`, `index.html` de la raíz, `herramientas/`) es de la zona general. Si algo de ahí no sirve, se sobrescribe en el CSS propio (`{{ID}}/css/`) o se le pide el cambio al entorno general.
- Rutas relativas: los recursos propios van en `{{ID}}/css/`, `{{ID}}/js/`, etc.; los comunes con `../`.

## Qué es

(Describe aquí el propósito, las páginas y las decisiones del proyecto.)

## Estructura

| Ruta | Qué es |
|---|---|
| `{{ID}}/index.html` | Página principal del proyecto |
