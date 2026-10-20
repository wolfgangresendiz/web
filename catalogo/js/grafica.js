// ============================================================
//  Gráficas del catálogo: historial de precios y minigráficas
// ============================================================
//
// Historial: una línea por proveedor (2 px), puntos con anillo del color
// de la superficie, eje Y en MXN sin IVA. La guía vertical se ajusta a la
// fecha más cercana y el recuadro lista todas las cotizaciones de esa
// fecha. La tabla de cotizaciones debajo de la gráfica es su equivalente
// accesible: ningún valor depende solo del puntero.

import { dinero, dineroCompacto, diaMes, fechaCorta, mesCorto, aFecha } from "./util.js";

const NS = "http://www.w3.org/2000/svg";
export const MAX_SERIES = 8;

function el(nombre, atributos = {}, padre = null) {
  const nodo = document.createElementNS(NS, nombre);
  for (const [clave, valor] of Object.entries(atributos)) nodo.setAttribute(clave, valor);
  if (padre) padre.appendChild(nodo);
  return nodo;
}

// Escala "bonita" para el eje Y: 4 a 6 marcas en múltiplos de 1, 2 o 5.
function marcasY(min, max) {
  if (min === max) {
    const holgura = Math.abs(min) * 0.1 || 1;
    min -= holgura;
    max += holgura;
  }
  const crudo = (max - min) / 4;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * potencia).find((p) => p >= crudo);
  const inicio = Math.floor(min / paso) * paso;
  const fin = Math.ceil(max / paso) * paso;
  const marcas = [];
  for (let v = inicio; v <= fin + paso / 2; v += paso) marcas.push(Number(v.toFixed(10)));
  return marcas;
}

// Marcas del eje X: las fechas de los puntos si el periodo es corto,
// inicios de mes si es largo. Devuelve [{ t, texto }].
function marcasX(t0, t1, fechasPuntos) {
  const dias = (t1 - t0) / 864e5;
  if (dias <= 75) return fechasPuntos.map((f) => ({ t: aFecha(f).getTime(), texto: diaMes(f) }));
  const paso = Math.max(1, Math.ceil(dias / 30.44 / 5));
  const inicio = new Date(t0);
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1);
  const marcas = [];
  while (cursor.getTime() <= t1) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`;
    marcas.push({ t: cursor.getTime(), texto: mesCorto(iso) });
    cursor.setMonth(cursor.getMonth() + paso);
  }
  return marcas;
}

/**
 * series: [{ id, nombre, sinLinea?, puntos: [{ fecha, valor, detalle }] }]
 * Las series llegan ya en su orden estable (por primera cotización), así
 * cada proveedor conserva su color aunque cambie el número de series.
 */
export function dibujarHistorial(contenedor, series, { unidad = "" } = {}) {
  contenedor.classList.add("grafica-historial");
  contenedor.innerHTML = "";

  const leyenda = document.createElement("div");
  leyenda.className = "grafica-historial__leyenda";
  if (series.length >= 2) {
    series.forEach((serie, i) => {
      const item = document.createElement("span");
      item.className = "grafica-historial__clave";
      const linea = document.createElement("span");
      linea.className = "grafica-historial__linea";
      linea.style.background = `var(--serie-${i + 1})`;
      item.append(linea, document.createTextNode(serie.nombre));
      leyenda.appendChild(item);
    });
    contenedor.appendChild(leyenda);
  }

  const lienzo = document.createElement("div");
  lienzo.className = "grafica-historial__lienzo";
  contenedor.appendChild(lienzo);

  const recuadro = document.createElement("div");
  recuadro.className = "grafica-historial__recuadro";
  recuadro.hidden = true;
  lienzo.appendChild(recuadro);

  const todos = series.flatMap((s, i) => s.puntos.map((p) => ({ ...p, serie: i, nombreSerie: s.nombre })));
  const fechas = [...new Set(todos.map((p) => p.fecha))].sort();

  let seleccion = -1;

  function render() {
    const ancho = Math.max(320, lienzo.clientWidth || 640);
    const alto = ancho < 520 ? 220 : 260;
    const etiquetasFinales = series.length <= 4;
    const m = { arriba: 14, derecha: etiquetasFinales ? (ancho < 520 ? 64 : 84) : 16, abajo: 28, izquierda: 58 };

    const valores = todos.map((p) => p.valor);
    const ticksY = marcasY(Math.min(...valores), Math.max(...valores));
    const y0 = ticksY[0];
    const y1 = ticksY[ticksY.length - 1];

    let t0 = aFecha(fechas[0]).getTime();
    let t1 = aFecha(fechas[fechas.length - 1]).getTime();
    if (t0 === t1) {
      t0 -= 30 * 864e5;
      t1 += 30 * 864e5;
    }
    const margenT = (t1 - t0) * 0.04;
    const dominio = [t0 - margenT, t1 + margenT];

    const x = (t) => m.izquierda + ((t - dominio[0]) / (dominio[1] - dominio[0])) * (ancho - m.izquierda - m.derecha);
    const y = (v) => m.arriba + (1 - (v - y0) / (y1 - y0)) * (alto - m.arriba - m.abajo);

    const svg = el("svg", {
      viewBox: `0 0 ${ancho} ${alto}`,
      width: ancho,
      height: alto,
      role: "img",
      tabindex: "0",
      "aria-label": `Historial de precios en MXN sin IVA${unidad ? ` por ${unidad}` : ""}. Usa las flechas para recorrer las fechas.`,
    });

    const rejilla = el("g", { class: "gh-rejilla" }, svg);
    for (const v of ticksY) {
      el("line", { x1: m.izquierda, x2: ancho - m.derecha, y1: y(v), y2: y(v) }, rejilla);
      const t = el("text", { x: m.izquierda - 8, y: y(v), class: "gh-tick gh-tick--y", dy: "0.32em" }, svg);
      t.textContent = dineroCompacto(v);
    }

    let ultimaX = -Infinity;
    for (const marca of marcasX(t0, t1, fechas)) {
      const px = x(marca.t);
      if (px < m.izquierda || px > ancho - m.derecha || px - ultimaX < 56) continue;
      ultimaX = px;
      const t = el("text", { x: px, y: alto - 8, class: "gh-tick gh-tick--x" }, svg);
      t.textContent = marca.texto;
    }
    el("line", { x1: m.izquierda, x2: ancho - m.derecha, y1: alto - m.abajo, y2: alto - m.abajo, class: "gh-base" }, svg);

    // Líneas y puntos por proveedor.
    const finales = [];
    series.forEach((serie, i) => {
      const color = `var(--serie-${i + 1})`;
      const puntos = serie.puntos.map((p) => [x(aFecha(p.fecha).getTime()), y(p.valor), p]);
      if (puntos.length > 1 && !serie.sinLinea) {
        el(
          "polyline",
          { points: puntos.map(([px, py]) => `${px},${py}`).join(" "), class: "gh-linea", stroke: color },
          svg,
        );
      }
      for (const [px, py] of puntos) el("circle", { cx: px, cy: py, r: 4.5, class: "gh-punto", fill: color }, svg);
      const [ux, uy, up] = puntos[puntos.length - 1];
      finales.push({ x: ux, y: uy, valor: up.valor });
    });

    // Etiqueta con el último precio de cada proveedor, solo si no se encima con otra.
    if (etiquetasFinales) {
      for (const f of finales) {
        if (finales.some((g) => g !== f && Math.abs(g.y - f.y) < 14)) continue;
        const t = el("text", { x: ancho - m.derecha + 10, y: f.y, dy: "0.32em", class: "gh-final" }, svg);
        t.textContent = dineroCompacto(f.valor);
      }
    }

    // Capa de interacción: guía vertical + recuadro.
    const guia = el("line", { class: "gh-guia", y1: m.arriba, y2: alto - m.abajo, visibility: "hidden" }, svg);
    const zona = el(
      "rect",
      { x: m.izquierda, y: 0, width: ancho - m.izquierda - m.derecha, height: alto, fill: "transparent" },
      svg,
    );

    const mostrar = (indiceFecha) => {
      seleccion = indiceFecha;
      const fecha = fechas[indiceFecha];
      const px = x(aFecha(fecha).getTime());
      guia.setAttribute("x1", px);
      guia.setAttribute("x2", px);
      guia.setAttribute("visibility", "visible");
      const puntos = todos.filter((p) => p.fecha === fecha).sort((a, b) => a.valor - b.valor);
      recuadro.replaceChildren();
      const titulo = document.createElement("div");
      titulo.className = "grafica-historial__fecha";
      titulo.textContent = fechaCorta(fecha);
      recuadro.appendChild(titulo);
      for (const p of puntos) {
        const fila = document.createElement("div");
        fila.className = "grafica-historial__fila";
        const clave = document.createElement("span");
        clave.className = "grafica-historial__linea";
        clave.style.background = `var(--serie-${p.serie + 1})`;
        const valor = document.createElement("strong");
        valor.textContent = dinero(p.valor);
        const nombre = document.createElement("span");
        nombre.textContent = p.nombreSerie;
        fila.append(clave, valor, nombre);
        if (p.detalle) {
          const detalle = document.createElement("small");
          detalle.textContent = p.detalle;
          fila.appendChild(detalle);
        }
        recuadro.appendChild(fila);
      }
      recuadro.hidden = false;
      const anchoRecuadro = recuadro.offsetWidth;
      const izquierda = px + 14 + anchoRecuadro > ancho ? px - 14 - anchoRecuadro : px + 14;
      recuadro.style.left = `${Math.max(0, izquierda)}px`;
      recuadro.style.top = `${m.arriba}px`;
    };
    const ocultar = () => {
      seleccion = -1;
      guia.setAttribute("visibility", "hidden");
      recuadro.hidden = true;
    };
    const masCercana = (px) => {
      let mejor = 0;
      fechas.forEach((f, i) => {
        if (Math.abs(x(aFecha(f).getTime()) - px) < Math.abs(x(aFecha(fechas[mejor]).getTime()) - px)) mejor = i;
      });
      return mejor;
    };

    zona.addEventListener("pointermove", (evento) => {
      const caja = svg.getBoundingClientRect();
      mostrar(masCercana(((evento.clientX - caja.left) / caja.width) * ancho));
    });
    zona.addEventListener("pointerleave", ocultar);
    svg.addEventListener("keydown", (evento) => {
      if (evento.key === "ArrowRight" || evento.key === "ArrowLeft") {
        evento.preventDefault();
        const paso = evento.key === "ArrowRight" ? 1 : -1;
        mostrar(Math.min(fechas.length - 1, Math.max(0, (seleccion < 0 ? (paso > 0 ? -1 : fechas.length) : seleccion) + paso)));
      } else if (evento.key === "Escape") ocultar();
    });
    svg.addEventListener("focus", () => mostrar(seleccion >= 0 ? seleccion : fechas.length - 1));
    svg.addEventListener("blur", ocultar);

    lienzo.querySelector("svg")?.remove();
    lienzo.prepend(svg);
    if (seleccion >= 0) mostrar(seleccion);
  }

  render();
  let anchoPrevio = lienzo.clientWidth;
  const observador = new ResizeObserver(() => {
    if (Math.abs(lienzo.clientWidth - anchoPrevio) < 8) return;
    anchoPrevio = lienzo.clientWidth;
    render();
  });
  observador.observe(lienzo);
  return () => observador.disconnect();
}

// Minigráfica para tablas: trazo tenue y el último punto resaltado.
export function minigrafica(valores, { ancho = 64, alto = 20 } = {}) {
  if (valores.length < 2) return "";
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;
  const px = (i) => 2 + (i / (valores.length - 1)) * (ancho - 4);
  const py = (v) => 3 + (1 - (v - min) / rango) * (alto - 6);
  const puntos = valores.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const ultimo = valores.length - 1;
  return `<svg class="mini" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" aria-hidden="true"><polyline points="${puntos}"/><circle cx="${px(ultimo).toFixed(1)}" cy="${py(valores[ultimo]).toFixed(1)}" r="2.5"/></svg>`;
}
