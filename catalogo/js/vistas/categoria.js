// ============================================================
//  Categorías: navegación por la taxonomía y tablas de productos
// ============================================================
//
// Como en un catálogo industrial, cada familia (hoja de la taxonomía)
// se muestra como una tabla densa: una fila por producto, columnas con
// sus atributos y el último precio. En niveles superiores las familias
// aparecen una tras otra, cada una con su tabla.

import { html, crudo, dinero, escapar, fechaCorta, normalizar, numero, plural } from "../util.js";
import { buscarNodo, columnasDe, hojasDe, productosDe, rutaNombres } from "../modelo.js";
import { minigrafica } from "../grafica.js";
import {
  ruta,
  migas,
  vacio,
  activarOrden,
  activarFiltros,
  opciones,
  valorFiltro,
  insigniaDivisa,
} from "./comunes.js";

const textoFila = (indice, p) =>
  normalizar(
    [
      p.id,
      p.nombre,
      ...Object.values(p.atributos),
      ...(p.palabras_clave ?? []),
      ...rutaNombres(indice, p.nodo),
      ...p.resumen.ofertas.flatMap((o) => [o.marca, o.modelo, o.cotizacion.proveedorObj?.nombre]),
    ]
      .filter(Boolean)
      .join(" "),
  );

function celdaUltimoPrecio(p) {
  const r = p.resumen;
  if (!r.n) return html`<td class="num tenue" data-valor="">Sin cotización</td>`;
  const historial = r.historial.map((o) => o.precio.puMXN);
  return html`<td class="num" data-valor="${r.ultimo.precio.puMXN}">
    <span class="celda-precio">
      ${crudo(minigrafica(historial))}
      <span><span class="precio__valor">${dinero(r.ultimo.precio.puMXN)}</span><span class="precio__unidad"> /${p.unidad}</span></span>
    </span>
  </td>`;
}

// Como en los catálogos industriales: lo que todos los productos de la
// familia comparten se dice una vez arriba de la tabla, y solo lo que
// cambia de un producto a otro ocupa columnas.
export function separarAtributos(productos, columnas, maximo = 5) {
  const comunes = [];
  const variables = [];
  for (const c of columnas) {
    const valores = productos.map((p) => String(p.atributos[c] ?? "").trim());
    const iguales = valores[0] !== "" && valores.every((v) => normalizar(v) === normalizar(valores[0]));
    if (iguales && (productos.length > 1 || columnas.length > 2)) comunes.push([c, valores[0]]);
    else variables.push(c);
  }
  return { comunes, variables: variables.slice(0, maximo) };
}

function lineaComunes(comunes, cuantos) {
  if (!comunes.length) return "";
  return html`<p class="comunes">
    <span class="comunes__etiqueta">${cuantos > 1 ? "Todos:" : "Especificaciones:"}</span>
    ${comunes.map(([c, v], i) => html`${i ? html`<span class="comunes__sep" aria-hidden="true">·</span>` : ""}<span>${c} <strong>${v}</strong></span>`)}
  </p>`;
}

// Tabla de productos. columnas: lista de atributos a mostrar.
export function tablaProductos(indice, productos, { columnas = [], conCategoria = false } = {}) {
  return html`<div class="tabla-envoltura">
    <table class="tabla" data-ordenable>
      <thead>
        <tr>
          <th scope="col">ID</th>
          <th scope="col">Producto o servicio</th>
          ${conCategoria ? html`<th scope="col">Familia</th>` : ""}
          ${columnas.map((c) => html`<th scope="col">${c}</th>`)}
          <th scope="col" class="num">Último precio <small>MXN sin IVA</small></th>
          <th scope="col">Cotizado</th>
          <th scope="col" class="num" title="Cotizaciones y proveedores">Cotiz.</th>
        </tr>
      </thead>
      <tbody>
        ${productos.map((p) => {
          const r = p.resumen;
          const proveedores = [...new Set(r.ofertas.map((o) => o.cotizacion.proveedor))];
          const atributosFiltro = {};
          columnas.forEach((c, i) => {
            atributosFiltro[`data-f-a${i}`] = valorFiltro(p.atributos[c]);
          });
          return html`<tr
            data-fila
            data-texto="${textoFila(indice, p)}"
            data-f-proveedor="${valorFiltro(proveedores)}"
            data-f-vigente="${r.mejorVigente ? "1" : ""}"
            ${crudo(Object.entries(atributosFiltro).map(([k, v]) => `${k}="${escapar(v)}"`).join(" "))}
          >
            <td class="id"><a href="${ruta.producto(p.id)}">${p.id}</a></td>
            <td class="nombre">
              <a href="${ruta.producto(p.id)}">${p.nombre}</a>
              ${p.tipo === "servicio" ? html`<span class="insignia insignia--neutra">Servicio</span>` : ""}
              ${p.fichas.length ? html`<span class="insignia insignia--ficha" title="Tiene ficha técnica">Ficha</span>` : ""}
            </td>
            ${conCategoria ? html`<td class="tenue">${p.nodo?.nombre ?? ""}</td>` : ""}
            ${columnas.map((c) => html`<td>${p.atributos[c] ?? ""}</td>`)}
            ${celdaUltimoPrecio(p)}
            <td class="sin-corte" data-valor="${r.ultimo?.cotizacion.fecha ?? ""}">
              ${r.ultimo ? html`${fechaCorta(r.ultimo.cotizacion.fecha)} ${insigniaDivisa(r.ultimo.cotizacion.moneda)}` : ""}
            </td>
            <td class="num" data-valor="${r.n}">
              ${r.n ? html`${numero(r.n)}${r.nProveedores > 1 ? html`<small class="tenue"> · ${numero(r.nProveedores)} prov.</small>` : ""}` : ""}
            </td>
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}

function barraFiltros(indice, productos, columnas) {
  const proveedores = productos.flatMap((p) => [...new Set(p.resumen.ofertas.map((o) => o.cotizacion.proveedor))]);
  const nombres = new Map([...indice.proveedores.values()].map((p) => [p.id, p.nombre]));
  const opcionesProveedor = [...new Set(proveedores)]
    .map((id) => ({ id, nombre: nombres.get(id) ?? id, n: proveedores.filter((x) => x === id).length }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const facetas = columnas
    .map((c, i) => ({ c, i, valores: productos.map((p) => p.atributos[c]).filter(Boolean) }))
    .filter((f) => new Set(f.valores).size > 1);

  return html`<div class="filtros" role="group" aria-label="Filtrar productos">
    <label class="filtros__campo filtros__campo--texto">
      <span>Filtrar</span>
      <input type="search" data-filtro="texto" placeholder="Nombre, marca, medida…" autocomplete="off">
    </label>
    ${facetas.map(
      (f) => html`<label class="filtros__campo">
        <span>${f.c}</span>
        <select data-filtro="a${f.i}">${opciones(f.valores)}</select>
      </label>`,
    )}
    ${opcionesProveedor.length > 1
      ? html`<label class="filtros__campo">
          <span>Proveedor</span>
          <select data-filtro="proveedor">
            <option value="">Todos</option>
            ${opcionesProveedor.map((p) => html`<option value="${p.id}">${p.nombre} (${numero(p.n)})</option>`)}
          </select>
        </label>`
      : ""}
    <label class="filtros__check">
      <input type="checkbox" data-filtro="vigente">
      <span>Solo con cotización vigente</span>
    </label>
    <span class="filtros__contador" data-contador aria-live="polite"></span>
  </div>`;
}

export function vistaCategoria(indice, { id }) {
  const nodo = buscarNodo(indice, id);
  if (!nodo) return null;
  const productos = productosDe(nodo);
  const esHoja = !nodo.hijos.length;
  const proveedores = new Set(productos.flatMap((p) => p.resumen.ofertas.map((o) => o.cotizacion.proveedor)));
  const cotizaciones = new Set(productos.flatMap((p) => p.resumen.ofertas.map((o) => o.cotizacion.id)));

  const subcategorias = nodo.hijos.length
    ? html`<nav class="subcats" aria-label="Subcategorías">
        ${nodo.hijos.map(
          (h) => html`<a class="subcat ${h.total ? "" : "subcat--vacia"}" href="${ruta.categoria(h.id)}">
            <span class="subcat__nombre">${h.nombre}</span>
            <span class="cuenta">${numero(h.total)}</span>
            ${h.hijos.length
              ? html`<span class="subcat__hojas">${h.hijos.map((n) => n.nombre).join(" · ")}</span>`
              : ""}
          </a>`,
        )}
      </nav>`
    : "";

  let cuerpo;
  if (!productos.length) {
    cuerpo = vacio(
      "Todavía no hay productos en esta categoría.",
      "Cuando llegue una cotización o ficha técnica de algo que pertenezca aquí, aparecerá en esta lista.",
    );
  } else if (esHoja) {
    const { comunes, variables } = separarAtributos(productos, columnasDe(nodo, productos, 12));
    cuerpo = html`${barraFiltros(indice, productos, variables)}
      ${lineaComunes(comunes, productos.length)}
      ${tablaProductos(indice, productos, { columnas: variables })}`;
  } else {
    const familias = hojasDe(nodo).filter((h) => h.productos.length);
    cuerpo = html`${barraFiltros(indice, productos, [])}
      ${familias.map((h) => {
        const nombres = rutaNombres(indice, h).slice(nodo.nivel);
        const { comunes, variables } = separarAtributos(h.productos, columnasDe(h, h.productos, 12));
        return html`<section class="familia" data-grupo>
          <h2 class="familia__titulo">
            <a href="${ruta.categoria(h.id)}">${nombres.join(" › ")}</a>
            <span class="cuenta">${numero(h.productos.length)}</span>
          </h2>
          ${lineaComunes(comunes, h.productos.length)}
          ${tablaProductos(indice, h.productos, { columnas: variables })}
        </section>`;
      })}`;
  }

  return {
    titulo: nodo.nombre,
    seccion: "catalogo",
    lateral: true,
    nodoActivo: nodo.id,
    html: html`${migas(indice, nodo.padre, [nodo.nombre])}
      <header class="encabezado">
        <p class="encabezado__sup">${["Categoría", "Subcategoría", "Familia"][nodo.nivel - 1] ?? "Categoría"}</p>
        <h1>${nodo.nombre}</h1>
        ${nodo.descripcion ? html`<p class="encabezado__desc">${nodo.descripcion}</p>` : ""}
        <p class="encabezado__meta">
          ${plural(productos.length, "producto o servicio", "productos y servicios")}
          ${cotizaciones.size ? html` · ${plural(cotizaciones.size, "cotización", "cotizaciones")}` : ""}
          ${proveedores.size ? html` · ${plural(proveedores.size, "proveedor", "proveedores")}` : ""}
        </p>
      </header>
      ${subcategorias}
      ${cuerpo}`,
    alMontar(raiz) {
      activarOrden(raiz);
      activarFiltros(raiz);
    },
  };
}
