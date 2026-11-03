// ============================================================
//  Gráfica Velocidad (V) vs Caudal (Q) para un diámetro fijo
// ============================================================
//
//  Gráfica cartesiana SVG, técnica y minimalista, con:
//   - Recta verde ascendente: Q = k · V  (k depende del diámetro).
//   - Punto azul destacado: el resultado calculado.
//   - Cuatro líneas de referencia normativas con su punto gris de
//     intersección, el caudal encima y la etiqueta/valor debajo.
//
//  Interactividad (todo con estándares del navegador, sin librerías):
//   - Tooltip con línea guía al pasar el cursor (mouse).
//   - Arrastrar el punto azul (mouse) mueve la velocidad en vivo.
//   - Un slider externo (#v-slider) hace lo mismo; ideal en móvil.
//
//  API global:
//   - window.dibujarGraficaCaudal(dMetros, vCalc, qCalcM3s)
//   - window.configurarGraficaCaudal({ alFijarVelocidad })

(function () {
  const NS = "http://www.w3.org/2000/svg";

  // Límites de referencia (velocidad en m/s), de izquierda a derecha.
  const LIMITES = [
    { etiqueta: "IWA min", v: 0.06 },
    { etiqueta: "CONAGUA min", v: 0.3 },
    { etiqueta: "CONAGUA max concreto", v: 3.0 },
    { etiqueta: "CONAGUA max", v: 5.0 },
  ];

  // Estado del módulo.
  let vMaxTope = 6;                    // el eje X solo crece: evita "saltos" al interactuar
  let cfg = { alFijarVelocidad: null }; // callback para fijar la velocidad (lo da caudal.js)
  let estado = null;                   // geometría de la gráfica actual (para la interacción)
  let arrastrando = false;

  // Crea un nodo SVG con atributos (y texto opcional).
  function el(nombre, attrs = {}, texto) {
    const nodo = document.createElementNS(NS, nombre);
    for (const clave in attrs) nodo.setAttribute(clave, attrs[clave]);
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  const fmt = (q) => q.toFixed(2);

  // Paso "bonito" (1, 2, 5 · 10ⁿ) para las marcas del eje Y.
  function pasoBonito(max, divisiones) {
    const bruto = max / divisiones;
    const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    const n = bruto / mag;
    const paso = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
    return paso * mag;
  }

  // ---- Dibujo de la gráfica -------------------------------------------------
  // d en metros, vCalc en m/s, qCalcM3s en m³/s.
  function dibujar(dMetros, vCalc, qCalcM3s) {
    const cont = document.querySelector("#grafica-lienzo");
    if (!cont) return;

    // Pendiente de la recta: Q(L/s) = k · V(m/s) con el diámetro fijo.
    const k = ((Math.PI * dMetros ** 2) / 4) * 1000; // L/s por cada m/s
    const qCalc = qCalcM3s * 1000; // caudal calculado, en L/s

    // Escalas (el eje X solo crece para que arrastrar no reescale de golpe).
    vMaxTope = Math.max(vMaxTope, Math.ceil(vCalc * 1.12));
    const vMax = vMaxTope;
    const stepY = pasoBonito(k * vMax, 5);
    const qMax = Math.ceil((k * vMax) / stepY) * stepY || stepY;

    // Geometría del lienzo.
    const W = 700, H = 510;
    const m = { izq: 62, der: 22, arr: 46, aba: 130 };
    const x0 = m.izq, x1 = W - m.der, y0 = m.arr, y1 = H - m.aba;
    const X = (v) => x0 + (v / vMax) * (x1 - x0); // velocidad -> px
    const Y = (q) => y1 - (q / qMax) * (y1 - y0); // caudal -> px

    const svg = el("svg", {
      viewBox: `0 0 ${W} ${H}`,
      role: "img",
      "aria-label": `Velocidad contra caudal: resultado Q = ${fmt(qCalc)} litros por segundo a ${fmt(vCalc)} metros por segundo.`,
    });
    svg.appendChild(el("title", {}, "Velocidad V vs Caudal Q"));

    // Rejilla horizontal + marcas del eje Y.
    for (let q = 0; q <= qMax + 1e-9; q += stepY) {
      const y = Y(q);
      svg.appendChild(el("line", { x1: x0, y1: y, x2: x1, y2: y, class: "g-rejilla" }));
      svg.appendChild(el("text", { x: x0 - 8, y: y + 4, class: "g-tick g-tick--y" }, fmt(q)));
    }
    // Rejilla vertical + marcas enteras del eje X.
    for (let v = 0; v <= vMax + 1e-9; v += 1) {
      const x = X(v);
      svg.appendChild(el("line", { x1: x, y1: y0, x2: x, y2: y1, class: "g-rejilla" }));
      svg.appendChild(el("text", { x, y: y1 + 16, class: "g-tick g-tick--x" }, String(v)));
    }

    // Ejes principales.
    svg.appendChild(el("line", { x1: x0, y1, x2: x1, y2: y1, class: "g-eje" }));
    svg.appendChild(el("line", { x1: x0, y1: y0, x2: x0, y2: y1, class: "g-eje" }));

    // Títulos de los ejes.
    svg.appendChild(el("text", { x: (x0 + x1) / 2, y: H - 8, class: "g-eje-titulo" }, "Velocidad V (m/s)"));
    const cy = (y0 + y1) / 2;
    svg.appendChild(el("text", { x: 16, y: cy, class: "g-eje-titulo", transform: `rotate(-90 16 ${cy})` }, "Caudal Q (L/s)"));

    // Recta V–Q (verde, de origen a vMax).
    svg.appendChild(el("line", { x1: X(0), y1: Y(0), x2: X(vMax), y2: Y(k * vMax), class: "g-recta" }));

    // Posición del punto azul del resultado (se dibuja al final, al frente).
    const bx = X(vCalc), by = Y(qCalc);

    // Líneas de referencia + punto gris en cada intersección.
    LIMITES.forEach((lim, i) => {
      if (lim.v > vMax) return;
      const x = X(lim.v);
      const qRef = k * lim.v;
      const y = Y(qRef);

      // Línea vertical punteada: de la base a la recta.
      svg.appendChild(el("line", { x1: x, y1, x2: x, y2: y, class: "g-ref" }));
      // Punto gris (con tooltip nativo del navegador).
      const punto = el("circle", { cx: x, cy: y, r: 4, class: "g-punto-ref" });
      punto.appendChild(el("title", {}, `${lim.etiqueta} — ${lim.v.toFixed(2)} m/s · Q = ${fmt(qRef)} L/s`));
      svg.appendChild(punto);

      // Caudal encima del punto. Si choca con el punto azul (misma V),
      // se coloca DEBAJO para que ambas etiquetas se lean (una arriba, otra abajo).
      const choca = Math.abs(x - bx) < 46 && Math.abs(y - by) < 24;
      let qy;
      if (choca) {
        qy = y + 18; // el azul queda arriba, esta referencia abajo
      } else {
        const dy = i % 2 === 0 ? -12 : -26; // escalonado para los cercanos (0.06 y 0.30)
        qy = Math.max(y + dy, 14);
      }
      svg.appendChild(el("text", { x, y: qy, class: "g-q-ref" }, `Q = ${fmt(qRef)} L/s`));

      // Etiqueta y valor debajo del eje (dos filas escalonadas).
      const baseY = i % 2 === 0 ? y1 + 34 : y1 + 66;
      svg.appendChild(el("text", { x, y: baseY, class: "g-lim-nombre" }, lim.etiqueta));
      svg.appendChild(el("text", { x, y: baseY + 15, class: "g-lim-valor" }, `${lim.v.toFixed(2)} m/s`));
    });

    // Punto azul del resultado (destacado, al frente).
    svg.appendChild(el("line", { x1: bx, y1, x2: bx, y2: by, class: "g-ref g-ref--azul" }));
    const azul = el("circle", { cx: bx, cy: by, r: 7, class: "g-punto" });
    azul.appendChild(el("title", {}, `Resultado — V = ${fmt(vCalc)} m/s · Q = ${fmt(qCalc)} L/s`));
    svg.appendChild(azul);
    svg.appendChild(el("text", { x: bx, y: Math.max(by - 14, 14), class: "g-q-punto" }, `Q = ${fmt(qCalc)} L/s`));

    // Capa vacía para el crosshair/tooltip de hover.
    const hover = el("g", { class: "g-hover" });
    svg.appendChild(hover);

    // Reemplaza el contenido y revela gráfica + notas.
    cont.replaceChildren(svg);
    const sec = document.querySelector("#grafica");
    const notas = document.querySelector("#grafica-notas");
    if (sec) sec.hidden = false;
    if (notas) notas.hidden = false;

    // Guarda la geometría actual para la interacción.
    estado = { svg, hover, x0, x1, y0, y1, vMax, k, X, Y };

    // Sincroniza el slider (sin disparar su evento).
    const slider = document.querySelector("#v-slider");
    if (slider) {
      slider.max = String(vMax);
      slider.value = String(Math.min(vCalc, vMax));
    }
    const salida = document.querySelector("#v-slider-val");
    if (salida) salida.textContent = `${fmt(vCalc)} m/s`;

    inicializarInteraccion(cont);
    inicializarSlider();
  }

  // ---- Interacción ----------------------------------------------------------

  // Convierte las coordenadas del puntero a coordenadas del viewBox del SVG.
  function puntoSVG(e) {
    const svg = estado && estado.svg;
    if (!svg || !svg.getScreenCTM) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(ctm.inverse());
  }

  // Velocidad (m/s) correspondiente a la posición X del cursor.
  function velocidadDesdeCursor(e) {
    const loc = puntoSVG(e);
    if (!loc) return null;
    const { x0, x1, vMax } = estado;
    const t = (loc.x - x0) / (x1 - x0);
    return Math.max(0, Math.min(vMax, t * vMax));
  }

  // Dibuja la línea guía + tooltip en la posición del cursor (solo mouse).
  function mostrarCrosshair(e) {
    if (!estado) return;
    const loc = puntoSVG(e);
    if (!loc) return;
    const { x0, x1, y0, y1, vMax, k, X, Y, hover } = estado;

    // Fuera del área de trazado: limpia.
    if (loc.x < x0 || loc.x > x1 || loc.y < y0 || loc.y > y1) {
      hover.replaceChildren();
      return;
    }

    const v = ((loc.x - x0) / (x1 - x0)) * vMax;
    const q = k * v;
    const px = X(v), py = Y(q);

    const w = 128, h = 40;
    let tx = px + 12;
    if (tx + w > x1) tx = px - 12 - w; // voltea la caja cerca del borde derecho
    let ty = py - h - 10;
    if (ty < y0) ty = py + 12;

    hover.replaceChildren(
      el("line", { x1: px, y1, x2: px, y2: py, class: "g-hover-linea" }),
      el("circle", { cx: px, cy: py, r: 4, class: "g-hover-pt" }),
      el("rect", { x: tx, y: ty, width: w, height: h, rx: 8, class: "g-hover-caja" }),
      el("text", { x: tx + 10, y: ty + 16, class: "g-hover-txt" }, `V = ${fmt(v)} m/s`),
      el("text", { x: tx + 10, y: ty + 31, class: "g-hover-txt" }, `Q = ${fmt(q)} L/s`),
    );
  }

  // Conecta los eventos de puntero al contenedor (una sola vez).
  function inicializarInteraccion(cont) {
    if (cont.dataset.interactivo) return;
    cont.dataset.interactivo = "1";

    cont.addEventListener("pointerdown", (e) => {
      // En táctil no arrastramos (se usa el slider y se permite el scroll).
      if (e.pointerType === "touch" || !estado || !cfg.alFijarVelocidad) return;
      arrastrando = true;
      cont.setPointerCapture(e.pointerId);
      estado.hover.replaceChildren();
      const v = velocidadDesdeCursor(e);
      if (v != null) cfg.alFijarVelocidad(v);
    });

    cont.addEventListener("pointermove", (e) => {
      if (arrastrando) {
        const v = velocidadDesdeCursor(e);
        if (v != null && cfg.alFijarVelocidad) cfg.alFijarVelocidad(v);
      } else if (e.pointerType === "mouse") {
        mostrarCrosshair(e);
      }
    });

    const soltar = () => { arrastrando = false; };
    cont.addEventListener("pointerup", soltar);
    cont.addEventListener("pointercancel", soltar);
    cont.addEventListener("pointerleave", () => {
      if (!arrastrando && estado) estado.hover.replaceChildren();
    });
  }

  // Conecta el slider externo (una sola vez).
  function inicializarSlider() {
    const slider = document.querySelector("#v-slider");
    if (!slider || slider.dataset.listo) return;
    slider.dataset.listo = "1";
    slider.addEventListener("input", () => {
      if (cfg.alFijarVelocidad) cfg.alFijarVelocidad(parseFloat(slider.value));
    });
  }

  // ---- API ------------------------------------------------------------------
  function configurar(opciones) {
    cfg = { ...cfg, ...opciones };
  }

  window.dibujarGraficaCaudal = dibujar;
  window.configurarGraficaCaudal = configurar;
})();
