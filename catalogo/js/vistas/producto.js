// ============================================================
//  Ficha de producto o servicio
// ============================================================
//
// La entrada principal del catálogo. Agrupa todas las partidas que
// distintos proveedores cotizaron para este mismo producto, las compara
// en MXN sin IVA, señala en qué difieren y muestra la evolución del
// precio en el tiempo. Los datos técnicos siempre remiten a su PDF.

import { html, dinero, fechaCorta, mesCorto, numero, plural, porcentaje, antiguedad } from "../util.js";
import { diferenciasEntreOfertas, rutaNombres } from "../modelo.js";
import { dibujarHistorial, MAX_SERIES } from "../grafica.js";
import {
  ruta,
  migas,
  vacio,
  enlacePDF,
  enlaceProveedor,
  enlaceCotizacion,
  insigniaVigencia,
  insigniaDivisa,
  notaConversion,
  activarOrden,
} from "./comunes.js";

function tiles(p) {
  const r = p.resumen;
  const u = p.unidad;
  const mejor = r.mejorVigente;
  const v = r.variacion;
  const flecha = v && v.cambio > 0 ? "▲" : "▼";
  return html`<section class="tiles" aria-label="Resumen de precios">
    <div class="tile">
      <p class="tile__etiqueta">Mejor precio vigente</p>
      ${mejor
        ? html`<p class="tile__valor">${dinero(mejor.precio.puMXN)}<span class="tile__unidad"> /${u}</span></p>
            <p class="tile__nota">${mejor.cotizacion.proveedorObj?.nombre} · vence ${fechaCorta(mejor.cotizacion.vigencia)}</p>`
        : html`<p class="tile__valor tile__valor--tenue">Ninguno</p>
            <p class="tile__nota">No hay cotizaciones vigentes; conviene pedir una nueva.</p>`}
    </div>
    <div class="tile">
      <p class="tile__etiqueta">Último precio cotizado</p>
      <p class="tile__valor">${dinero(r.ultimo.precio.puMXN)}<span class="tile__unidad"> /${u}</span></p>
      <p class="tile__nota">${r.ultimo.cotizacion.proveedorObj?.nombre} · ${fechaCorta(r.ultimo.cotizacion.fecha)} (${antiguedad(r.ultimo.cotizacion.fecha)})</p>
    </div>
    <div class="tile">
      <p class="tile__etiqueta">Rango histórico</p>
      ${r.n > 1
        ? html`<p class="tile__valor tile__valor--rango">${dinero(r.minimo)} <span class="tile__a">a</span> ${dinero(r.maximo)}</p>
            <p class="tile__nota">${plural(r.n, "cotización", "cotizaciones")} de ${plural(r.nProveedores, "proveedor", "proveedores")}</p>`
        : html`<p class="tile__valor tile__valor--tenue">Una sola cotización</p>
            <p class="tile__nota">El rango aparece con la segunda.</p>`}
    </div>
    <div class="tile">
      <p class="tile__etiqueta">Variación en el tiempo</p>
      ${v
        ? html`<p class="tile__valor">
              <span class="delta ${v.cambio > 0 ? "delta--sube" : v.cambio < 0 ? "delta--baja" : ""}" aria-hidden="true">${v.cambio ? flecha : "="}</span>
              ${porcentaje(v.cambio)}
              <span class="tile__unidad">${v.cambio > 0 ? "subió" : v.cambio < 0 ? "bajó" : "sin cambio"}</span>
            </p>
            <p class="tile__nota">${v.proveedor?.nombre} · ${mesCorto(v.desde.cotizacion.fecha)} a ${mesCorto(v.hasta.cotizacion.fecha)}</p>`
        : html`<p class="tile__valor tile__valor--tenue">Sin historial</p>
            <p class="tile__nota">Se calcula con dos cotizaciones del mismo proveedor en fechas distintas.</p>`}
    </div>
  </section>`;
}

function especificaciones(indice, p) {
  const filas = Object.entries(p.atributos);
  return html`<section class="panel">
    <h2 class="panel__titulo">Especificaciones</h2>
    <dl class="specs">
      ${filas.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}
      <div><dt>Unidad</dt><dd>${p.unidad}</dd></div>
      <div><dt>Tipo</dt><dd>${p.tipo === "servicio" ? "Servicio" : "Producto"}</dd></div>
      <div><dt>Categoría</dt><dd>${rutaNombres(indice, p.nodo).join(" › ")}</dd></div>
      ${p.palabras_clave?.length ? html`<div><dt>También se busca como</dt><dd>${p.palabras_clave.join(", ")}</dd></div>` : ""}
    </dl>
    ${p.descripcion && filas.length === 0 ? html`<p class="tenue">${p.descripcion}</p>` : ""}
  </section>`;
}

function datosTecnicos(p) {
  if (!p.fichas.length) {
    return html`<section class="panel">
      <h2 class="panel__titulo">Datos técnicos</h2>
      ${vacio("Sin ficha técnica.", "Cuando haya una, sus datos clave aparecerán aquí con enlace al PDF en Drive.")}
    </section>`;
  }
  return html`<section class="panel" id="datos-tecnicos">
    <h2 class="panel__titulo">Datos técnicos</h2>
    ${p.fichas.map(
      (f) => html`<article class="ficha">
        <header class="ficha__cabecera">
          <div>
            <h3 class="ficha__titulo"><a href="${ruta.ficha(f.id)}">${f.titulo}</a></h3>
            <p class="ficha__meta">
              <span class="id">${f.id}</span>
              ${[f.fabricante, f.modelo, f.revision, f.fecha ? fechaCorta(f.fecha) : ""].filter(Boolean).join(" · ")}
            </p>
          </div>
          ${enlacePDF(f.archivo, "Ver PDF")}
        </header>
        ${f.datos.length
          ? html`<table class="tabla tabla--compacta tabla--datos">
              <tbody>
                ${f.datos.map(
                  (d) => html`<tr>
                    <th scope="row">${d.parametro}</th>
                    <td>${d.valor}</td>
                    <td class="tenue num">${d.pagina ? `p. ${d.pagina}` : ""}</td>
                  </tr>`,
                )}
              </tbody>
            </table>`
          : html`<p class="tenue">Consulta los datos en el PDF.</p>`}
        <p class="ficha__fuente">Fuente: ${enlacePDF(f.archivo, f.archivo?.nombre || "ficha técnica en Drive")}</p>
      </article>`,
    )}
  </section>`;
}

function comparativa(p) {
  const r = p.resumen;
  const mejor = r.comparativa[0].precio.puMXN;
  const difs = diferenciasEntreOfertas(r.comparativa);
  const varios = r.nProveedores > 1;
  return html`<section class="panel">
    <h2 class="panel__titulo">${varios ? "Comparativa de proveedores" : "Oferta actual"}</h2>
    <p class="panel__sub">
      ${varios
        ? "La cotización más reciente de cada proveedor, de menor a mayor precio. Precios en MXN, sin IVA, por "
        : "Precio en MXN, sin IVA, por "}${p.unidad}.
    </p>
    ${difs.length
      ? html`<div class="aviso" role="note">
          <p class="aviso__titulo">Las ofertas no son idénticas. Difieren en:</p>
          <ul>
            ${difs.map(
              (d) => html`<li><strong>${d.etiqueta}:</strong>
                ${d.valores.map((v, i) => html`${i ? "; " : ""}${v.valor || "no indicado"} <span class="tenue">(${v.proveedor?.nombre})</span>`)}
              </li>`,
            )}
          </ul>
        </div>`
      : ""}
    <div class="tabla-envoltura">
      <table class="tabla tabla--comparativa tabla--tarjetas" data-ordenable>
        <thead>
          <tr>
            <th scope="col">Proveedor y marca</th>
            <th scope="col" class="num">P.U. MXN sin IVA</th>
            ${varios ? html`<th scope="col" class="num">vs. mejor</th>` : ""}
            <th scope="col">Cotización</th>
            <th scope="col">Entrega</th>
            <th scope="col" data-sin-orden>Diferencias y notas</th>
            <th scope="col" data-sin-orden>PDF</th>
          </tr>
        </thead>
        <tbody>
          ${r.comparativa.map((o) => {
            const c = o.cotizacion;
            const extra = o.precio.puMXN / mejor - 1;
            const conversion = notaConversion(o);
            return html`<tr>
              <td data-valor="${c.proveedorObj?.nombre ?? c.proveedor}">
                ${enlaceProveedor(c.proveedorObj)}
                ${o.marca || o.modelo
                  ? html`<span class="bloque">${o.marca ? html`<span class="sin-corte">${o.marca}</span>` : ""}${o.marca && o.modelo ? " · " : ""}${o.modelo ? html`<span class="sin-corte">${o.modelo}</span>` : ""}</span>`
                  : html`<span class="tenue bloque">Marca no indicada</span>`}
                ${o.clave ? html`<span class="tenue bloque">Clave ${o.clave}</span>` : ""}
              </td>
              <td class="num" data-etiqueta="P.U. MXN sin IVA" data-valor="${o.precio.puMXN}">
                <span class="precio__valor">${dinero(o.precio.puMXN)}</span>
                ${conversion ? html`<span class="precio__nota">${conversion}</span>` : ""}
              </td>
              ${varios
                ? html`<td class="num" data-etiqueta="vs. mejor" data-valor="${extra}">${extra < 1e-9 ? html`<span class="insignia insignia--mejor">Mejor</span>` : porcentaje(extra)}</td>`
                : ""}
              <td data-etiqueta="Cotización" data-valor="${c.fecha}">
                <span class="sin-corte">${enlaceCotizacion(c, fechaCorta(c.fecha))} ${insigniaDivisa(c.moneda)}</span>
                <span class="tenue bloque sin-corte">${c.folio ? `Folio ${c.folio}` : c.id}</span>
                <span class="bloque">${insigniaVigencia(c)}</span>
              </td>
              <td data-etiqueta="Entrega">${c.condiciones.entrega ?? ""}</td>
              <td class="celda-notas" data-etiqueta="Diferencias y notas">
                ${o.diferencias.length ? html`<ul class="dif">${o.diferencias.map((d) => html`<li>${d}</li>`)}</ul>` : ""}
                ${o.notas ? html`<p class="tenue">${o.notas}</p>` : ""}
                <p class="tenue cita">“${o.descripcion}”</p>
              </td>
              <td class="celda-pdf">${enlacePDF(c.archivo)}</td>
            </tr>`;
          })}
        </tbody>
      </table>
    </div>
  </section>`;
}

function historial(p) {
  const r = p.resumen;
  if (r.n < 2) {
    return html`<section class="panel">
      <h2 class="panel__titulo">Historial de precios</h2>
      <p class="tenue">Solo hay una cotización. El historial aparecerá cuando se agregue otra.</p>
    </section>`;
  }
  // Variación respecto a la cotización anterior del mismo proveedor.
  const previa = new Map();
  const cambios = new Map();
  for (const o of r.historial) {
    const anterior = previa.get(o.cotizacion.proveedor);
    if (anterior && anterior.cotizacion.fecha !== o.cotizacion.fecha) cambios.set(o, o.precio.puMXN / anterior.precio.puMXN - 1);
    previa.set(o.cotizacion.proveedor, o);
  }
  return html`<section class="panel">
    <h2 class="panel__titulo">Historial de precios</h2>
    <p class="panel__sub">Precio unitario en MXN sin IVA por ${p.unidad}, una línea por proveedor. Pasa el cursor o usa las flechas para ver cada fecha.</p>
    <div data-grafica-historial></div>
    <div class="tabla-envoltura">
      <table class="tabla tabla--compacta" data-ordenable>
        <caption class="sr-solo">Todas las cotizaciones de este producto</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Proveedor</th>
            <th scope="col">Cotización</th>
            <th scope="col" class="num">Cantidad</th>
            <th scope="col" class="num">Precio cotizado</th>
            <th scope="col" class="num">P.U. MXN sin IVA</th>
            <th scope="col" class="num" title="Respecto a la cotización anterior del mismo proveedor">Cambio</th>
            <th scope="col">Vigencia</th>
          </tr>
        </thead>
        <tbody>
          ${r.ofertas.map((o) => {
            const c = o.cotizacion;
            const cambio = cambios.get(o);
            return html`<tr>
              <td class="sin-corte" data-valor="${c.fecha}">${fechaCorta(c.fecha)}</td>
              <td>${enlaceProveedor(c.proveedorObj)}</td>
              <td class="sin-corte">${enlaceCotizacion(c)} ${c.folio ? html`<span class="tenue">· ${c.folio}</span>` : ""}</td>
              <td class="num" data-valor="${o.cantidad ?? ""}">${o.cantidad != null ? `${numero(o.cantidad)} ${o.unidad ?? ""}` : ""}</td>
              <td class="num" data-valor="${o.precio.puOriginal}">
                ${dinero(o.precio.puOriginal, o.precio.moneda)}
                ${o.precio.ivaIncluido ? html`<span class="tenue bloque">IVA incluido</span>` : ""}
                ${o.precio.moneda !== "MXN" ? html`<span class="tenue bloque">TC ${numero(o.precio.tc)}</span>` : ""}
              </td>
              <td class="num" data-valor="${o.precio.puMXN}"><strong>${dinero(o.precio.puMXN)}</strong></td>
              <td class="num" data-valor="${cambio ?? ""}">
                ${cambio != null ? html`<span class="${cambio > 0 ? "sube" : cambio < 0 ? "baja" : ""}">${porcentaje(cambio)}</span>` : ""}
              </td>
              <td>${insigniaVigencia(c)}</td>
            </tr>`;
          })}
        </tbody>
      </table>
    </div>
  </section>`;
}

function seriesHistorial(p) {
  const grupos = new Map();
  for (const o of p.resumen.historial) {
    const id = o.cotizacion.proveedor;
    if (!grupos.has(id)) grupos.set(id, { id, nombre: o.cotizacion.proveedorObj?.nombre ?? id, puntos: [] });
    grupos.get(id).puntos.push({
      fecha: o.cotizacion.fecha,
      valor: o.precio.puMXN,
      detalle: [o.cotizacion.id, o.precio.moneda !== "MXN" ? `${dinero(o.precio.puOriginal, o.precio.moneda)} · TC ${numero(o.precio.tc)}` : ""]
        .filter(Boolean)
        .join(" · "),
    });
  }
  const series = [...grupos.values()];
  if (series.length <= MAX_SERIES) return series;
  // Más de 8 proveedores: el resto se agrupa en "Otros" (solo puntos, sin línea).
  const otros = { id: "otros", nombre: "Otros proveedores", sinLinea: true, puntos: [] };
  for (const s of series.slice(MAX_SERIES - 1)) otros.puntos.push(...s.puntos.map((pt) => ({ ...pt, detalle: `${s.nombre} · ${pt.detalle}` })));
  otros.puntos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return [...series.slice(0, MAX_SERIES - 1), otros];
}

export function vistaProducto(indice, { id }) {
  const p = indice.productos.get(id);
  if (!p) return null;
  const r = p.resumen;
  return {
    titulo: `${p.id} · ${p.nombre}`,
    seccion: "catalogo",
    lateral: true,
    nodoActivo: p.nodo?.id,
    html: html`${migas(indice, p.nodo, [p.id])}
      <header class="encabezado encabezado--producto">
        <p class="encabezado__sup"><span class="id">${p.id}</span> · ${p.tipo === "servicio" ? "Servicio" : "Producto"} · por ${p.unidad}</p>
        <h1>${p.nombre}</h1>
        ${p.descripcion && Object.keys(p.atributos).length ? html`<p class="encabezado__desc">${p.descripcion}</p>` : ""}
        <p class="encabezado__meta">
          ${r.n
            ? html`${plural(r.n, "cotización", "cotizaciones")} de ${plural(r.nProveedores, "proveedor", "proveedores")} · la más reciente del ${fechaCorta(r.ultimo.cotizacion.fecha)}`
            : "Sin cotizaciones todavía"}
          ${p.fichas.length ? html` · <a href="#datos-tecnicos" data-ancla>${plural(p.fichas.length, "ficha técnica", "fichas técnicas")}</a>` : ""}
        </p>
      </header>
      ${r.n ? tiles(p) : ""}
      <div class="rejilla-2">
        ${especificaciones(indice, p)}
        ${datosTecnicos(p)}
      </div>
      ${r.n ? comparativa(p) : vacio("Nadie ha cotizado este producto todavía.", "Las cotizaciones que lo incluyan aparecerán aquí, agrupadas por proveedor.")}
      ${r.n ? historial(p) : ""}
      ${p.notas ? html`<section class="panel"><h2 class="panel__titulo">Notas</h2><p>${p.notas}</p></section>` : ""}`,
    alMontar(raiz) {
      activarOrden(raiz);
      const contenedor = raiz.querySelector("[data-grafica-historial]");
      if (contenedor) return dibujarHistorial(contenedor, seriesHistorial(p), { unidad: p.unidad });
    },
  };
}
