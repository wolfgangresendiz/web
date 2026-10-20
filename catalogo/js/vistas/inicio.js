// ============================================================
//  Portada, novedades y resultados de búsqueda
// ============================================================

import { html, dinero, fechaCorta, fechaHora, hoyISO, numero, plural } from "../util.js";
import { rutaNombres } from "../modelo.js";
import { ruta, vacio, enlaceProveedor, insigniaDivisa, insigniaVigencia, activarOrden } from "./comunes.js";
import { tablaProductos } from "./categoria.js";

function cifras(indice) {
  const items = [
    ["Productos y servicios", indice.productos.size, "#/"],
    ["Cotizaciones", indice.cotizaciones.size, ruta.cotizaciones()],
    ["Proveedores", indice.proveedores.size, ruta.proveedores()],
    ["Fichas técnicas", indice.fichas.size, ruta.fichas()],
  ];
  return html`<dl class="cifras">
    ${items.map(([etiqueta, valor, enlace]) => html`<a class="cifra" href="${enlace}"><dt>${etiqueta}</dt><dd>${numero(valor)}</dd></a>`)}
  </dl>`;
}

// Mapa completo de la taxonomía: cada categoría con sus subcategorías y familias.
function mapaCategorias(indice) {
  return html`<section class="cat-grid" aria-label="Categorías">
    ${indice.raices.map(
      (n1) => html`<article class="cat ${n1.total ? "" : "cat--vacia"}">
        <h2 class="cat__titulo"><a href="${ruta.categoria(n1.id)}">${n1.nombre}</a><span class="cuenta">${numero(n1.total)}</span></h2>
        <ul class="cat__lista">
          ${n1.hijos.map(
            (n2) => html`<li class="${n2.total ? "" : "vacia"}">
              <a class="cat__sub" href="${ruta.categoria(n2.id)}">${n2.nombre}</a>${n2.total ? html` <span class="cuenta">${numero(n2.total)}</span>` : ""}
              ${n2.hijos.length
                ? html`<span class="cat__hojas">${n2.hijos.map(
                    (n3, i) => html`${i ? ", " : ""}<a class="${n3.total ? "con-productos" : ""}" href="${ruta.categoria(n3.id)}">${n3.nombre}</a>`,
                  )}</span>`
                : ""}
            </li>`,
          )}
        </ul>
      </article>`,
    )}
  </section>`;
}

function recientes(indice) {
  const lista = indice.listaCotizaciones.slice(0, 6);
  if (!lista.length) return "";
  return html`<section class="panel">
    <h2 class="panel__titulo">Cotizaciones recientes <a class="panel__mas" href="${ruta.cotizaciones()}">Ver todas</a></h2>
    <ul class="lista-simple">
      ${lista.map(
        (c) => html`<li class="reciente">
          <span>
            <a href="${ruta.cotizacion(c.id)}"><strong>${c.proveedorObj?.nombre ?? c.proveedor}</strong></a>
            <span class="tenue bloque">${fechaCorta(c.fecha)} · ${plural(c.partidas.length, "partida")}${c.totales ? ` · ${dinero(c.totales.subtotalMXN)}` : ""}</span>
          </span>
          <span class="reciente__insignias">${insigniaDivisa(c.moneda)} ${insigniaVigencia(c)}</span>
        </li>`,
      )}
    </ul>
  </section>`;
}

function novedadesBreves(indice) {
  const lista = indice.bitacora.slice(0, 5);
  if (!lista.length) return "";
  return html`<section class="panel">
    <h2 class="panel__titulo">Novedades <a class="panel__mas" href="${ruta.novedades()}">Historial</a></h2>
    <ul class="lista-simple">
      ${lista.map((b) => html`<li><span class="tenue">${fechaCorta(hoyISO(new Date(b.fecha)))}</span> ${b.resumen}</li>`)}
    </ul>
  </section>`;
}

export function vistaInicio(indice) {
  const sinDatos = !indice.cotizaciones.size && !indice.productos.size;
  return {
    titulo: "Catálogo",
    seccion: "catalogo",
    lateral: true,
    html: html`<section class="portada">
        <div>
          <p class="encabezado__sup">Agua potable · piezas y servicios</p>
          <h1>Catálogo de cotizaciones</h1>
          <p class="encabezado__desc">Todo lo que se ha cotizado, agrupado por producto. Precios en MXN sin IVA; cada cotización enlaza a su PDF en Drive.</p>
        </div>
        ${cifras(indice)}
      </section>
      ${sinDatos
        ? vacio(
            "El catálogo está listo y vacío.",
            "Para agregar la primera cotización: guarda el PDF en la carpeta “00 Bandeja de entrada” del catálogo en Google Drive y pídele a Claude que la procese.",
          )
        : ""}
      <div class="rejilla-2 rejilla-2--portada">
        ${recientes(indice)}
        ${novedadesBreves(indice)}
      </div>
      ${mapaCategorias(indice)}`,
  };
}

export function vistaNovedades(indice) {
  return {
    titulo: "Novedades",
    seccion: "catalogo",
    html: html`<header class="encabezado">
        <h1>Novedades</h1>
        <p class="encabezado__desc">Bitácora de cambios del catálogo: qué se agregó o modificó y cuándo.</p>
      </header>
      ${indice.bitacora.length
        ? html`<ol class="bitacora">
            ${indice.bitacora.map(
              (b) => html`<li class="bitacora__item">
                <p class="bitacora__fecha">${fechaHora(b.fecha)}</p>
                <p class="bitacora__resumen">${b.resumen}</p>
                ${b.cambios?.length ? html`<ul class="bitacora__cambios">${b.cambios.map((c) => html`<li>${c}</li>`)}</ul>` : ""}
                ${b.nota ? html`<p class="tenue">${b.nota}</p>` : ""}
              </li>`,
            )}
          </ol>`
        : vacio("Sin cambios registrados.")}`,
  };
}

export function vistaBusqueda(indice, { q }, buscador) {
  const resultados = buscador.buscar(q ?? "", { limite: 200 });
  const de = (tipo) => resultados.filter((r) => r.tipo === tipo).map((r) => r.objeto);
  const productos = de("producto");
  const proveedores = de("proveedor");
  const cotizaciones = de("cotizacion");
  const fichas = de("ficha");
  return {
    titulo: `Búsqueda: ${q}`,
    seccion: "catalogo",
    lateral: true,
    html: html`<header class="encabezado">
        <p class="encabezado__sup">Búsqueda</p>
        <h1>“${q}”</h1>
        <p class="encabezado__meta">${plural(resultados.length, "resultado")}</p>
      </header>
      ${!resultados.length
        ? vacio("Sin resultados.", "Prueba con menos palabras, otra medida (2 in, 50 mm) o el nombre del proveedor.")
        : ""}
      ${productos.length
        ? html`<section class="panel">
            <h2 class="panel__titulo">Productos y servicios <span class="cuenta">${numero(productos.length)}</span></h2>
            ${tablaProductos(indice, productos, { conCategoria: true })}
          </section>`
        : ""}
      ${proveedores.length
        ? html`<section class="panel">
            <h2 class="panel__titulo">Proveedores <span class="cuenta">${numero(proveedores.length)}</span></h2>
            <ul class="lista-simple">
              ${proveedores.map((p) => html`<li>${enlaceProveedor(p)} <span class="tenue">${[p.ciudad, plural(p.cotizaciones.length, "cotización", "cotizaciones")].filter(Boolean).join(" · ")}</span></li>`)}
            </ul>
          </section>`
        : ""}
      ${cotizaciones.length
        ? html`<section class="panel">
            <h2 class="panel__titulo">Cotizaciones <span class="cuenta">${numero(cotizaciones.length)}</span></h2>
            <ul class="lista-simple">
              ${cotizaciones.map(
                (c) => html`<li><a href="${ruta.cotizacion(c.id)}">${c.id}</a> ${c.proveedorObj?.nombre ?? ""} <span class="tenue">${[c.folio, fechaCorta(c.fecha)].filter(Boolean).join(" · ")}</span></li>`,
              )}
            </ul>
          </section>`
        : ""}
      ${fichas.length
        ? html`<section class="panel">
            <h2 class="panel__titulo">Fichas técnicas <span class="cuenta">${numero(fichas.length)}</span></h2>
            <ul class="lista-simple">
              ${fichas.map(
                (f) => html`<li><a href="${ruta.ficha(f.id)}">${f.titulo}</a> <span class="tenue">${[f.productoObj?.nombre, rutaNombres(indice, f.productoObj?.nodo).at(-1)].filter(Boolean).join(" · ")}</span></li>`,
              )}
            </ul>
          </section>`
        : ""}`,
    alMontar(raiz) {
      activarOrden(raiz);
    },
  };
}
