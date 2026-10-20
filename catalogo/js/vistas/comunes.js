// ============================================================
//  Piezas comunes de las vistas
// ============================================================

import {
  html,
  crudo,
  dinero,
  numero,
  fechaCorta,
  urlDrive,
  digitosTelefono,
  compararTexto,
  valorNumerico,
  normalizar,
} from "../util.js";
import { MONEDA_BASE } from "../modelo.js";

// ---- Rutas (hash) ----

export const ruta = {
  inicio: () => "#/",
  categoria: (id) => `#/categoria/${encodeURIComponent(id)}`,
  producto: (id) => `#/producto/${encodeURIComponent(id)}`,
  cotizaciones: () => "#/cotizaciones",
  cotizacion: (id) => `#/cotizacion/${encodeURIComponent(id)}`,
  proveedores: () => "#/proveedores",
  proveedor: (id) => `#/proveedor/${encodeURIComponent(id)}`,
  fichas: () => "#/fichas",
  ficha: (id) => `#/ficha/${encodeURIComponent(id)}`,
  buscar: (q) => `#/buscar?q=${encodeURIComponent(q)}`,
  novedades: () => "#/novedades",
};

// ---- Enlaces ----

export const enlaceProducto = (p) => (p ? html`<a href="${ruta.producto(p.id)}">${p.nombre}</a>` : "");
export const enlaceProveedor = (p) => (p ? html`<a href="${ruta.proveedor(p.id)}">${p.nombre}</a>` : "");
export const enlaceCotizacion = (c, texto = c?.id) => (c ? html`<a href="${ruta.cotizacion(c.id)}">${texto}</a>` : "");

export function enlacePDF(archivo, texto = "PDF") {
  if (!archivo?.drive_id) return html`<span class="tenue">Sin PDF</span>`;
  return html`<a class="enlace-pdf" href="${urlDrive(archivo.drive_id)}" target="_blank" rel="noopener"
    title="${archivo.nombre ? `Abrir ${archivo.nombre} en Google Drive` : "Abrir en Google Drive"}">${crudo(ICONO_PDF)}<span>${texto}</span></a>`;
}

const ICONO_PDF =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 1.5h5.2L13 5.3v9.2H4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 1.8V5.6h3.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

// ---- Migas de pan ----

export function migas(indice, nodo, extra = []) {
  const pasos = [html`<a href="${ruta.inicio()}">Catálogo</a>`];
  if (nodo) {
    for (const id of nodo.ruta) {
      const n = indice.nodos.get(id);
      pasos.push(html`<a href="${ruta.categoria(n.id)}">${n.nombre}</a>`);
    }
  }
  for (const paso of extra) pasos.push(html`<span aria-current="page">${paso}</span>`);
  return html`<nav class="migas" aria-label="Ubicación">${pasos.map((p, i) => html`${i ? crudo('<span class="migas__sep" aria-hidden="true">›</span>') : ""}${p}`)}</nav>`;
}

// ---- Insignias ----

export function insigniaVigencia(cotizacion) {
  if (cotizacion.estado === "vigente")
    return html`<span class="insignia insignia--vigente" title="Vigente hasta ${fechaCorta(cotizacion.vigencia)}">Vigente</span>`;
  if (cotizacion.estado === "vencida")
    return html`<span class="insignia insignia--vencida" title="Venció el ${fechaCorta(cotizacion.vigencia)}">Vencida</span>`;
  return html`<span class="insignia insignia--neutra" title="La cotización no indica vigencia">Sin vigencia</span>`;
}

export const insigniaDivisa = (moneda) =>
  moneda && moneda !== MONEDA_BASE ? html`<span class="insignia insignia--divisa">${moneda}</span>` : "";

// Marca y modelo sin partir códigos como "A-2361" en dos renglones.
export function marcaModelo(partida) {
  const partes = [partida.marca, partida.modelo].filter(Boolean);
  return html`${partes.map((t, i) => html`${i ? " · " : ""}<span class="sin-corte">${t}</span>`)}`;
}

// ---- Precios ----

// Precio normalizado (MXN sin IVA por unidad del producto) con la unidad.
export function precioMXN(oferta, unidad) {
  return html`<span class="precio"><span class="precio__valor">${dinero(oferta.precio.puMXN)}</span>${
    unidad ? html`<span class="precio__unidad"> /${unidad}</span>` : ""
  }</span>`;
}

// Cómo se llegó al precio en MXN: divisa original, fecha y tipo de cambio,
// IVA y equivalencia de unidades. Vacío si no hubo conversión alguna.
export function notaConversion(oferta, { corta = false } = {}) {
  const p = oferta.precio;
  const c = oferta.cotizacion;
  const partes = [];
  if (p.moneda !== MONEDA_BASE) {
    const tc = c.tipo_cambio ?? {};
    partes.push(
      corta
        ? `${dinero(p.puOriginal, p.moneda)} el ${fechaCorta(c.fecha)} · TC ${numero(p.tc)}`
        : `Cotizado en ${p.moneda} el ${fechaCorta(c.fecha)}: ${dinero(p.puOriginal, p.moneda)}. TC ${numero(p.tc)}${
            tc.fecha ? ` del ${fechaCorta(tc.fecha)}` : ""
          }${tc.fuente ? ` (${tc.fuente})` : ""}`,
    );
  }
  if (p.ivaIncluido) partes.push(corta ? "IVA incl. descontado" : `El documento incluía IVA (${numero(p.tasa * 100)} %); aquí se muestra sin IVA`);
  if (p.equivalencia !== 1)
    partes.push(
      corta
        ? `1 ${oferta.unidad ?? "unidad"} = ${numero(p.equivalencia)} ${oferta.productoObj?.unidad ?? ""}`
        : `Cotizado por ${oferta.unidad ?? "unidad"} (1 ${oferta.unidad ?? "unidad"} = ${numero(p.equivalencia)} ${oferta.productoObj?.unidad ?? "unidades"})`,
    );
  return partes.join(corta ? " · " : ". ");
}

// ---- Contactos ----

export function medios(persona) {
  const items = [];
  if (persona.telefono) items.push(html`<a href="tel:${persona.telefono.replace(/[^\d+]/g, "")}">${persona.telefono}</a>`);
  if (persona.celular) {
    items.push(html`<a href="tel:${persona.celular.replace(/[^\d+]/g, "")}">${persona.celular}</a>
      <a class="whatsapp" href="https://wa.me/${digitosTelefono(persona.celular)}" target="_blank" rel="noopener">WhatsApp</a>`);
  }
  if (persona.correo) items.push(html`<a href="mailto:${persona.correo}">${persona.correo}</a>`);
  return items.length ? html`<span class="medios">${items.map((i) => html`<span>${i}</span>`)}</span>` : "";
}

// ---- Estados vacíos ----

export const vacio = (titulo, detalle = "") =>
  html`<div class="vacio"><p class="vacio__titulo">${titulo}</p>${detalle ? html`<p class="vacio__detalle">${detalle}</p>` : ""}</div>`;

// ---- Tablas ordenables ----
//
// Las celdas pueden traer data-valor (número o texto) para ordenar por
// algo distinto de lo que se ve (p. ej. el precio sin formato).

export function activarOrden(raiz) {
  for (const tabla of raiz.querySelectorAll("table[data-ordenable]")) {
    const encabezados = [...tabla.tHead.rows[0].cells];
    encabezados.forEach((th, columna) => {
      if (th.hasAttribute("data-sin-orden")) return;
      th.classList.add("ordenable");
      th.tabIndex = 0;
      th.setAttribute("aria-sort", "none");
      const ordenar = () => {
        const asc = th.getAttribute("aria-sort") !== "ascending";
        encabezados.forEach((otro) => otro.setAttribute("aria-sort", "none"));
        th.setAttribute("aria-sort", asc ? "ascending" : "descending");
        const cuerpo = tabla.tBodies[0];
        const filas = [...cuerpo.rows];
        const valor = (fila) => {
          const celda = fila.cells[columna];
          return celda?.dataset.valor ?? celda?.textContent.trim() ?? "";
        };
        filas.sort((a, b) => {
          const va = valor(a);
          const vb = valor(b);
          const vacioA = va === "";
          const vacioB = vb === "";
          if (vacioA !== vacioB) return vacioA ? 1 : -1; // los vacíos siempre al final
          const na = Number(va);
          const nb = Number(vb);
          const r = va !== "" && vb !== "" && !Number.isNaN(na) && !Number.isNaN(nb) ? na - nb : compararTexto(va, vb);
          return asc ? r : -r;
        });
        cuerpo.append(...filas);
      };
      th.addEventListener("click", ordenar);
      th.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ordenar();
        }
      });
    });
  }
}

// ---- Filtro de filas por texto y selectores ----
//
// Cada fila filtrable lleva data-texto (texto normalizado) y, por cada
// selector, data-f-<clave> con su valor. Los selectores llevan data-filtro="<clave>".

export function activarFiltros(raiz, { alCambiar } = {}) {
  const entradas = [...raiz.querySelectorAll("[data-filtro]")];
  const filas = [...raiz.querySelectorAll("[data-fila]")];
  const contador = raiz.querySelector("[data-contador]");
  if (!entradas.length) return;

  const aplicar = () => {
    const criterios = entradas.map((e) => ({
      clave: e.dataset.filtro,
      valor: e.type === "checkbox" ? (e.checked ? "1" : "") : e.value,
    }));
    let visibles = 0;
    for (const fila of filas) {
      const ok = criterios.every(({ clave, valor }) => {
        if (!valor) return true;
        if (clave === "texto") {
          return normalizar(valor)
            .split(/\s+/)
            .filter(Boolean)
            .every((t) => fila.dataset.texto?.includes(t));
        }
        return (fila.dataset[`f${clave[0].toUpperCase()}${clave.slice(1)}`] ?? "").split("|").includes(valor);
      });
      fila.hidden = !ok;
      if (ok) visibles++;
    }
    for (const grupo of raiz.querySelectorAll("[data-grupo]")) {
      grupo.hidden = !grupo.querySelector("[data-fila]:not([hidden])");
    }
    if (contador) contador.textContent = `${numero(visibles)} de ${numero(filas.length)}`;
    alCambiar?.(visibles);
  };

  for (const e of entradas) e.addEventListener(e.tagName === "SELECT" || e.type === "checkbox" ? "change" : "input", aplicar);
  aplicar();
}

// Opciones de un <select> a partir de valores con conteo, en orden natural.
export function opciones(valores, todos = "Todos") {
  const conteo = new Map();
  for (const v of valores) if (v) conteo.set(v, (conteo.get(v) ?? 0) + 1);
  const lista = [...conteo.entries()].sort((a, b) => {
    const na = valorNumerico(a[0]);
    const nb = valorNumerico(b[0]);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return compararTexto(a[0], b[0]);
  });
  return html`<option value="">${todos}</option>${lista.map(([v, n]) => html`<option value="${v}">${v} (${numero(n)})</option>`)}`;
}

// Atributo data-f-* seguro: los valores múltiples se separan con "|".
export const valorFiltro = (valores) => [].concat(valores).filter(Boolean).map((v) => String(v).replace(/\|/g, "/")).join("|");
