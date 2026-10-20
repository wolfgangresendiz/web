// ============================================================
//  Catálogo de cotizaciones: arranque, acceso y navegación
// ============================================================
//
// 1. Si hay una sesión guardada, se usa su llave; si no, se pide
//    usuario y contraseña y se obtiene la llave con acceso.json.
// 2. Se descarga y descifra datos/catalogo.enc y se arma el índice.
// 3. Cada cambio de #ruta pinta una vista. Todo ocurre en el navegador:
//    GitHub Pages solo sirve archivos cifrados.

import { entrar, descifrarCatalogo, aHex, deHex, normalizarUsuario, ErrorAcceso } from "./boveda.js";
import { construirIndice, ESQUEMA } from "./modelo.js";
import { crearBuscador } from "./buscar.js";
import { html, crudo, dinero, fechaCorta, hoyISO, urlCarpetaDrive } from "./util.js";
import { ruta } from "./vistas/comunes.js";
import { arbolCategorias } from "./vistas/lateral.js";
import { vistaInicio, vistaNovedades, vistaBusqueda } from "./vistas/inicio.js";
import { vistaCategoria } from "./vistas/categoria.js";
import { vistaProducto } from "./vistas/producto.js";
import { vistaCotizaciones, vistaCotizacion } from "./vistas/cotizaciones.js";
import { vistaProveedores, vistaProveedor } from "./vistas/proveedores.js";
import { vistaFichas, vistaFicha } from "./vistas/fichas.js";

const DATOS = "datos/";
const CLAVE_SESION = "catalogo-wr:sesion";
const raiz = document.getElementById("app");

const estado = { indice: null, buscador: null, usuario: "", nombre: "", limpiar: null };

// ---- Sesión (la llave solo vive en este navegador) ----

function leerSesion() {
  for (const almacen of [sessionStorage, localStorage]) {
    try {
      const sesion = JSON.parse(almacen.getItem(CLAVE_SESION));
      if (sesion?.llave && sesion?.usuario) return sesion;
    } catch {
      /* almacenamiento bloqueado o dato corrupto: se ignora */
    }
  }
  return null;
}

function guardarSesion(usuario, dek, recordar) {
  const valor = JSON.stringify({ usuario, llave: aHex(dek) });
  try {
    (recordar ? localStorage : sessionStorage).setItem(CLAVE_SESION, valor);
  } catch {
    /* modo privado: la sesión dura lo que la pestaña */
  }
}

function cerrarSesion() {
  for (const almacen of [sessionStorage, localStorage]) {
    try {
      almacen.removeItem(CLAVE_SESION);
    } catch {
      /* sin almacenamiento */
    }
  }
  location.hash = "";
  location.reload();
}

async function descargar(archivo, tipo) {
  const respuesta = await fetch(DATOS + archivo, { cache: "no-cache" });
  if (!respuesta.ok) throw new Error(`No se pudo descargar ${archivo} (${respuesta.status})`);
  return tipo === "json" ? respuesta.json() : new Uint8Array(await respuesta.arrayBuffer());
}

// ---- Pantalla de acceso ----

function mostrarAcceso(mensaje = "") {
  document.title = "Entrar · Catálogo de cotizaciones";
  raiz.innerHTML = String(html`<main class="acceso">
    <form class="acceso__tarjeta" autocomplete="on">
      <a class="marca" href="../index.html">WR</a>
      <h1>Catálogo de cotizaciones</h1>
      <p class="acceso__sub">Piezas y servicios de agua potable. Entra con tu usuario y contraseña.</p>
      <label for="acceso-usuario">Usuario</label>
      <input id="acceso-usuario" name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" required>
      <label for="acceso-contrasena">Contraseña</label>
      <input id="acceso-contrasena" name="contrasena" type="password" autocomplete="current-password" required>
      <label class="acceso__recordar"><input type="checkbox" name="recordar"> Recordar en este equipo</label>
      <button type="submit">Entrar</button>
      <p class="acceso__error" role="alert" ${mensaje ? "" : "hidden"}>${mensaje}</p>
    </form>
  </main>`);

  const form = raiz.querySelector("form");
  const error = raiz.querySelector(".acceso__error");
  const boton = form.querySelector("button");
  form.usuario.focus();

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    error.hidden = true;
    boton.disabled = true;
    boton.textContent = "Verificando…";
    try {
      const usuario = normalizarUsuario(form.usuario.value);
      const acceso = await descargar("acceso.json", "json");
      const dek = await entrar(acceso, usuario, form.contrasena.value);
      guardarSesion(usuario, dek, form.recordar.checked);
      await abrirCatalogo(usuario, dek);
    } catch (e) {
      error.textContent =
        e instanceof ErrorAcceso ? e.message : "No pude cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.";
      if (!(e instanceof ErrorAcceso)) console.error(e);
      error.hidden = false;
      boton.disabled = false;
      boton.textContent = "Entrar";
      form.contrasena.select();
    }
  });
}

// ---- Carga del catálogo ----

async function abrirCatalogo(usuario, dek) {
  const datos = await descifrarCatalogo(await descargar("catalogo.enc"), dek);
  if ((datos.esquema ?? 1) > ESQUEMA) {
    raiz.innerHTML = String(html`<main class="acceso"><div class="acceso__tarjeta">
      <h1>Hay una versión nueva</h1><p>Recarga la página para ver el catálogo actualizado.</p>
      <a class="boton" href="./">Recargar</a></div></main>`);
    return;
  }
  estado.indice = construirIndice(datos);
  estado.buscador = crearBuscador(estado.indice);
  estado.usuario = usuario;
  estado.nombre = estado.indice.usuarios.find((u) => u.usuario === usuario)?.nombre || usuario;
  montarMarco();
  window.addEventListener("hashchange", enrutar);
  enrutar();
}

// ---- Marco: barra superior, columna lateral y contenido ----

function montarMarco() {
  const { config } = estado.indice;
  const iniciales = estado.nombre
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  raiz.innerHTML = String(html`<header class="barra">
      <div class="barra__fila">
        <a class="marca" href="../index.html" title="Inicio del sitio">WR</a>
        <a class="barra__titulo" href="#/">Catálogo</a>
        <div class="buscador" role="search">
          <input id="buscador" class="buscador__entrada" type="search" placeholder="Buscar producto, medida, marca, proveedor o folio"
            autocomplete="off" spellcheck="false" aria-label="Buscar en el catálogo" aria-autocomplete="list"
            aria-controls="sugerencias" aria-expanded="false">
          <kbd class="buscador__atajo" aria-hidden="true">/</kbd>
          <div id="sugerencias" class="sugerencias" role="listbox" hidden></div>
        </div>
        <div class="usuario">
          <button class="usuario__boton" type="button" aria-haspopup="true" aria-expanded="false" title="${estado.nombre}">${iniciales}</button>
          <div class="usuario__menu" hidden>
            <p class="usuario__nombre">${estado.nombre}</p>
            <a href="${ruta.novedades()}">Novedades</a>
            ${config.drive?.raiz ? html`<a href="${urlCarpetaDrive(config.drive.raiz)}" target="_blank" rel="noopener">Carpeta en Google Drive</a>` : ""}
            <button type="button" data-salir>Cerrar sesión</button>
          </div>
        </div>
      </div>
      <nav class="barra__nav" aria-label="Secciones">
        <a href="#/" data-seccion="catalogo">Catálogo</a>
        <a href="${ruta.cotizaciones()}" data-seccion="cotizaciones">Cotizaciones</a>
        <a href="${ruta.proveedores()}" data-seccion="proveedores">Proveedores</a>
        <a href="${ruta.fichas()}" data-seccion="fichas">Fichas técnicas</a>
        <button class="barra__categorias" type="button" aria-controls="lateral" aria-expanded="false">Categorías</button>
      </nav>
    </header>
    <div class="cuerpo">
      <aside id="lateral" class="lateral" aria-label="Categorías"></aside>
      <main id="contenido" class="contenido" tabindex="-1"></main>
    </div>
    <footer class="pie">
      <span>Actualizado ${estado.indice.generado ? fechaCorta(hoyISO(new Date(estado.indice.generado))) : ""}</span>
      <span>Precios en MXN sin IVA salvo indicación</span>
    </footer>`);

  activarBuscador();
  activarMenuUsuario();

  const lateral = document.getElementById("lateral");
  const botonCategorias = raiz.querySelector(".barra__categorias");
  botonCategorias.addEventListener("click", () => {
    const abierto = document.body.classList.toggle("lateral-abierto");
    botonCategorias.setAttribute("aria-expanded", String(abierto));
  });
  lateral.addEventListener("click", (e) => {
    if (e.target.closest("a")) document.body.classList.remove("lateral-abierto");
  });

  // Anclas internas (#datos-tecnicos) sin romper el enrutador por #ruta.
  raiz.addEventListener("click", (e) => {
    const enlace = e.target.closest("a[href^='#']");
    const destino = enlace?.getAttribute("href");
    if (!destino || destino.startsWith("#/")) return;
    e.preventDefault();
    document.getElementById(destino.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function activarMenuUsuario() {
  const boton = raiz.querySelector(".usuario__boton");
  const menu = raiz.querySelector(".usuario__menu");
  const alternar = (abrir) => {
    menu.hidden = !abrir;
    boton.setAttribute("aria-expanded", String(abrir));
  };
  boton.addEventListener("click", (e) => {
    e.stopPropagation();
    alternar(menu.hidden);
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target)) alternar(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") alternar(false);
  });
  menu.addEventListener("click", (e) => {
    if (e.target.closest("[data-salir]")) cerrarSesion();
    else if (e.target.closest("a")) alternar(false);
  });
}

// ---- Búsqueda instantánea en la barra ----

function sugerencia(resultado) {
  const o = resultado.objeto;
  switch (resultado.tipo) {
    case "producto": {
      const r = o.resumen;
      return {
        href: ruta.producto(o.id),
        tipo: o.tipo === "servicio" ? "Servicio" : "Producto",
        titulo: o.nombre,
        detalle: [o.id, o.nodo?.nombre, r.n ? `último ${dinero(r.ultimo.precio.puMXN)} /${o.unidad}` : "sin cotización"]
          .filter(Boolean)
          .join(" · "),
      };
    }
    case "proveedor":
      return { href: ruta.proveedor(o.id), tipo: "Proveedor", titulo: o.nombre, detalle: [o.ciudad, o.tipo].filter(Boolean).join(" · ") };
    case "cotizacion":
      return {
        href: ruta.cotizacion(o.id),
        tipo: "Cotización",
        titulo: `${o.proveedorObj?.nombre ?? o.proveedor}`,
        detalle: [o.id, o.folio, fechaCorta(o.fecha)].filter(Boolean).join(" · "),
      };
    default:
      return { href: ruta.ficha(o.id), tipo: "Ficha técnica", titulo: o.titulo, detalle: [o.id, o.productoObj?.nombre].filter(Boolean).join(" · ") };
  }
}

function activarBuscador() {
  const entrada = document.getElementById("buscador");
  const lista = document.getElementById("sugerencias");
  let activa = -1;
  let elementos = [];

  const cerrar = () => {
    lista.hidden = true;
    entrada.setAttribute("aria-expanded", "false");
    entrada.removeAttribute("aria-activedescendant");
    activa = -1;
  };
  const marcar = (i) => {
    elementos.forEach((el, j) => el.setAttribute("aria-selected", String(j === i)));
    activa = i;
    if (i >= 0) entrada.setAttribute("aria-activedescendant", elementos[i].id);
  };
  const actualizar = () => {
    const q = entrada.value.trim();
    if (!q) return cerrar();
    const resultados = estado.buscador.buscar(q, { limite: 8 });
    lista.innerHTML = String(
      resultados.length
        ? html`${resultados.map((r, i) => {
            const s = sugerencia(r);
            return html`<a id="sug-${i}" class="sugerencia" role="option" aria-selected="false" href="${s.href}">
              <span class="sugerencia__tipo">${s.tipo}</span>
              <span class="sugerencia__titulo">${s.titulo}</span>
              <span class="sugerencia__detalle">${s.detalle}</span>
            </a>`;
          })}
          <a class="sugerencia sugerencia--todas" href="${ruta.buscar(q)}">Ver todos los resultados de “${q}”</a>`
        : html`<p class="sugerencias__vacio">Sin coincidencias. ${crudo("<kbd>Enter</kbd>")} busca de todos modos.</p>`,
    );
    elementos = [...lista.querySelectorAll(".sugerencia[role='option']")];
    activa = -1;
    lista.hidden = false;
    entrada.setAttribute("aria-expanded", "true");
  };

  entrada.addEventListener("input", actualizar);
  entrada.addEventListener("focus", () => entrada.value.trim() && actualizar());
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && elementos.length) {
      e.preventDefault();
      marcar((activa + 1) % elementos.length);
    } else if (e.key === "ArrowUp" && elementos.length) {
      e.preventDefault();
      marcar(activa <= 0 ? elementos.length - 1 : activa - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const q = entrada.value.trim();
      if (!q) return;
      location.hash = activa >= 0 ? elementos[activa].getAttribute("href") : ruta.buscar(q);
      cerrar();
      entrada.blur();
    } else if (e.key === "Escape") {
      cerrar();
    }
  });
  lista.addEventListener("click", () => {
    cerrar();
    entrada.blur();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".buscador")) cerrar();
  });
  // Atajo: "/" enfoca la búsqueda desde cualquier parte.
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !e.target.closest("input, textarea, select")) {
      e.preventDefault();
      entrada.focus();
      entrada.select();
    }
  });
}

// ---- Rutas ----

const dec = decodeURIComponent;
const RUTAS = [
  [/^\/$/, (i) => vistaInicio(i)],
  [/^\/categoria\/([^/]+)$/, (i, m) => vistaCategoria(i, { id: dec(m[1]) })],
  [/^\/producto\/([^/]+)$/, (i, m) => vistaProducto(i, { id: dec(m[1]) })],
  [/^\/cotizaciones$/, (i) => vistaCotizaciones(i)],
  [/^\/cotizacion\/([^/]+)$/, (i, m) => vistaCotizacion(i, { id: dec(m[1]) })],
  [/^\/proveedores$/, (i) => vistaProveedores(i)],
  [/^\/proveedor\/([^/]+)$/, (i, m) => vistaProveedor(i, { id: dec(m[1]) })],
  [/^\/fichas$/, (i) => vistaFichas(i)],
  [/^\/ficha\/([^/]+)$/, (i, m) => vistaFicha(i, { id: dec(m[1]) })],
  [/^\/novedades$/, (i) => vistaNovedades(i)],
  [/^\/buscar$/, (i, m, params) => vistaBusqueda(i, { q: params.get("q") ?? "" }, estado.buscador)],
];

function noEncontrada() {
  return {
    titulo: "No encontrado",
    seccion: "catalogo",
    lateral: true,
    html: html`<header class="encabezado">
      <h1>No encontré esa página</h1>
      <p class="encabezado__desc">Puede que el producto o la cotización haya cambiado de identificador.
        <a href="#/">Volver al catálogo</a> o usa la búsqueda.</p>
    </header>`,
  };
}

function enrutar() {
  const [camino, consulta = ""] = (location.hash.replace(/^#/, "") || "/").split("?");
  const params = new URLSearchParams(consulta);
  let vista = null;
  for (const [patron, fabrica] of RUTAS) {
    const m = camino.match(patron);
    if (m) {
      vista = fabrica(estado.indice, m, params);
      break;
    }
  }
  vista ??= noEncontrada();

  estado.limpiar?.();
  estado.limpiar = null;

  const contenido = document.getElementById("contenido");
  const lateral = document.getElementById("lateral");
  contenido.innerHTML = String(vista.html);
  lateral.innerHTML = vista.lateral ? String(arbolCategorias(estado.indice, vista.nodoActivo)) : "";
  document.body.classList.toggle("con-lateral", Boolean(vista.lateral));
  document.body.classList.remove("lateral-abierto");
  for (const enlace of raiz.querySelectorAll(".barra__nav [data-seccion]")) {
    enlace.toggleAttribute("aria-current", enlace.dataset.seccion === vista.seccion);
  }
  document.title = `${vista.titulo} · Catálogo de cotizaciones`;
  window.scrollTo(0, 0);
  contenido.focus({ preventScroll: true });

  const limpiar = vista.alMontar?.(contenido);
  if (typeof limpiar === "function") estado.limpiar = limpiar;
}

// ---- Arranque ----

async function iniciar() {
  const sesion = leerSesion();
  if (!sesion) return mostrarAcceso();
  try {
    await abrirCatalogo(sesion.usuario, deHex(sesion.llave));
  } catch (e) {
    console.warn("La sesión guardada ya no sirve:", e);
    for (const almacen of [sessionStorage, localStorage]) {
      try {
        almacen.removeItem(CLAVE_SESION);
      } catch {
        /* sin almacenamiento */
      }
    }
    mostrarAcceso("Tu sesión expiró o la llave del catálogo cambió. Vuelve a entrar.");
  }
}

iniciar();
