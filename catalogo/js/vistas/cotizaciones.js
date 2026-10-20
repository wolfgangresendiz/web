// ============================================================
//  Cotizaciones: índice cronológico y detalle de cada documento
// ============================================================

import { html, dinero, fechaCorta, normalizar, numero, plural, antiguedad } from "../util.js";
import { ETIQUETAS_CONDICIONES, MONEDA_BASE } from "../modelo.js";
import {
  ruta,
  vacio,
  enlacePDF,
  enlaceProveedor,
  insigniaVigencia,
  insigniaDivisa,
  medios,
  notaConversion,
  activarOrden,
  activarFiltros,
  opciones,
  marcaModelo,
} from "./comunes.js";

const ESTADOS = { vigente: "Vigente", vencida: "Vencida", "sin-vigencia": "Sin vigencia" };

export function vistaCotizaciones(indice) {
  const lista = indice.listaCotizaciones;
  const anios = lista.map((c) => c.fecha.slice(0, 4));
  const proveedores = [...indice.proveedores.values()]
    .filter((p) => p.cotizaciones.length)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return {
    titulo: "Cotizaciones",
    seccion: "cotizaciones",
    html: html`<header class="encabezado">
        <h1>Cotizaciones</h1>
        <p class="encabezado__desc">Todas las cotizaciones recibidas, de la más reciente a la más antigua. Los importes se muestran en MXN sin IVA; las que vinieron en otra divisa indican su tipo de cambio.</p>
      </header>
      ${lista.length
        ? html`<div class="filtros" role="group" aria-label="Filtrar cotizaciones">
              <label class="filtros__campo filtros__campo--texto">
                <span>Filtrar</span>
                <input type="search" data-filtro="texto" placeholder="Proveedor, folio, proyecto, producto…" autocomplete="off">
              </label>
              <label class="filtros__campo">
                <span>Proveedor</span>
                <select data-filtro="proveedor">
                  <option value="">Todos</option>
                  ${proveedores.map((p) => html`<option value="${p.id}">${p.nombre} (${numero(p.cotizaciones.length)})</option>`)}
                </select>
              </label>
              <label class="filtros__campo">
                <span>Año</span>
                <select data-filtro="anio">${opciones(anios)}</select>
              </label>
              <label class="filtros__campo">
                <span>Vigencia</span>
                <select data-filtro="estado">
                  <option value="">Todas</option>
                  ${Object.entries(ESTADOS).map(([k, v]) => html`<option value="${k}">${v}</option>`)}
                </select>
              </label>
              <span class="filtros__contador" data-contador aria-live="polite"></span>
            </div>
            <div class="tabla-envoltura">
              <table class="tabla" data-ordenable>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">ID</th>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Folio</th>
                    <th scope="col">Proyecto</th>
                    <th scope="col" class="num">Partidas</th>
                    <th scope="col" class="num">Subtotal MXN</th>
                    <th scope="col">Vigencia</th>
                    <th scope="col" data-sin-orden>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  ${lista.map(
                    (c) => html`<tr
                      data-fila
                      data-texto="${normalizar(
                        [c.id, c.folio, c.proyecto, c.proveedorObj?.nombre, ...c.partidas.map((p) => `${p.descripcion} ${p.productoObj?.nombre ?? ""}`)].join(" "),
                      )}"
                      data-f-proveedor="${c.proveedor}"
                      data-f-anio="${c.fecha.slice(0, 4)}"
                      data-f-estado="${c.estado}"
                    >
                      <td class="sin-corte" data-valor="${c.fecha}">${fechaCorta(c.fecha)}</td>
                      <td class="id"><a href="${ruta.cotizacion(c.id)}">${c.id}</a></td>
                      <td>${enlaceProveedor(c.proveedorObj)}</td>
                      <td class="sin-corte">${c.folio ?? ""}</td>
                      <td class="tenue">${c.proyecto ?? ""}</td>
                      <td class="num">${numero(c.partidas.length)}</td>
                      <td class="num" data-valor="${c.totales?.subtotalMXN ?? ""}">
                        ${c.totales ? dinero(c.totales.subtotalMXN) : html`<span class="tenue">Lista de precios</span>`}
                        ${insigniaDivisa(c.moneda)}
                      </td>
                      <td data-valor="${c.vigencia ?? ""}">${insigniaVigencia(c)}</td>
                      <td>${enlacePDF(c.archivo)}</td>
                    </tr>`,
                  )}
                </tbody>
              </table>
            </div>`
        : vacio("Aún no hay cotizaciones.", "Guarda el PDF en la carpeta “00 Bandeja de entrada” del catálogo en Drive y pídele a Claude que lo procese.")}`,
    alMontar(raiz) {
      activarOrden(raiz);
      activarFiltros(raiz);
    },
  };
}

function datosGenerales(c) {
  const tc = c.tipo_cambio;
  const condiciones = Object.entries(ETIQUETAS_CONDICIONES).filter(([k]) => c.condiciones[k]);
  return html`<dl class="specs specs--columnas">
    <div><dt>Proveedor</dt><dd>${enlaceProveedor(c.proveedorObj)}</dd></div>
    ${c.contactoObj
      ? html`<div><dt>Contacto</dt><dd>${c.contactoObj.nombre}${c.contactoObj.puesto ? html` <span class="tenue">· ${c.contactoObj.puesto}</span>` : ""}${medios(c.contactoObj)}</dd></div>`
      : ""}
    <div><dt>Fecha de emisión</dt><dd>${fechaCorta(c.fecha)} <span class="tenue">(${antiguedad(c.fecha)})</span></dd></div>
    <div><dt>Vigencia</dt><dd>${c.vigencia ? html`${fechaCorta(c.vigencia)} ` : ""}${insigniaVigencia(c)}</dd></div>
    <div>
      <dt>Moneda</dt>
      <dd>
        ${c.moneda || MONEDA_BASE}
        ${c.moneda && c.moneda !== MONEDA_BASE && tc
          ? html`<span class="bloque">TC ${numero(tc.valor)} MXN por ${c.moneda}${tc.fecha ? ` del ${fechaCorta(tc.fecha)}` : ""}${tc.fuente ? ` (${tc.fuente})` : ""}</span>`
          : ""}
      </dd>
    </div>
    <div><dt>Precios del documento</dt><dd>${c.precios_incluyen_iva ? "Incluyen IVA (aquí se muestran sin IVA)" : "Sin IVA"}</dd></div>
    ${c.proyecto ? html`<div><dt>Proyecto</dt><dd>${c.proyecto}</dd></div>` : ""}
    ${c.solicitante ? html`<div><dt>Solicitó</dt><dd>${c.solicitante}</dd></div>` : ""}
    ${condiciones.map(([k, etiqueta]) => html`<div><dt>${etiqueta}</dt><dd>${c.condiciones[k]}</dd></div>`)}
  </dl>`;
}

function tablaPartidas(c) {
  const conSecciones = c.partidas.some((p) => p.seccion);
  let seccionActual = null;
  const columnas = 8;
  return html`<div class="tabla-envoltura">
    <table class="tabla tabla--tarjetas">
      <thead>
        <tr>
          <th scope="col" class="num">#</th>
          <th scope="col">Producto en el catálogo</th>
          <th scope="col">Descripción del proveedor</th>
          <th scope="col">Marca / modelo</th>
          <th scope="col" class="num">Cantidad</th>
          <th scope="col" class="num">P.U. cotizado</th>
          <th scope="col" class="num">P.U. MXN sin IVA</th>
          <th scope="col" class="num">Importe MXN</th>
        </tr>
      </thead>
      <tbody>
        ${c.partidas.map((p) => {
          let filaSeccion = "";
          if (conSecciones && p.seccion !== seccionActual) {
            seccionActual = p.seccion;
            filaSeccion = html`<tr class="fila-seccion"><th colspan="${columnas}" scope="rowgroup">${p.seccion ?? "Sin sección"}</th></tr>`;
          }
          const conversion = notaConversion(p, { corta: true });
          return html`${filaSeccion}<tr>
            <td class="num tenue">${p.n}</td>
            <td>
              ${p.productoObj
                ? html`<a href="${ruta.producto(p.productoObj.id)}">${p.productoObj.nombre}</a> <span class="id tenue">${p.productoObj.id}</span>`
                : html`<span class="tenue">No catalogado</span>`}
              ${p.diferencias.length ? html`<ul class="dif">${p.diferencias.map((d) => html`<li>${d}</li>`)}</ul>` : ""}
            </td>
            <td class="cita" data-etiqueta="Descripción del proveedor">${p.descripcion}${p.clave ? html`<span class="tenue bloque">Clave ${p.clave}</span>` : ""}${p.notas ? html`<span class="tenue bloque">${p.notas}</span>` : ""}</td>
            <td data-etiqueta="Marca / modelo">${marcaModelo(p)}</td>
            <td class="num" data-etiqueta="Cantidad">${p.cantidad != null ? `${numero(p.cantidad)} ${p.unidad ?? ""}` : html`<span class="tenue">${p.unidad ?? ""}</span>`}</td>
            <td class="num" data-etiqueta="P.U. cotizado">${dinero(p.precio.puOriginal, p.precio.moneda)}${p.descuento ? html`<span class="tenue bloque">Desc. ${p.descuento}</span>` : ""}</td>
            <td class="num" data-etiqueta="P.U. MXN sin IVA">
              <strong>${dinero(p.precio.puMXN)}</strong>${p.productoObj ? html`<span class="precio__unidad"> /${p.productoObj.unidad}</span>` : ""}
              ${conversion ? html`<span class="precio__nota">${conversion}</span>` : ""}
            </td>
            <td class="num" data-etiqueta="Importe MXN">${Number.isFinite(p.precio.importeMXN) ? dinero(p.precio.importeMXN) : ""}</td>
          </tr>`;
        })}
      </tbody>
      ${c.totales
        ? html`<tfoot>
            <tr><th colspan="7" scope="row">Subtotal</th><td class="num">${dinero(c.totales.subtotalMXN)}</td></tr>
            <tr><th colspan="7" scope="row">IVA (${numero(c.totales.tasa * 100)} %)</th><td class="num">${dinero(c.totales.ivaMXN)}</td></tr>
            <tr class="total"><th colspan="7" scope="row">Total MXN</th><td class="num">${dinero(c.totales.totalMXN)}</td></tr>
            ${c.moneda && c.moneda !== MONEDA_BASE
              ? html`<tr><th colspan="7" scope="row" class="tenue">Total en ${c.moneda}, como en el documento</th><td class="num tenue">${dinero(c.totales.totalOriginal, c.moneda)}</td></tr>`
              : ""}
          </tfoot>`
        : ""}
    </table>
  </div>`;
}

export function vistaCotizacion(indice, { id }) {
  const c = indice.cotizaciones.get(id);
  if (!c) return null;
  return {
    titulo: `${c.id} · ${c.proveedorObj?.nombre ?? ""}`,
    seccion: "cotizaciones",
    html: html`<nav class="migas" aria-label="Ubicación">
        <a href="${ruta.cotizaciones()}">Cotizaciones</a><span class="migas__sep" aria-hidden="true">›</span><span aria-current="page">${c.id}</span>
      </nav>
      <header class="encabezado encabezado--accion">
        <div>
          <p class="encabezado__sup"><span class="id">${c.id}</span> · Cotización ${c.folio ? `folio ${c.folio}` : "sin folio"}</p>
          <h1>${c.proveedorObj?.nombre ?? c.proveedor}</h1>
          <p class="encabezado__meta">
            ${fechaCorta(c.fecha)} · ${plural(c.partidas.length, "partida")} ${insigniaVigencia(c)} ${insigniaDivisa(c.moneda)}
          </p>
        </div>
        ${c.archivo?.drive_id ? html`<div class="encabezado__acciones">${enlacePDF(c.archivo, "Abrir PDF en Drive")}</div>` : ""}
      </header>
      <section class="panel">${datosGenerales(c)}</section>
      <section class="panel">
        <h2 class="panel__titulo">Partidas</h2>
        ${tablaPartidas(c)}
        ${c.totales ? html`<p class="nota-pie">Totales calculados a partir de las partidas; pueden variar unos centavos respecto al documento por redondeo.</p>` : ""}
      </section>
      ${c.notas ? html`<section class="panel"><h2 class="panel__titulo">Notas</h2><p>${c.notas}</p></section>` : ""}`,
  };
}
