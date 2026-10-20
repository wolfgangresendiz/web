// ============================================================
//  Fichas técnicas
// ============================================================
//
// Cada ficha pertenece a un producto y siempre remite a su PDF en Drive;
// los datos extraídos son un resumen para consulta rápida.

import { html, fechaCorta, normalizar, numero } from "../util.js";
import { rutaNombres } from "../modelo.js";
import { ruta, vacio, enlacePDF, activarOrden, activarFiltros, opciones } from "./comunes.js";

export function vistaFichas(indice) {
  const lista = [...indice.fichas.values()].sort((a, b) => (a.titulo ?? "").localeCompare(b.titulo ?? "", "es"));
  return {
    titulo: "Fichas técnicas",
    seccion: "fichas",
    html: html`<header class="encabezado">
        <h1>Fichas técnicas</h1>
        <p class="encabezado__desc">Documentos técnicos asociados a productos del catálogo. Cada dato remite a su PDF en Drive.</p>
      </header>
      ${lista.length
        ? html`<div class="filtros" role="group" aria-label="Filtrar fichas">
              <label class="filtros__campo filtros__campo--texto">
                <span>Filtrar</span>
                <input type="search" data-filtro="texto" placeholder="Producto, fabricante, modelo, dato…" autocomplete="off">
              </label>
              <label class="filtros__campo">
                <span>Fabricante</span>
                <select data-filtro="fabricante">${opciones(lista.map((f) => f.fabricante))}</select>
              </label>
              <span class="filtros__contador" data-contador aria-live="polite"></span>
            </div>
            <div class="tabla-envoltura">
              <table class="tabla" data-ordenable>
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Ficha</th>
                    <th scope="col">Producto</th>
                    <th scope="col">Fabricante</th>
                    <th scope="col">Modelo</th>
                    <th scope="col" class="num">Datos</th>
                    <th scope="col" data-sin-orden>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  ${lista.map(
                    (f) => html`<tr
                      data-fila
                      data-texto="${normalizar([f.id, f.titulo, f.fabricante, f.modelo, f.productoObj?.nombre, ...f.datos.map((d) => `${d.parametro} ${d.valor}`)].join(" "))}"
                      data-f-fabricante="${f.fabricante ?? ""}"
                    >
                      <td class="id"><a href="${ruta.ficha(f.id)}">${f.id}</a></td>
                      <td><a href="${ruta.ficha(f.id)}">${f.titulo}</a></td>
                      <td>${f.productoObj ? html`<a href="${ruta.producto(f.productoObj.id)}">${f.productoObj.nombre}</a>` : ""}</td>
                      <td>${f.fabricante ?? ""}</td>
                      <td>${f.modelo ?? ""}</td>
                      <td class="num">${numero(f.datos.length)}</td>
                      <td>${enlacePDF(f.archivo)}</td>
                    </tr>`,
                  )}
                </tbody>
              </table>
            </div>`
        : vacio("Aún no hay fichas técnicas.", "Guarda la ficha en la Bandeja de entrada de Drive y pídele a Claude que la asocie al producto.")}`,
    alMontar(raiz) {
      activarOrden(raiz);
      activarFiltros(raiz);
    },
  };
}

export function vistaFicha(indice, { id }) {
  const f = indice.fichas.get(id);
  if (!f) return null;
  const p = f.productoObj;
  return {
    titulo: `${f.id} · ${f.titulo}`,
    seccion: "fichas",
    html: html`<nav class="migas" aria-label="Ubicación">
        <a href="${ruta.fichas()}">Fichas técnicas</a><span class="migas__sep" aria-hidden="true">›</span><span aria-current="page">${f.id}</span>
      </nav>
      <header class="encabezado encabezado--accion">
        <div>
          <p class="encabezado__sup"><span class="id">${f.id}</span> · Ficha técnica</p>
          <h1>${f.titulo}</h1>
          <p class="encabezado__meta">${[f.fabricante, f.modelo, f.revision, f.fecha ? fechaCorta(f.fecha) : ""].filter(Boolean).join(" · ")}</p>
        </div>
        <div class="encabezado__acciones">${enlacePDF(f.archivo, "Abrir PDF en Drive")}</div>
      </header>
      ${p
        ? html`<section class="panel panel--enlace">
            <p class="tenue">Producto asociado</p>
            <p><a href="${ruta.producto(p.id)}"><strong>${p.nombre}</strong></a> <span class="id tenue">${p.id}</span></p>
            <p class="tenue">${rutaNombres(indice, p.nodo).join(" › ")}</p>
          </section>`
        : ""}
      <section class="panel">
        <h2 class="panel__titulo">Datos técnicos</h2>
        ${f.datos.length
          ? html`<table class="tabla tabla--compacta tabla--datos">
              <thead><tr><th scope="col">Parámetro</th><th scope="col">Valor</th><th scope="col" class="num">Página</th></tr></thead>
              <tbody>
                ${f.datos.map((d) => html`<tr><th scope="row">${d.parametro}</th><td>${d.valor}</td><td class="num tenue">${d.pagina ?? ""}</td></tr>`)}
              </tbody>
            </table>`
          : html`<p class="tenue">Sin datos extraídos; consulta el PDF.</p>`}
        <p class="ficha__fuente">Fuente: ${enlacePDF(f.archivo, f.archivo?.nombre || "PDF en Drive")}</p>
      </section>
      ${f.notas ? html`<section class="panel"><h2 class="panel__titulo">Notas</h2><p>${f.notas}</p></section>` : ""}`,
    alMontar(raiz) {
      activarOrden(raiz);
    },
  };
}
