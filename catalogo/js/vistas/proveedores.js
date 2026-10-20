// ============================================================
//  Proveedores y contactos
// ============================================================

import { html, dinero, fechaCorta, normalizar, numero, plural, antiguedad, urlSegura } from "../util.js";
import {
  ruta,
  vacio,
  medios,
  enlacePDF,
  insigniaVigencia,
  insigniaDivisa,
  activarOrden,
  activarFiltros,
  valorFiltro,
  marcaModelo,
} from "./comunes.js";

const nombresCategorias = (indice, proveedor) =>
  [...proveedor.categorias].map((id) => indice.nodos.get(id)?.nombre).filter(Boolean);

export function vistaProveedores(indice) {
  const lista = [...indice.proveedores.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const categorias = [...new Set(lista.flatMap((p) => [...p.categorias]))]
    .map((id) => indice.nodos.get(id))
    .filter(Boolean);

  return {
    titulo: "Proveedores",
    seccion: "proveedores",
    html: html`<header class="encabezado">
        <h1>Proveedores</h1>
        <p class="encabezado__desc">Empresas que han cotizado, sus contactos y lo que nos han ofrecido.</p>
      </header>
      ${lista.length
        ? html`<div class="filtros" role="group" aria-label="Filtrar proveedores">
              <label class="filtros__campo filtros__campo--texto">
                <span>Filtrar</span>
                <input type="search" data-filtro="texto" placeholder="Nombre, ciudad, marca, contacto…" autocomplete="off">
              </label>
              ${categorias.length > 1
                ? html`<label class="filtros__campo">
                    <span>Categoría</span>
                    <select data-filtro="categoria">
                      <option value="">Todas</option>
                      ${categorias.map((n) => html`<option value="${n.id}">${n.nombre}</option>`)}
                    </select>
                  </label>`
                : ""}
              <span class="filtros__contador" data-contador aria-live="polite"></span>
            </div>
            <div class="tabla-envoltura">
              <table class="tabla" data-ordenable>
                <thead>
                  <tr>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Ciudad</th>
                    <th scope="col">Categorías cotizadas</th>
                    <th scope="col" class="num">Cotizaciones</th>
                    <th scope="col">Última</th>
                    <th scope="col" data-sin-orden>Contacto principal</th>
                  </tr>
                </thead>
                <tbody>
                  ${lista.map((p) => {
                    const contacto = p.contactos[0];
                    const ultima = p.cotizaciones[0];
                    return html`<tr
                      data-fila
                      data-texto="${normalizar([p.nombre, p.razon_social, p.ciudad, p.tipo, p.rfc, ...p.marcas, ...p.contactos.map((k) => k.nombre)].join(" "))}"
                      data-f-categoria="${valorFiltro([...p.categorias])}"
                    >
                      <td>
                        <a href="${ruta.proveedor(p.id)}"><strong>${p.nombre}</strong></a>
                        ${p.tipo ? html`<span class="tenue bloque">${p.tipo}</span>` : ""}
                      </td>
                      <td>${p.ciudad ?? ""}</td>
                      <td class="tenue">${nombresCategorias(indice, p).join(", ")}</td>
                      <td class="num" data-valor="${p.cotizaciones.length}">${numero(p.cotizaciones.length)}</td>
                      <td data-valor="${ultima?.fecha ?? ""}">${ultima ? fechaCorta(ultima.fecha) : ""}</td>
                      <td>
                        ${contacto
                          ? html`${contacto.nombre}${contacto.puesto ? html` <span class="tenue">· ${contacto.puesto}</span>` : ""}${medios(contacto)}`
                          : medios(p)}
                      </td>
                    </tr>`;
                  })}
                </tbody>
              </table>
            </div>`
        : vacio("Aún no hay proveedores.", "Se dan de alta solos al procesar su primera cotización.")}`,
    alMontar(raiz) {
      activarOrden(raiz);
      activarFiltros(raiz);
    },
  };
}

export function vistaProveedor(indice, { id }) {
  const p = indice.proveedores.get(id);
  if (!p) return null;

  // Último precio que este proveedor dio para cada producto.
  const ultimas = new Map();
  for (const c of p.cotizaciones) {
    for (const partida of c.partidas) {
      if (partida.productoObj && !ultimas.has(partida.productoObj.id)) ultimas.set(partida.productoObj.id, partida);
    }
  }
  const productos = [...ultimas.values()].sort((a, b) => a.productoObj.nombre.localeCompare(b.productoObj.nombre, "es"));

  const datos = [
    ["Razón social", p.razon_social],
    ["RFC", p.rfc],
    ["Tipo", p.tipo],
    ["Ciudad", p.ciudad],
    ["Dirección", p.direccion],
    ["Marcas que maneja", p.marcas.join(", ")],
  ].filter(([, v]) => v);

  return {
    titulo: p.nombre,
    seccion: "proveedores",
    html: html`<nav class="migas" aria-label="Ubicación">
        <a href="${ruta.proveedores()}">Proveedores</a><span class="migas__sep" aria-hidden="true">›</span><span aria-current="page">${p.nombre}</span>
      </nav>
      <header class="encabezado">
        <p class="encabezado__sup">Proveedor</p>
        <h1>${p.nombre}</h1>
        <p class="encabezado__meta">
          ${plural(p.cotizaciones.length, "cotización", "cotizaciones")} · ${plural(productos.length, "producto cotizado", "productos cotizados")}
          ${p.cotizaciones[0] ? html` · la última ${antiguedad(p.cotizaciones[0].fecha)}` : ""}
        </p>
        ${urlSegura(p.sitio_web) || p.telefono || p.correo
          ? html`<p class="encabezado__medios">
              ${urlSegura(p.sitio_web) ? html`<a href="${urlSegura(p.sitio_web)}" target="_blank" rel="noopener">${p.sitio_web.replace(/^https?:\/\//, "")}</a>` : ""}
              ${medios(p)}
            </p>`
          : ""}
      </header>
      <div class="rejilla-2">
        <section class="panel">
          <h2 class="panel__titulo">Datos</h2>
          ${datos.length ? html`<dl class="specs">${datos.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>` : html`<p class="tenue">Sin datos fiscales registrados.</p>`}
          ${p.notas ? html`<p class="nota-pie">${p.notas}</p>` : ""}
        </section>
        <section class="panel">
          <h2 class="panel__titulo">Contactos</h2>
          ${p.contactos.length
            ? html`<ul class="contactos">
                ${p.contactos.map(
                  (k) => html`<li class="contacto">
                    <p class="contacto__nombre">${k.nombre}</p>
                    ${k.puesto ? html`<p class="contacto__puesto">${k.puesto}</p>` : ""}
                    ${medios(k)}
                    ${k.notas ? html`<p class="tenue">${k.notas}</p>` : ""}
                  </li>`,
                )}
              </ul>`
            : html`<p class="tenue">Sin contactos registrados.</p>`}
        </section>
      </div>
      <section class="panel">
        <h2 class="panel__titulo">Cotizaciones</h2>
        ${p.cotizaciones.length
          ? html`<div class="tabla-envoltura"><table class="tabla" data-ordenable>
              <thead><tr>
                <th scope="col">Fecha</th><th scope="col">ID</th><th scope="col">Folio</th><th scope="col">Proyecto</th>
                <th scope="col" class="num">Partidas</th><th scope="col" class="num">Subtotal MXN</th><th scope="col">Vigencia</th><th scope="col" data-sin-orden>PDF</th>
              </tr></thead>
              <tbody>
                ${p.cotizaciones.map(
                  (c) => html`<tr>
                    <td class="sin-corte" data-valor="${c.fecha}">${fechaCorta(c.fecha)}</td>
                    <td class="id"><a href="${ruta.cotizacion(c.id)}">${c.id}</a></td>
                    <td class="sin-corte">${c.folio ?? ""}</td>
                    <td class="tenue">${c.proyecto ?? ""}</td>
                    <td class="num">${numero(c.partidas.length)}</td>
                    <td class="num" data-valor="${c.totales?.subtotalMXN ?? ""}">${c.totales ? dinero(c.totales.subtotalMXN) : ""} ${insigniaDivisa(c.moneda)}</td>
                    <td>${insigniaVigencia(c)}</td>
                    <td>${enlacePDF(c.archivo)}</td>
                  </tr>`,
                )}
              </tbody></table></div>`
          : html`<p class="tenue">Sin cotizaciones.</p>`}
      </section>
      ${productos.length
        ? html`<section class="panel">
            <h2 class="panel__titulo">Productos que ha cotizado</h2>
            <div class="tabla-envoltura"><table class="tabla" data-ordenable>
              <thead><tr>
                <th scope="col">ID</th><th scope="col">Producto o servicio</th><th scope="col">Marca / modelo</th>
                <th scope="col" class="num">Su último P.U. <small>MXN sin IVA</small></th><th scope="col">Fecha</th>
              </tr></thead>
              <tbody>
                ${productos.map(
                  (o) => html`<tr>
                    <td class="id"><a href="${ruta.producto(o.productoObj.id)}">${o.productoObj.id}</a></td>
                    <td><a href="${ruta.producto(o.productoObj.id)}">${o.productoObj.nombre}</a></td>
                    <td>${marcaModelo(o)}</td>
                    <td class="num" data-valor="${o.precio.puMXN}">${dinero(o.precio.puMXN)}<span class="precio__unidad"> /${o.productoObj.unidad}</span></td>
                    <td class="sin-corte" data-valor="${o.cotizacion.fecha}">${fechaCorta(o.cotizacion.fecha)}</td>
                  </tr>`,
                )}
              </tbody></table></div>
          </section>`
        : ""}`,
    alMontar(raiz) {
      activarOrden(raiz);
    },
  };
}
