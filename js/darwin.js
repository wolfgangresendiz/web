/*
 * Darwin, la gatita del sitio.
 *
 * Vive en la orilla inferior de cada página: se sienta, pasea, se duerme si nadie
 * le hace caso, voltea hacia donde haces clic y responde a las caricias.
 * Según la fecha lleva un accesorio de temporada.
 *
 * Es autocontenida (zona general): cada página solo agrega
 *   <script src="../js/darwin.js" defer></script>
 * No usa librerías, no toca el DOM de la página y no bloquea clics: solo su
 * cuerpo es clicable.
 *
 * Interacción:
 *   clic en la página  voltea, a veces camina hacia ese punto; si duerme, despierta
 *   clic en Darwin     ronronea y saluda; cada 5 caricias da un saltito
 *   arrastrar a Darwin la cargas y la sueltas en otro lugar
 *
 * Parámetros de URL:
 *   ?darwin=no         la oculta en este navegador (se recuerda)
 *   ?darwin=si         la vuelve a mostrar
 *   ?darwin=navidad    muestra un accesorio de temporada (ver TEMPORADAS)
 *
 * Rendimiento: un solo canvas pequeño que se repinta solo al cambiar de cuadro
 * (cada 130 a 1400 ms). Solo usa requestAnimationFrame mientras se mueve y se
 * detiene por completo con la pestaña oculta.
 */
(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Sprites. Cada letra es un color; '.' es transparente.
  // ---------------------------------------------------------------------------

  const PAL = {
    // Darwin
    K: "#3a2418", O: "#ec9a4f", D: "#c8702f", W: "#fbf6ef", P: "#f3a5a3",
    E: "#c9c45a", I: "#3a2418", Z: "#8b93c9",
    // Accesorios
    R: "#d93a3a", Y: "#f5c518", J: "#b4231f", Q: "#2f7de1",
    F: "#ffb21a", G: "#f2620f", V: "#2f9e4f", N: "#1d2230", L: "#cfd6e4",
    H: "#2e2445", M: "#9b5de5", B: "#f0457a", C: "#3f7fd9", A: "#e8590c",
    T: "#7a3d12", S: "#c2410c",
  };

  // De frente, sentada (16 × 16)
  const FRENTE = [
    "................", "..KK.......KK...", "..KPK.....KPK...", "..KPDKKKKKDPK...",
    "..KOODODODOOK...", "..KOOOOOOOOOK...", "..KOEIOOOIEOK...", "..KOEIOOOIEOK...",
    "..KOOOWPWOOOK...", "...KOWWWWWOK....", "...KOWWWWWOK....", "..KOOWWWWWOOK...",
    "..KOOOWWWOOOKKK.", "..KOODWWWDOOKDK.", "..KOOWWKWWOOOOK.", "..KKKKKKKKKKKKK.",
  ];
  const PARTES_FRENTE = {
    cola: { 12: "..KOOOWWWOOOK.KK", 13: "..KOODWWWDOOKKDK" },
    der: { 6: "..KOEIOOOEIOK...", 7: "..KOEIOOOEIOK..." },
    izq: { 6: "..KOIEOOOIEOK...", 7: "..KOIEOOOIEOK..." },
    pata: { 7: "..KOEIOOOIEOKKK.", 8: "..KOOOWPWOOOKWK.", 9: "...KOWWWWWOKOK..", 10: "...KOWWWWWOKOK..", 11: "..KOOWWWWWOOKK..", 14: "..KOOWWKOOOOOOK." },
    pata2: { 7: "..KOEIOOOIEOK.KK", 8: "..KOOOWPWOOOKKWK", 9: "...KOWWWWWOKOK..", 10: "...KOWWWWWOKOK..", 11: "..KOOWWWWWOOKK..", 14: "..KOOWWKOOOOOOK." },
  };

  // De perfil, mirando a la derecha (24 × 16)
  const PERFIL = [
    "........................", "................KK...KK.", "................KPK.KPK.", "...............KOODDDOOK",
    "..KK...........KOOOOOOOK", "..KOK..........KOOOOEIOK", "...KOK.........KOOOOEIOK", "....KOK........KOOOOOOPK",
    ".....KOKKKKKKKKKOOOWWWK.", ".....KKOOODOODOOOOWWWK..", "......KOOODOODOOOOWWWK..", "......KOOOOOOOOOOWWWWK..",
    "......KOOOOKKKKKOOWWK...", "......KOOK......KOWK....", "......KOOK......KOWK....", "......KWWK......KWWK....",
  ];
  const PARTES_PERFIL = {
    w2: { 13: "......KOKKOK....KOKKOK..", 14: ".....KOK..KOK..KOK..KOK.", 15: ".....KWK..KWK..KWK..KWK." },
    w3: { 13: "....KOK..........KOWK...", 14: "...KOK.............KOK..", 15: "..KWK...............KWK." },
    cola: { 4: "...KK..........KOOOOOOOK", 5: "...KOK.........KOOOOEIOK" },
  };

  // Echada durmiendo (24 × 16)
  const DORMIDA = [
    "........................", "........................", "........................", "........................",
    "........................", "........................", "................KK...KK.", "................KPKKKPK.",
    "....KKKKKKKKKKKKOODDDOOK", "...KOODOODOODOOKOOOOOOOK", "..KOOOOOOOOOOOOKOKKOKKOK", "..KOOOOOOOOOOOOOOOOPOOOK",
    "..KOOOOOOOOOOOOOOWWWWWK.", ".KOOOOOOOOOOOOOOWWWWWWK.", ".KDOOOOOOOOOOOOKWWKWWK..", "..KKKKKKKKKKKKKKKKKKKK..",
  ];
  const PARTES_DORMIDA = {
    z1: { 2: "...................ZZZZ.", 3: ".....................Z..", 4: "....................Z...", 5: "...................ZZZZ." },
    z2: { 0: "....................ZZZZ", 1: "......................Z.", 2: ".....................Z..", 3: "....................ZZZZ" },
    inhala: { 7: "....KKKKKKKKKKKKKPKKKPK.", 8: "...KOODOODOODOOKOODDDOOK" },
  };

  // Lienzo común a todas las poses: 28 columnas y 4 filas libres arriba para gorros y saltos
  const ANCHO = 28;
  const MARGEN = 4;
  const ALTO = 16 + MARGEN;

  // Datos de cada pose: desplazamiento en el lienzo (ox), cabeza (centro y fila de la coronilla),
  // oreja trasera (donde van flores y moños) y zona clicable [x0, y0, x1, y1] en coordenadas del sprite
  const POSES = {
    frente: { grid: FRENTE, partes: PARTES_FRENTE, ox: 6, cabeza: [7, 3], oreja: [2, 1], cuerpo: [2, 1, 15, 15], baja: 5 },
    perfil: { grid: PERFIL, partes: PARTES_PERFIL, ox: 2, cabeza: [19, 3], oreja: [16, 1], cuerpo: [5, 1, 23, 15] },
    dormida: { grid: DORMIDA, partes: PARTES_DORMIDA, ox: 2, cabeza: [19, 8], oreja: [16, 6], cuerpo: [1, 6, 23, 15] },
  };

  // ---------------------------------------------------------------------------
  // Accesorios de temporada
  // ---------------------------------------------------------------------------

  // Tipos de colocación: "cabeza" (encima, centrado; la última fila cae en la coronilla),
  // "oreja" (junto a la oreja trasera) o coordenadas explícitas por pose.
  const ACCESORIOS = {
    santa: { en: "cabeza", g: [
      ".........KK.",
      "......KKKWWK",
      "....KKRRRKK.",
      "...KRRRRRRK.",
      "..KRRRRRRRRK",
      ".KWWWWWWWWWK",
    ] },
    corona: { en: "cabeza", g: [
      "Y..Y..Y",
      "YY.Y.YY",
      "YYYYYYY",
      "YJYQYJY",
    ] },
    gorro: { en: "cabeza", g: [
      "....KKK....",
      "...KWWWK...",
      "..KCKKKCK..",
      ".KCCCCCCCK.",
      "KWCWCWCWCWK",
    ] },
    corazon: { en: "oreja", g: [
      "BB.BB",
      "BWBBB",
      "BBBBB",
      ".BBB.",
      "..B..",
    ] },
    flores: { en: "cabeza", g: [
      ".B...Y...B.",
      "BYB.YFY.BYB",
      "VBVVVYVVVBV",
    ] },
    lentes: {
      frente: { x: 3, y: 6, g: ["NLNNNNLNN", ".NNN.NNN."] },
      perfil: { x: 16, y: 5, g: ["NNNNNLN", "....NNN"] },
      dormida: { x: 16, y: 10, g: ["NNNNNN", ".NN.NN"] },
    },
    mono: { en: "oreja", g: [
      "VV.RR",
      "VVWRR",
      "VV.RR",
    ] },
    hoja: { en: "oreja", g: [
      "...AA",
      "..ASA",
      ".ASA.",
      "ASA..",
      "T....",
    ] },
    bruja: { en: "cabeza", g: [
      ".......KK....",
      "......KHHK...",
      ".....KHHHK...",
      "....KHHHHK...",
      "....KMMMMMK..",
      "...KHHHHHHK..",
      "KKKHHHHHHHHKK",
    ] },
    cempasuchil: { en: "oreja", g: [
      ".FGF.",
      "FGFGF",
      "GFGFG",
      ".FGF.",
    ] },
  };

  // Temporadas por fecha (mes y día, inclusive). Lo que no cae en ninguna va sin accesorio.
  const TEMPORADAS = [
    { id: "reyes", desde: 101, hasta: 106, accesorio: "corona", nombre: "Reyes" },
    { id: "invierno", desde: 107, hasta: 206, accesorio: "gorro", nombre: "Invierno" },
    { id: "sanvalentin", desde: 207, hasta: 215, accesorio: "corazon", nombre: "San Valentín" },
    { id: "primavera", desde: 320, hasta: 430, accesorio: "flores", nombre: "Primavera" },
    { id: "verano", desde: 621, hasta: 831, accesorio: "lentes", nombre: "Verano" },
    { id: "patrias", desde: 901, hasta: 916, accesorio: "mono", nombre: "Fiestas patrias" },
    { id: "otono", desde: 917, hasta: 1014, accesorio: "hoja", nombre: "Otoño" },
    { id: "halloween", desde: 1015, hasta: 1031, accesorio: "bruja", nombre: "Halloween" },
    { id: "muertos", desde: 1101, hasta: 1107, accesorio: "cempasuchil", nombre: "Día de Muertos" },
    { id: "otono", desde: 1108, hasta: 1130, accesorio: "hoja", nombre: "Otoño" },
    { id: "navidad", desde: 1201, hasta: 1231, accesorio: "santa", nombre: "Navidad" },
  ];

  function temporada(fecha) {
    const md = (fecha.getMonth() + 1) * 100 + fecha.getDate();
    return TEMPORADAS.find((t) => md >= t.desde && md <= t.hasta) || null;
  }

  // Dónde va un accesorio en una pose: { x, y, g } en coordenadas del sprite
  function colocar(acc, nombrePose) {
    if (!acc) return null;
    if (acc[nombrePose]) return acc[nombrePose];
    const pose = POSES[nombrePose];
    const w = acc.g[0].length, h = acc.g.length;
    if (acc.en === "cabeza") {
      const [cx, techo] = pose.cabeza;
      return { x: cx - Math.floor(w / 2), y: techo - h + 1, g: acc.g };
    }
    const [ex, ey] = pose.oreja;
    return { x: ex - Math.floor(w / 2) + 1, y: ey + 3 - h, g: acc.g };
  }

  // ---------------------------------------------------------------------------
  // Animaciones: secuencias de cuadros. p = partes, parpadeo, sube = bob, dy = salto, d = ms
  // ---------------------------------------------------------------------------

  const ANIMACIONES = {
    sentada: { pose: "frente", seq: [
      { d: 1400 }, { parpadeo: 1, d: 130 }, { d: 700 }, { p: "cola", d: 300 }, { d: 300 },
      { p: "cola", d: 300 }, { d: 500 }, { sube: 1, d: 400 }, { d: 900 },
    ] },
    der: { pose: "frente", seq: [{ p: "der", d: 900 }, { p: ["der", "cola"], d: 300 }, { p: "der", d: 300 }, { p: ["der", "cola"], d: 300 }] },
    izq: { pose: "frente", seq: [{ p: "izq", d: 900 }, { p: ["izq", "cola"], d: 300 }, { p: "izq", d: 300 }, { p: ["izq", "cola"], d: 300 }] },
    saluda: { pose: "frente", seq: [{ p: "pata", d: 200 }, { p: "pata2", d: 200 }] },
    cargada: { pose: "frente", seq: [{ p: "izq", d: 350 }, { p: ["der", "cola"], d: 350 }] },
    camina: { pose: "perfil", seq: [{ d: 150 }, { p: "w2", d: 150 }] },
    corre: { pose: "perfil", seq: [{ d: 90 }, { p: ["w2", "cola"], d: 90 }, { p: "w3", dy: -1, d: 110 }, { p: "w2", d: 90 }] },
    dormida: { pose: "dormida", seq: [
      { p: "z1", d: 700 }, { p: ["z1", "inhala"], d: 700 }, { p: "z2", d: 700 },
      { p: ["z2", "inhala"], d: 700 }, { d: 700 }, { p: "inhala", d: 700 },
    ] },
  };

  const esOjo = (c) => c === "E" || c === "I";

  // Matriz ALTO × ANCHO de un cuadro, con el accesorio ya pintado encima
  function cuadro(nombrePose, f, acc) {
    const pose = POSES[nombrePose];
    const filas = pose.grid.slice();
    for (const n of [].concat(f.p || [])) for (const [r, s] of Object.entries(pose.partes[n])) filas[+r] = s;
    const h = filas.length, w = filas[0].length;
    const m = Array.from({ length: ALTO }, () => Array(ANCHO).fill("."));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y + MARGEN][x + pose.ox] = filas[y][x] || ".";

    if (f.parpadeo) {
      // Párpado: la fila de arriba del ojo toma el color de la cara y la de abajo se vuelve línea
      const cambios = [];
      for (let y = 1; y < ALTO - 1; y++) for (let x = 1; x < ANCHO; x++)
        if (esOjo(m[y][x]) && esOjo(m[y + 1][x]) && !esOjo(m[y - 1][x])) {
          let i = x - 1;
          while (i > 0 && esOjo(m[y][i])) i--;
          cambios.push([y, x, m[y][i]], [y + 1, x, "K"]);
        }
      for (const [y, x, c] of cambios) m[y][x] = c;
    }

    const lugar = colocar(acc, nombrePose);
    if (lugar) lugar.g.forEach((fila, y) => [...fila].forEach((c, x) => {
      const yy = lugar.y + y + MARGEN, xx = lugar.x + x + pose.ox;
      // Las zetas del sueño quedan por encima del accesorio
      if (c !== "." && yy >= 0 && m[yy]?.[xx] !== "Z" && yy < ALTO && xx >= 0 && xx < ANCHO) m[yy][xx] = c;
    }));

    if (f.sube && pose.baja) {
      // Respira: la cabeza (con su accesorio) baja un píxel
      for (let y = pose.baja + MARGEN; y > 0; y--) m[y] = m[y - 1];
      m[0] = Array(ANCHO).fill(".");
    }
    return m;
  }

  // Prepara todas las animaciones con el accesorio de la temporada
  function prepararAnimaciones(acc) {
    const res = {};
    for (const [nombre, a] of Object.entries(ANIMACIONES))
      res[nombre] = { pose: a.pose, seq: a.seq.map((f) => ({ d: f.d, dy: f.dy || 0, m: cuadro(a.pose, f, acc) })) };
    return res;
  }

  // Sin navegador (pruebas con node): solo expone los datos
  if (typeof document === "undefined") {
    globalThis.DarwinPruebas = { PAL, POSES, ACCESORIOS, TEMPORADAS, ANIMACIONES, ANCHO, ALTO, MARGEN, temporada, colocar, cuadro, prepararAnimaciones };
    return;
  }

  // ---------------------------------------------------------------------------
  // Navegador
  // ---------------------------------------------------------------------------

  const almacen = (tipo) => { try { return window[tipo]; } catch (e) { return null; } };
  const local = almacen("localStorage"), sesion = almacen("sessionStorage");
  const leer = (s, k) => { try { return s && s.getItem(k); } catch (e) { return null; } };
  const guardar = (s, k, v) => { try { if (s) v == null ? s.removeItem(k) : s.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };

  // ?darwin=no | si | <temporada>
  const param = new URLSearchParams(location.search).get("darwin");
  if (param === "no") guardar(local, "darwin-oculta", "1");
  if (param === "si") guardar(local, "darwin-oculta", null);
  if (leer(local, "darwin-oculta") === "1" || window.top !== window.self) return;

  const elegida = TEMPORADAS.find((t) => t.id === param) || temporada(new Date());
  const ANIM = prepararAnimaciones(elegida && ACCESORIOS[elegida.accesorio]);
  const quieto = matchMedia("(prefers-reduced-motion: reduce)");
  const ahora = () => performance.now();
  const azar = (a, b) => a + Math.random() * (b - a);

  function iniciar() {
    if (document.getElementById("darwin")) return;

    const estilo = document.createElement("style");
    estilo.textContent = `
      #darwin { position: fixed; left: 0; bottom: 0; z-index: 9000; pointer-events: none;
        will-change: transform; contain: layout style; }
      #darwin .darwin-cuerpo { position: relative; }
      #darwin.salta .darwin-cuerpo { animation: darwin-salto .45s ease-out; }
      #darwin canvas { display: block; image-rendering: pixelated; pointer-events: none; }
      #darwin button { position: absolute; padding: 0; margin: 0; border: 0; background: none;
        cursor: grab; pointer-events: auto; touch-action: none; border-radius: 6px; -webkit-tap-highlight-color: transparent; }
      #darwin button:focus-visible { outline: 2px solid var(--accent, #4f46e5); outline-offset: 2px; }
      #darwin.cargada button { cursor: grabbing; }
      #darwin .darwin-globo { position: absolute; bottom: calc(100% - 6px); transform: translateX(-50%);
        padding: 1px 7px; border-radius: 8px; white-space: nowrap; pointer-events: none;
        font: 600 12px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
        color: var(--text, #1a1c22); background: var(--surface, #fff); border: 1px solid var(--border, #e6e8ef);
        box-shadow: 0 2px 8px rgba(16, 24, 40, .08); animation: darwin-globo 1.6s ease forwards; }
      #darwin .darwin-corazon { position: absolute; bottom: 70%; color: #f0457a; font: 14px/1 system-ui, sans-serif;
        pointer-events: none; animation: darwin-corazon 1s ease-out forwards; }
      @keyframes darwin-salto { 0%, 100% { transform: none; } 40% { transform: translateY(-14px); } }
      @keyframes darwin-globo { 0% { opacity: 0; translate: 0 4px; } 12%, 75% { opacity: 1; translate: 0 0; } 100% { opacity: 0; } }
      @keyframes darwin-corazon { 0% { opacity: 0; translate: 0 0; } 20% { opacity: 1; } 100% { opacity: 0; translate: var(--dx, 0) -34px; } }
      @media (prefers-reduced-motion: reduce) {
        #darwin.salta .darwin-cuerpo, #darwin .darwin-corazon { animation: none; opacity: 0; }
        #darwin .darwin-globo { animation-duration: 2.4s; }
      }
      @media print { #darwin { display: none; } }
    `;
    document.head.appendChild(estilo);

    const raiz = document.createElement("div");
    raiz.id = "darwin";
    raiz.innerHTML = `<div class="darwin-cuerpo"><canvas aria-hidden="true"></canvas>` +
      `<button type="button" aria-label="Darwin, la gatita del sitio. Acaríciala"></button></div>`;
    const cuerpo = raiz.firstChild;
    const lienzo = cuerpo.querySelector("canvas");
    const ctx = lienzo.getContext("2d");
    const boton = cuerpo.querySelector("button");
    document.body.appendChild(raiz);

    // Estado
    let escala = 3, x = 0, y = 0, dir = -1;
    let estado = "sentada", anim = ANIM.sentada, cuadroI = 0, cuadroT = 0;
    let destino = null, velocidad = 0, hasta = 0, proxima = 0, vy = 0;
    let ultimaActividad = ahora(), previo = ahora(), caricias = 0;
    let temporizador = 0, rafId = 0, pintado = null, pintadoEspejo = false, arrastre = null, ignorarClic = false, ultimoPaseo = 0;

    const anchoPx = () => ANCHO * escala;
    const limite = () => Math.max(0, document.documentElement.clientWidth - anchoPx());
    const espejo = () => anim.pose !== "frente" && dir < 0;

    function medir() {
      escala = innerWidth < 560 ? 2 : 3;
      const r = Math.max(1, Math.round(devicePixelRatio || 1));
      lienzo.width = ANCHO * escala * r;
      lienzo.height = ALTO * escala * r;
      lienzo.style.width = ANCHO * escala + "px";
      lienzo.style.height = ALTO * escala + "px";
      cuerpo.style.width = ANCHO * escala + "px";
      x = Math.min(x, limite());
      pintado = null;
      pintar();
    }

    function pintar() {
      const f = anim.seq[cuadroI];
      if (pintado === f && pintadoEspejo === espejo()) return;
      const r = lienzo.width / ANCHO, dy = f.dy;
      ctx.clearRect(0, 0, lienzo.width, lienzo.height);
      for (let j = 0; j < ALTO; j++) for (let i = 0; i < ANCHO; i++) {
        const c = f.m[j][i];
        if (c === ".") continue;
        ctx.fillStyle = PAL[c];
        ctx.fillRect((espejo() ? ANCHO - 1 - i : i) * r, (j + dy) * r, r, r);
      }
      pintado = f;
      pintadoEspejo = espejo();
      // Zona clicable: solo el cuerpo de la pose actual
      const pose = POSES[anim.pose];
      let [x0, y0, x1, y1] = pose.cuerpo;
      x0 += pose.ox; x1 += pose.ox;
      if (espejo()) [x0, x1] = [ANCHO - 1 - x1, ANCHO - 1 - x0];
      Object.assign(boton.style, {
        left: x0 * escala + "px", top: (y0 + MARGEN) * escala + "px",
        width: (x1 - x0 + 1) * escala + "px", height: (y1 - y0 + 1) * escala + "px",
      });
    }

    function colocarRaiz() {
      raiz.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    }

    function animar(nombre) {
      if (anim === ANIM[nombre]) return;
      anim = ANIM[nombre];
      cuadroI = 0;
      cuadroT = 0;
    }

    function cambiar(nuevo, ms) {
      estado = nuevo;
      hasta = ms ? ahora() + ms : 0;
      destino = null;
      animar(nuevo === "camina" ? (velocidad > 0.08 ? "corre" : "camina") : nuevo);
      raiz.classList.toggle("cargada", nuevo === "cargada");
      if (nuevo === "sentada") proxima = ahora() + azar(6000, 14000);
      pintar();
      programar();
    }

    function caminarA(px, rapido) {
      if (quieto.matches) return false;
      const meta = Math.max(0, Math.min(limite(), px));
      if (Math.abs(meta - x) < 8) return false;
      velocidad = rapido ? 0.12 : 0.045; // px por ms
      dir = meta > x ? 1 : -1;
      cambiar("camina");
      destino = meta;
      programar();
      return true;
    }

    function globo(texto) {
      const viejo = cuerpo.querySelector(".darwin-globo");
      if (viejo) viejo.remove();
      const g = document.createElement("span");
      g.className = "darwin-globo";
      g.textContent = texto;
      const pose = POSES[anim.pose];
      let cx = pose.cabeza[0] + pose.ox;
      if (espejo()) cx = ANCHO - 1 - cx;
      g.style.left = cx * escala + "px";
      g.addEventListener("animationend", () => g.remove());
      cuerpo.appendChild(g);
    }

    function corazones(n) {
      if (quieto.matches) return;
      for (let i = 0; i < n; i++) {
        const c = document.createElement("span");
        c.className = "darwin-corazon";
        c.textContent = "♥";
        c.style.left = azar(30, 65) + "%";
        c.style.setProperty("--dx", Math.round(azar(-14, 14)) + "px");
        c.style.animationDelay = i * 90 + "ms";
        c.addEventListener("animationend", () => c.remove());
        cuerpo.appendChild(c);
      }
    }

    // Clic en cualquier parte de la página
    function alClicPagina(e) {
      if (e.button > 0 || raiz.contains(e.target)) return;
      ultimaActividad = ahora();
      if (estado === "cargada" || y < 0) return;
      if (estado === "dormida") {
        cambiar("sentada");
        globo("!");
        return;
      }
      const centro = x + anchoPx() / 2;
      const dx = e.clientX - centro;
      const t = ahora();
      if (Math.abs(dx) > 180 && t - ultimoPaseo > 2500 && Math.random() < 0.6) {
        ultimoPaseo = t;
        if (caminarA(e.clientX - anchoPx() / 2, Math.abs(dx) > 450)) return;
      }
      if (estado === "camina") return;
      cambiar(dx > 0 ? "der" : "izq", 2200);
      if (Math.random() < 0.35) globo("?");
    }

    // Caricia (clic o teclado sobre Darwin)
    function acariciar() {
      if (ignorarClic) { ignorarClic = false; return; }
      ultimaActividad = ahora();
      if (estado === "dormida") {
        cambiar("sentada");
        globo("¿mm?");
        return;
      }
      caricias++;
      cambiar("saluda", 1300);
      if (caricias % 5 === 0) {
        globo("¡miau!");
        corazones(5);
        raiz.classList.remove("salta");
        void raiz.offsetWidth; // reinicia la animación
        raiz.classList.add("salta");
      } else {
        globo(["prrr", "prrrr", "♥", "miau"][caricias % 4]);
        corazones(caricias % 2 + 1);
      }
    }

    // Arrastrar para cargarla
    boton.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      arrastre = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: e.clientX - x, activo: false };
      boton.setPointerCapture(e.pointerId);
    });
    boton.addEventListener("pointermove", (e) => {
      if (!arrastre || e.pointerId !== arrastre.id) return;
      if (!arrastre.activo && Math.hypot(e.clientX - arrastre.x0, e.clientY - arrastre.y0) < 6) return;
      if (!arrastre.activo) { arrastre.activo = true; cambiar("cargada"); globo("¡!"); }
      x = Math.max(0, Math.min(limite(), e.clientX - arrastre.dx));
      y = Math.min(0, e.clientY - arrastre.y0);
      colocarRaiz();
    });
    const soltar = (e) => {
      if (!arrastre || e.pointerId !== arrastre.id) return;
      const activo = arrastre.activo;
      arrastre = null;
      if (activo) { ignorarClic = true; vy = 0; ultimaActividad = ahora(); previo = ahora(); programar(); }
    };
    boton.addEventListener("pointerup", soltar);
    boton.addEventListener("pointercancel", soltar);
    boton.addEventListener("click", acariciar);
    document.addEventListener("pointerdown", alClicPagina, { capture: true, passive: true });

    // Ciclo: repinta solo al cambiar de cuadro; rAF solo mientras se mueve o cae
    function paso() {
      const t = ahora();
      const dt = Math.min(100, t - previo);
      previo = t;

      if (y < 0 && !arrastre) {
        // Cae al suelo después de soltarla
        vy += 0.004 * dt;
        y = Math.min(0, y + vy * dt);
        colocarRaiz();
        if (y === 0) { cambiar("sentada"); globo("miau"); }
      } else if (estado === "camina" && destino != null) {
        x += dir * velocidad * dt;
        if ((dir > 0 && x >= destino) || (dir < 0 && x <= destino)) { x = destino; cambiar("sentada"); }
        colocarRaiz();
      } else if (hasta && t >= hasta) {
        cambiar("sentada");
      } else if (estado === "sentada" && t >= proxima) {
        if (t - ultimaActividad > 75000) cambiar("dormida");
        else if (Math.random() < 0.35 && !caminarA(azar(0, limite()))) proxima = t + 8000;
        else proxima = t + azar(6000, 14000);
      }

      if (!quieto.matches) {
        cuadroT += dt;
        while (cuadroT >= anim.seq[cuadroI].d) { cuadroT -= anim.seq[cuadroI].d; cuadroI = (cuadroI + 1) % anim.seq.length; }
      }
      pintar();
      programar();
    }

    function programar() {
      clearTimeout(temporizador);
      cancelAnimationFrame(rafId);
      if (document.hidden) return;
      if ((estado === "camina" && destino != null) || (y < 0 && !arrastre)) { rafId = requestAnimationFrame(paso); return; }
      if (arrastre) return;
      const resto = quieto.matches ? 1000 : anim.seq[cuadroI].d - cuadroT;
      const decision = hasta || (estado === "sentada" ? proxima : Infinity);
      temporizador = setTimeout(paso, Math.max(30, Math.min(resto, decision - ahora())));
    }

    // Recuerda dónde estaba al cambiar de página dentro de la misma sesión
    function recordar() {
      guardar(sesion, "darwin", JSON.stringify({ x: x / Math.max(1, limite()), dir, dormida: estado === "dormida" }));
    }
    addEventListener("pagehide", recordar);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) recordar();
      previo = ahora();
      programar();
    });
    addEventListener("resize", medir, { passive: true });

    let previa = null;
    try { previa = JSON.parse(leer(sesion, "darwin")); } catch (e) { /* nada */ }
    medir();
    if (previa && typeof previa.x === "number") {
      x = Math.max(0, Math.min(1, previa.x)) * limite();
      dir = previa.dir === 1 ? 1 : -1;
      colocarRaiz();
      cambiar(previa.dormida ? "dormida" : "sentada");
    } else {
      // Primera página de la sesión: entra caminando desde la orilla derecha
      x = limite();
      colocarRaiz();
      if (!caminarA(limite() * azar(0.6, 0.85))) cambiar("sentada");
    }
  }

  // Arranca cuando el navegador está libre, para no competir con la carga de la página
  const listo = () => (window.requestIdleCallback ? requestIdleCallback(iniciar, { timeout: 2000 }) : setTimeout(iniciar, 200));
  if (document.readyState === "complete") listo();
  else addEventListener("load", listo, { once: true });
})();
