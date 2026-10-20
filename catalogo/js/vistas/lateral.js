// ============================================================
//  Árbol de categorías (columna lateral)
// ============================================================
//
// Siempre se ven las categorías principales; se despliega solo la rama
// de la página actual, como en los catálogos industriales.

import { html, numero } from "../util.js";
import { buscarNodo } from "../modelo.js";
import { ruta } from "./comunes.js";

export function arbolCategorias(indice, idActivo) {
  const activo = idActivo ? buscarNodo(indice, idActivo) : null;
  const enRuta = new Set(activo?.ruta ?? []);

  const rama = (nodos, nivel) => html`<ul class="arbol__nivel arbol__nivel--${nivel}">
    ${nodos.map((n) => {
      const actual = activo?.id === n.id;
      const clases = ["arbol__enlace", enRuta.has(n.id) ? "en-ruta" : "", actual ? "actual" : "", n.total ? "" : "arbol__enlace--vacio"]
        .filter(Boolean)
        .join(" ");
      return html`<li>
        <a class="${clases}" href="${ruta.categoria(n.id)}" ${actual ? html`aria-current="page"` : ""}>
          <span>${n.nombre}</span>${n.total ? html`<span class="cuenta">${numero(n.total)}</span>` : ""}
        </a>
        ${n.hijos.length && enRuta.has(n.id) ? rama(n.hijos, nivel + 1) : ""}
      </li>`;
    })}
  </ul>`;

  return html`<nav class="arbol" aria-label="Categorías del catálogo">
    <p class="arbol__titulo"><a href="${ruta.inicio()}">Todas las categorías</a></p>
    ${rama(indice.raices, 1)}
  </nav>`;
}
