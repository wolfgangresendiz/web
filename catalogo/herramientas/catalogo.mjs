#!/usr/bin/env node
// ============================================================
//  CLI del catálogo de cotizaciones
// ============================================================
//
// Uso:  npm run catalogo -- <comando> [opciones]
//       (equivale a: node catalogo/herramientas/catalogo.mjs <comando> [opciones])
//
// Flujo normal de una sesión de trabajo:
//   1. abrir      → descifra la bóveda en .catalogo/fuente/ (JSON en claro)
//   2. editar los JSON (cotizaciones, productos, proveedores, fichas…)
//   3. cerrar     → valida, registra en la bitácora y vuelve a cifrar
//   4. commit + push de catalogo/datos/ (solo archivos cifrados)
//
// Para abrir la bóveda hacen falta las credenciales de un administrador,
// que la CLI toma de las variables de entorno CATALOGO_USUARIO y
// CATALOGO_CONTRASENA (configuradas en el entorno, nunca en el chat).
//
// Ejecuta "ayuda" para ver todos los comandos.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ErrorAcceso,
  ITERACIONES,
  aB64,
  aleatorio,
  cifrarCatalogo,
  derivarKEK,
  aHex,
  descifrarCatalogo,
  desenvolverDEK,
  envolverDEK,
  huellaDEK,
  idUsuario,
  normalizarUsuario,
  nuevaDEK,
} from "../js/boveda.js";
import { construirIndice, rutaNombres } from "../js/modelo.js";
import { crearBuscador } from "../js/buscar.js";
import { dinero, hoyISO, slug, sumarDias, diasEntre } from "../js/util.js";
import { abrirLlavero, sellarLlavero, leerLlavero, escribirLlavero } from "./lib/llavero.mjs";
import { leerFuente, escribirFuente, empaquetar, diferencias, describirCambios } from "./lib/fuente.mjs";
import { validar, esUsuarioValido } from "./lib/validar.mjs";

const HERRAMIENTAS = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(HERRAMIENTAS, "..", "..");
const DATOS_WEB = path.join(RAIZ, "catalogo", "datos");
const BOVEDA = path.join(DATOS_WEB, "catalogo.enc");
const ACCESO = path.join(DATOS_WEB, "acceso.json");
const PRIVADO = path.join(RAIZ, ".catalogo");
const LLAVERO = path.join(PRIVADO, "llavero.txt");
const FUENTE = path.join(PRIVADO, "fuente");
const SEMILLA = path.join(HERRAMIENTAS, "semilla", "taxonomia.json");
const DEMO = path.join(HERRAMIENTAS, "demo", "datos.json");
const URL_SITIO = "https://wolfgangresendiz.github.io/web/catalogo/";

const PREFIJOS = { producto: "P-", productos: "P-", cotizacion: "C-", cotizaciones: "C-", ficha: "FT-", fichas: "FT-" };

class ErrorUso extends Error {}

// ---- Utilidades de consola ----

const rel = (archivo) => path.relative(RAIZ, archivo) || ".";
const titulo = (texto) => console.log(`\n${texto}\n${"─".repeat(Math.min(72, texto.length))}`);

function imprimirLista(encabezado, lista, limite = 60) {
  if (!lista.length) return;
  console.log(`\n${encabezado} (${lista.length}):`);
  for (const linea of lista.slice(0, limite)) console.log(`  · ${linea}`);
  if (lista.length > limite) console.log(`  … y ${lista.length - limite} más`);
}

function argumentos(argv) {
  const posicionales = [];
  const opciones = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [clave, valorEnLinea] = a.slice(2).split("=", 2);
      if (valorEnLinea !== undefined) opciones[clave] = valorEnLinea;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) opciones[clave] = argv[++i];
      else opciones[clave] = true;
    } else posicionales.push(a);
  }
  return { posicionales, opciones };
}

// ---- Llavero, acceso y bóveda ----

const credencialesEnEntorno = () => Boolean(process.env.CATALOGO_USUARIO && process.env.CATALOGO_CONTRASENA);

// El llavero se abre con las credenciales de un administrador (variables de
// entorno). Sin ellas, se usa la copia local de esta máquina si existe.
async function cargarLlavero(acceso = leerAcceso()) {
  if (credencialesEnEntorno()) {
    try {
      return await abrirLlavero(acceso, process.env.CATALOGO_USUARIO, process.env.CATALOGO_CONTRASENA);
    } catch (e) {
      if (e instanceof ErrorAcceso) {
        throw new ErrorUso("CATALOGO_USUARIO y CATALOGO_CONTRASENA no corresponden a un usuario del catálogo; revisa las variables del entorno.");
      }
      throw new ErrorUso(e.message);
    }
  }
  if (fs.existsSync(LLAVERO)) return leerLlavero(fs.readFileSync(LLAVERO, "utf8"));
  throw new ErrorUso(
    "Para abrir el catálogo hacen falta las credenciales de un administrador.\n" +
      "Configura las variables de entorno CATALOGO_USUARIO y CATALOGO_CONTRASENA en el entorno de\n" +
      "Claude Code (menú del entorno en la barra de título → Editar) y abre una sesión nueva.",
  );
}

// Sella el llavero dentro de acceso.json (una copia por administrador) y,
// si esta sesión no usa variables de entorno, deja una copia local.
async function guardarLlavero(llavero, acceso) {
  const sellado = await sellarLlavero(acceso, llavero);
  guardarAcceso(sellado);
  if (!credencialesEnEntorno() || fs.existsSync(LLAVERO)) {
    fs.mkdirSync(PRIVADO, { recursive: true });
    fs.writeFileSync(LLAVERO, escribirLlavero(llavero), { mode: 0o600 });
  }
  return sellado;
}

const leerAcceso = () => (fs.existsSync(ACCESO) ? JSON.parse(fs.readFileSync(ACCESO, "utf8")) : null);

function guardarAcceso(acceso) {
  const ordenar = (objeto) => Object.fromEntries(Object.entries(objeto ?? {}).sort());
  const ordenado = { ...acceso, usuarios: ordenar(acceso.usuarios), administracion: ordenar(acceso.administracion) };
  fs.writeFileSync(ACCESO, `${JSON.stringify(ordenado, null, 2)}\n`);
}

async function verificarHuella(llavero, acceso = leerAcceso()) {
  if (!acceso?.huella) return;
  const huella = await huellaDEK(llavero.dek);
  if (huella !== acceso.huella) {
    throw new ErrorUso(
      "La llave disponible no corresponde a la bóveda publicada (la huella no coincide).\n" +
        "Si existe .catalogo/llavero.txt, puede ser una copia vieja: bórrala y usa las variables de entorno.",
    );
  }
}

async function leerBoveda(dek) {
  if (!fs.existsSync(BOVEDA)) throw new ErrorUso(`No existe ${rel(BOVEDA)}. Ejecuta "iniciar" para crear un catálogo nuevo.`);
  return descifrarCatalogo(new Uint8Array(fs.readFileSync(BOVEDA)), dek);
}

async function escribirBoveda(paquete, dek) {
  fs.mkdirSync(DATOS_WEB, { recursive: true });
  fs.writeFileSync(BOVEDA, await cifrarCatalogo(paquete, dek));
}

// Datos para consultas: la copia de trabajo si está abierta, si no la bóveda.
async function datosActuales() {
  if (fs.existsSync(FUENTE)) return leerFuente(FUENTE).datos;
  const llavero = await cargarLlavero();
  return leerBoveda(llavero.dek);
}

// ---- Contraseñas ----

const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789"; // sin 0/o, 1/l/i

export function generarContrasena(grupos = 4, largo = 4) {
  const limite = 256 - (256 % ALFABETO.length); // rechazo para evitar sesgo
  const caracteres = [];
  while (caracteres.length < grupos * largo) {
    for (const b of aleatorio(32)) {
      if (b < limite && caracteres.length < grupos * largo) caracteres.push(ALFABETO[b % ALFABETO.length]);
    }
  }
  const bloques = [];
  for (let i = 0; i < grupos; i++) bloques.push(caracteres.slice(i * largo, (i + 1) * largo).join(""));
  return bloques.join("-");
}

async function entradaAcceso(dek, kek, sal, usuario) {
  const id = await idUsuario(usuario);
  return [id, { sal: aB64(sal), iteraciones: ITERACIONES, ...(await envolverDEK(dek, kek, id)) }];
}

// Vuelve a envolver la DEK para todos los usuarios del llavero (tras rotarla).
async function reenvolverTodos(acceso, llavero) {
  const nuevos = {};
  for (const [usuario, kek] of llavero.usuarios) {
    const id = await idUsuario(usuario);
    const previa = acceso.usuarios[id];
    if (!previa) continue;
    nuevos[id] = { sal: previa.sal, iteraciones: previa.iteraciones ?? ITERACIONES, ...(await envolverDEK(llavero.dek, kek, id)) };
  }
  const perdidos = Object.keys(acceso.usuarios).filter((id) => !nuevos[id]);
  if (perdidos.length) {
    throw new ErrorUso(
      `Hay ${perdidos.length} usuario(s) en acceso.json sin KEK en el llavero; no puedo rotar la llave sin perder su acceso.\n` +
        `Restablece su contraseña con "usuario contrasena <usuario>" o quítalos antes de rotar.`,
    );
  }
  return { ...acceso, huella: await huellaDEK(llavero.dek), usuarios: nuevos };
}

// Aplica un cambio al registro de usuarios (que viaja cifrado) en la bóveda
// y, si está abierta, en la copia de trabajo, sin tocar otros cambios.
async function actualizarRegistro(dekLeer, dekEscribir, cambiar, nota) {
  const datos = await leerBoveda(dekLeer);
  const usuarios = cambiar([...(datos.usuarios ?? [])]);
  const bitacora = [...(datos.bitacora ?? []), { fecha: new Date().toISOString(), resumen: nota, cambios: [] }];
  await escribirBoveda(empaquetar({ ...datos, usuarios, bitacora }), dekEscribir);
  if (fs.existsSync(FUENTE)) {
    for (const [archivo, valor] of [["usuarios.json", usuarios], ["bitacora.json", bitacora]]) {
      fs.writeFileSync(path.join(FUENTE, archivo), `${JSON.stringify(valor, null, 2)}\n`);
    }
  }
}

// ---- Comandos ----

const comandos = {
  async abrir(_, opciones) {
    const llavero = await cargarLlavero();
    await verificarHuella(llavero);
    const datos = await leerBoveda(llavero.dek);
    if (fs.existsSync(FUENTE) && !opciones.forzar) {
      const cambios = diferencias(datos, leerFuente(FUENTE).datos);
      if (!cambios.vacio) {
        throw new ErrorUso(
          `La copia de trabajo ${rel(FUENTE)} tiene cambios que no están en la bóveda.\n` +
            `Guárdalos con "cerrar", revísalos con "estado" o descártalos con "abrir --forzar".`,
        );
      }
    }
    escribirFuente(FUENTE, datos);
    console.log(`Catálogo abierto en ${rel(FUENTE)}/`);
    console.log(
      `  ${datos.productos.length} productos · ${datos.cotizaciones.length} cotizaciones · ` +
        `${datos.proveedores.length} proveedores · ${datos.fichas.length} fichas técnicas`,
    );
    console.log(`  Última actualización: ${datos.generado ?? "desconocida"}`);
  },

  async cerrar(_, opciones) {
    const llavero = await cargarLlavero();
    await verificarHuella(llavero);
    const { datos, errores: erroresLectura, archivos } = leerFuente(FUENTE);
    const { errores, avisos } = validar(datos, { archivos });
    imprimirLista("Avisos", avisos);
    if (erroresLectura.length || errores.length) {
      imprimirLista("Errores", [...erroresLectura, ...errores], 200);
      throw new ErrorUso("No se guardó nada: corrige los errores y vuelve a ejecutar cerrar.");
    }
    const anterior = fs.existsSync(BOVEDA) ? await leerBoveda(llavero.dek) : null;
    const cambios = diferencias(anterior, datos);
    const nota = typeof opciones.nota === "string" ? opciones.nota.trim() : "";
    if (cambios.vacio && !nota) {
      console.log("\nSin cambios respecto a la bóveda; no se reescribió nada.");
      return;
    }
    const descripcion = describirCambios(cambios, datos);
    const entrada = { fecha: new Date().toISOString(), resumen: nota || descripcion.resumen, cambios: descripcion.cambios };
    const paquete = empaquetar({ ...datos, bitacora: [...(datos.bitacora ?? []), entrada] });
    await escribirBoveda(paquete, llavero.dek);
    escribirFuente(FUENTE, paquete);
    titulo("Bóveda actualizada");
    console.log(descripcion.cambios.map((c) => `  · ${c}`).join("\n") || "  · Ajustes internos");
    console.log(`\nArchivo cifrado: ${rel(BOVEDA)}`);
    console.log(`Mensaje de commit sugerido (sin datos sensibles; el repo es público):`);
    console.log(`  Catálogo: ${descripcion.resumen}`);
  },

  async estado() {
    const llavero = await cargarLlavero();
    const anterior = await leerBoveda(llavero.dek);
    const { datos, errores: erroresLectura } = leerFuente(FUENTE);
    const cambios = diferencias(anterior, datos);
    if (erroresLectura.length) imprimirLista("Archivos con errores", erroresLectura);
    if (cambios.vacio) {
      console.log("La copia de trabajo coincide con la bóveda: no hay nada pendiente.");
      return;
    }
    const { cambios: detalle } = describirCambios(cambios, datos);
    imprimirLista("Pendiente de guardar con cerrar", detalle, 200);
  },

  async validar() {
    const { datos, errores: erroresLectura, archivos } = leerFuente(FUENTE);
    const { errores, avisos } = validar(datos, { archivos });
    imprimirLista("Avisos", avisos, 200);
    imprimirLista("Errores", [...erroresLectura, ...errores], 200);
    if (erroresLectura.length || errores.length) throw new ErrorUso("La validación encontró errores.");
    console.log(`\nValidación correcta${avisos.length ? " (con avisos)" : ""}.`);
  },

  async arbol(_, opciones) {
    const indice = construirIndice(await datosActuales());
    const pintar = (nodos, sangria) => {
      for (const n of nodos) {
        const atributos = opciones.atributos && n.atributos.length ? `  [${n.atributos.join(", ")}]` : "";
        const hoja = n.hijos.length ? "" : " ·";
        console.log(`${"  ".repeat(sangria)}${n.id.padEnd(28 - 2 * sangria)} ${n.nombre} (${n.total})${hoja}${atributos}`);
        pintar(n.hijos, sangria + 1);
      }
    };
    console.log("id                           nombre (productos)   · = familia final, donde cuelgan los productos");
    pintar(indice.raices, 0);
  },

  async buscar(posicionales, opciones) {
    const texto = posicionales.join(" ");
    if (!texto) throw new ErrorUso('Uso: buscar <texto>   (p. ej. buscar "valvula compuerta 4 in")');
    const indice = construirIndice(await datosActuales());
    const resultados = crearBuscador(indice).buscar(texto, { limite: Number(opciones.limite) || 15 });
    if (!resultados.length) return console.log("Sin resultados.");
    for (const r of resultados) {
      const o = r.objeto;
      if (r.tipo === "producto") {
        const u = o.resumen.ultimo;
        console.log(`\n[producto] ${o.id}  ${o.nombre}  (por ${o.unidad})`);
        console.log(`   ${rutaNombres(indice, o.nodo).join(" › ")}  ·  categoría: ${o.categoria}`);
        const attrs = Object.entries(o.atributos).map(([k, v]) => `${k}: ${v}`).join(" · ");
        if (attrs) console.log(`   ${attrs}`);
        if (u) {
          console.log(
            `   ${o.resumen.n} cotización(es); última ${dinero(u.precio.puMXN)} MXN sin IVA, ` +
              `${u.cotizacion.proveedorObj?.nombre ?? u.cotizacion.proveedor}, ${u.cotizacion.fecha}`,
          );
          const marcas = [...new Set(o.resumen.ofertas.map((x) => [x.marca, x.modelo].filter(Boolean).join(" ")).filter(Boolean))];
          if (marcas.length) console.log(`   marcas cotizadas: ${marcas.join(" | ")}`);
        }
      } else if (r.tipo === "proveedor") {
        console.log(`\n[proveedor] ${o.id}  ${o.nombre}  ${o.ciudad ?? ""}  (${o.cotizaciones.length} cotizaciones)`);
        if (o.contactos.length) console.log(`   contactos: ${o.contactos.map((k) => `${k.id} (${k.nombre})`).join(", ")}`);
      } else if (r.tipo === "cotizacion") {
        console.log(`\n[cotización] ${o.id}  ${o.proveedorObj?.nombre ?? o.proveedor}  folio ${o.folio ?? "s/f"}  ${o.fecha}`);
      } else {
        console.log(`\n[ficha] ${o.id}  ${o.titulo}  → ${o.producto}`);
      }
    }
  },

  async producto([id]) {
    if (!id) throw new ErrorUso("Uso: producto <P-0001>");
    const indice = construirIndice(await datosActuales());
    const p = indice.productos.get(id);
    if (!p) throw new ErrorUso(`No existe ${id}.`);
    titulo(`${p.id} · ${p.nombre}`);
    console.log(`Categoría: ${rutaNombres(indice, p.nodo).join(" › ")} (${p.categoria}) · unidad: ${p.unidad} · tipo: ${p.tipo}`);
    for (const [k, v] of Object.entries(p.atributos)) console.log(`  ${k}: ${v}`);
    if (p.fichas.length) console.log(`Fichas: ${p.fichas.map((f) => f.id).join(", ")}`);
    if (!p.resumen.n) return console.log("\nSin cotizaciones.");
    console.log("\nCotizaciones (más reciente primero), P.U. en MXN sin IVA por unidad del producto:");
    for (const o of p.resumen.ofertas) {
      const c = o.cotizacion;
      const original = o.precio.moneda !== "MXN" || o.precio.ivaIncluido || o.precio.equivalencia !== 1
        ? `  [orig. ${dinero(o.precio.puOriginal, o.precio.moneda)} ${o.unidad ?? ""}${o.precio.moneda !== "MXN" ? `, TC ${o.precio.tc}` : ""}${o.precio.ivaIncluido ? ", IVA incl." : ""}]`
        : "";
      console.log(
        `  ${c.fecha}  ${c.id}  ${(c.proveedorObj?.nombre ?? c.proveedor).padEnd(30)} ${dinero(o.precio.puMXN).padStart(14)}  ` +
          `${[o.marca, o.modelo].filter(Boolean).join(" ")} ${c.estado}${original}`,
      );
      if (o.diferencias.length) console.log(`      diferencias: ${o.diferencias.join("; ")}`);
    }
  },

  async siguiente([tipo, cuantos = "1"]) {
    const prefijo = PREFIJOS[tipo];
    if (!prefijo) throw new ErrorUso("Uso: siguiente <producto|cotizacion|ficha> [cuántos]");
    const datos = await datosActuales();
    const coleccion = { "P-": "productos", "C-": "cotizaciones", "FT-": "fichas" }[prefijo];
    const usados = (datos[coleccion] ?? []).map((r) => Number(String(r.id).slice(prefijo.length))).filter(Number.isFinite);
    let n = usados.length ? Math.max(...usados) : 0;
    const ids = [];
    for (let i = 0; i < Number(cuantos); i++) ids.push(`${prefijo}${String(++n).padStart(4, "0")}`);
    console.log(ids.join("\n"));
  },

  // Nombre, carpeta y descripción que debe llevar el PDF en Drive.
  async archivo([id]) {
    if (!id) throw new ErrorUso("Uso: archivo <C-0001|FT-0001>");
    const datos = await datosActuales();
    if (id.startsWith("C-")) {
      const c = datos.cotizaciones.find((x) => x.id === id);
      if (!c) throw new ErrorUso(`No existe ${id} en la copia de trabajo.`);
      const proveedor = datos.proveedores.find((p) => p.id === c.proveedor);
      const folio = c.folio ? `_${slug(c.folio).toUpperCase()}` : "";
      console.log(`Nombre:      ${c.fecha}_${c.id}_${c.proveedor}${folio}.pdf`);
      console.log(`Carpeta:     Catálogo de cotizaciones · Agua potable/01 Cotizaciones/${c.fecha.slice(0, 4)}/`);
      console.log(
        `Descripción: ${c.id} · Cotización${c.folio ? ` ${c.folio}` : ""} de ${proveedor?.nombre ?? c.proveedor} (${c.fecha}). ` +
          `Catálogo: ${URL_SITIO}#/cotizacion/${c.id}`,
      );
    } else if (id.startsWith("FT-")) {
      const f = datos.fichas.find((x) => x.id === id);
      if (!f) throw new ErrorUso(`No existe ${id} en la copia de trabajo.`);
      const fabricante = f.fabricante || "Sin fabricante";
      const modelo = [slug(f.fabricante ?? ""), slug(f.modelo ?? "")].filter(Boolean).join("_") || "ficha";
      console.log(`Nombre:      ${f.id}_${f.producto}_${modelo}.pdf`);
      console.log(`Carpeta:     Catálogo de cotizaciones · Agua potable/02 Fichas técnicas/${fabricante}/`);
      console.log(`Descripción: ${f.id} · ${f.titulo}. Producto ${f.producto}. Catálogo: ${URL_SITIO}#/ficha/${f.id}`);
    } else throw new ErrorUso("El id debe ser de cotización (C-…) o de ficha técnica (FT-…).");
  },

  async usuario([accion, nombre], opciones) {
    if (accion === "listar") return listarUsuarios();
    if (!["agregar", "quitar", "contrasena", "admin"].includes(accion) || !nombre) {
      throw new ErrorUso(
        'Uso: usuario agregar <usuario> [--nombre "Nombre Apellido"] [--admin] [--contrasena X]\n' +
          "     usuario contrasena <usuario> [--contrasena X]\n" +
          "     usuario admin <usuario>      (le permite editar el catálogo)\n" +
          "     usuario quitar <usuario>\n" +
          "     usuario listar",
      );
    }
    const usuario = normalizarUsuario(nombre);
    if (!esUsuarioValido(usuario)) throw new ErrorUso("Usuario inválido: 2 a 32 caracteres, minúsculas, números, punto, guion o guion bajo.");
    const acceso = leerAcceso();
    const llavero = await cargarLlavero(acceso);
    await verificarHuella(llavero, acceso);
    const id = await idUsuario(usuario);
    const existe = Boolean(acceso.usuarios[id]);

    if (accion === "quitar") {
      if (!existe) throw new ErrorUso(`"${usuario}" no tiene acceso.`);
      if (llavero.admins.has(usuario) && llavero.admins.size === 1) {
        throw new ErrorUso(`"${usuario}" es el único administrador; nombra otro antes de quitarlo.`);
      }
      const dekVieja = llavero.dek;
      llavero.usuarios.delete(usuario);
      llavero.admins.delete(usuario);
      delete acceso.usuarios[id];
      // Se rota la DEK: quien se va no podrá leer versiones nuevas aunque haya guardado la llave anterior.
      llavero.dek = nuevaDEK();
      const nuevoAcceso = await reenvolverTodos(acceso, llavero);
      await actualizarRegistro(dekVieja, llavero.dek, (lista) => lista.filter((u) => u.usuario !== usuario), `Baja de acceso: ${usuario}`);
      await guardarLlavero(llavero, nuevoAcceso);
      console.log(`Se quitó a "${usuario}" y se rotó la llave del catálogo. Las contraseñas de los demás no cambian.`);
      avisoCommit();
      return;
    }

    if (accion === "admin") {
      if (!existe || !llavero.usuarios.has(usuario)) throw new ErrorUso(`"${usuario}" no existe o su llave no está en el llavero.`);
      llavero.admins.add(usuario);
      await guardarLlavero(llavero, acceso);
      console.log(`"${usuario}" ahora es administrador: con sus credenciales en el entorno puede editar el catálogo.`);
      avisoCommit();
      return;
    }

    if (accion === "agregar" && existe) throw new ErrorUso(`"${usuario}" ya existe. Para cambiar su contraseña: usuario contrasena ${usuario}`);
    if (accion === "contrasena" && !existe) throw new ErrorUso(`"${usuario}" no existe. Para darlo de alta: usuario agregar ${usuario}`);
    const contrasena = typeof opciones.contrasena === "string" ? opciones.contrasena : generarContrasena();
    if (contrasena.length < 12) throw new ErrorUso("La contraseña debe tener al menos 12 caracteres (el archivo de acceso es público).");
    const sal = aleatorio(16);
    const kek = await derivarKEK(contrasena, sal);
    const [, entrada] = await entradaAcceso(llavero.dek, kek, sal, usuario);
    acceso.usuarios[id] = entrada;
    llavero.usuarios.set(usuario, kek);
    // El primer usuario del catálogo es administrador.
    if (opciones.admin === true || llavero.admins.size === 0) llavero.admins.add(usuario);
    await actualizarRegistro(
      llavero.dek,
      llavero.dek,
      (lista) => {
        const resto = lista.filter((u) => u.usuario !== usuario);
        const previo = lista.find((u) => u.usuario === usuario);
        const nombreVisible = typeof opciones.nombre === "string" ? opciones.nombre : previo?.nombre ?? usuario;
        return [...resto, { usuario, nombre: nombreVisible, alta: previo?.alta ?? hoyISO() }].sort((a, b) => a.usuario.localeCompare(b.usuario));
      },
      accion === "agregar" ? `Alta de acceso: ${usuario}` : `Cambio de contraseña: ${usuario}`,
    );
    await guardarLlavero(llavero, acceso);
    titulo(accion === "agregar" ? `Usuario "${usuario}" creado` : `Contraseña de "${usuario}" actualizada`);
    console.log(`  Usuario:       ${usuario}${llavero.admins.has(usuario) ? "   (administrador)" : ""}`);
    console.log(`  Contraseña:    ${contrasena}`);
    console.log("  Compártela por un canal privado; no se puede recuperar, solo restablecer.");
    if (typeof opciones["archivo-contrasena"] === "string") {
      fs.writeFileSync(opciones["archivo-contrasena"], `${usuario}\n${contrasena}\n`, { mode: 0o600 });
    }
    if (llavero.admins.has(usuario) && accion === "contrasena") {
      console.log("  Es administrador: actualiza también CATALOGO_CONTRASENA en el entorno de Claude Code.");
    }
    avisoCommit();
  },

  async verificar() {
    const acceso = leerAcceso();
    const llavero = await cargarLlavero(acceso);
    await verificarHuella(llavero, acceso);
    const datos = await leerBoveda(llavero.dek);
    const problemas = [];
    for (const [usuario, kek] of llavero.usuarios) {
      const id = await idUsuario(usuario);
      const entrada = acceso.usuarios[id];
      if (!entrada) {
        problemas.push(`${usuario}: está en el llavero pero no en acceso.json`);
        continue;
      }
      try {
        const dek = await desenvolverDEK(entrada, kek, id);
        if (aHex(dek) !== aHex(llavero.dek)) problemas.push(`${usuario}: su entrada abre otra llave`);
      } catch {
        problemas.push(`${usuario}: su entrada en acceso.json no abre con su KEK`);
      }
    }
    const conLlave = new Set(await Promise.all([...llavero.usuarios.keys()].map(idUsuario)));
    const huerfanos = Object.keys(acceso.usuarios).filter((id) => !conLlave.has(id));
    if (huerfanos.length) problemas.push(`${huerfanos.length} entrada(s) de acceso.json sin KEK en el llavero`);
    for (const admin of llavero.admins) {
      if (!acceso.administracion?.[await idUsuario(admin)]) problemas.push(`${admin}: es administrador pero no tiene llavero sellado`);
    }
    const registrados = new Set((datos.usuarios ?? []).map((u) => u.usuario));
    for (const usuario of llavero.usuarios.keys()) if (!registrados.has(usuario)) problemas.push(`${usuario}: no está en el registro de usuarios de la bóveda`);
    if (problemas.length) {
      imprimirLista("Problemas", problemas);
      throw new ErrorUso("La verificación encontró inconsistencias.");
    }
    console.log(`Todo concuerda: ${llavero.usuarios.size} usuario(s), ${llavero.admins.size} administrador(es), bóveda legible (${datos.productos.length} productos, ${datos.cotizaciones.length} cotizaciones).`);
  },

  async clave([accion]) {
    if (accion !== "rotar") throw new ErrorUso("Uso: clave rotar");
    const acceso = leerAcceso();
    const llavero = await cargarLlavero(acceso);
    await verificarHuella(llavero, acceso);
    const dekVieja = llavero.dek;
    llavero.dek = nuevaDEK();
    const nuevoAcceso = await reenvolverTodos(acceso, llavero);
    await actualizarRegistro(dekVieja, llavero.dek, (lista) => lista, "Rotación de la llave del catálogo");
    await guardarLlavero(llavero, nuevoAcceso);
    console.log("Llave rotada. Las contraseñas no cambian; las sesiones guardadas en los navegadores tendrán que entrar de nuevo.");
    avisoCommit();
  },

  async iniciar(_, opciones) {
    if ((fs.existsSync(BOVEDA) || fs.existsSync(ACCESO)) && !opciones.forzar) {
      throw new ErrorUso("Ya existe un catálogo. Usa --forzar solo si quieres empezar de cero (se pierde el acceso al anterior).");
    }
    const llavero = { dek: nuevaDEK(), usuarios: new Map(), admins: new Set() };
    const datos = empaquetar({
      config: {
        titulo: "Catálogo de cotizaciones · Agua potable",
        moneda_base: "MXN",
        iva: 0.16,
        url_sitio: URL_SITIO,
        drive: {},
      },
      taxonomia: JSON.parse(fs.readFileSync(SEMILLA, "utf8")),
      usuarios: [],
      bitacora: [{ fecha: new Date().toISOString(), resumen: "Creación del catálogo", cambios: ["Taxonomía inicial de agua potable"] }],
    });
    const { errores } = validar(datos);
    if (errores.length) {
      imprimirLista("Errores en la semilla", errores);
      throw new ErrorUso("La taxonomía semilla no es válida.");
    }
    await escribirBoveda(datos, llavero.dek);
    // Sin usuarios todavía no hay a quién sellarle el llavero: queda en la copia local
    // hasta dar de alta al primer usuario (que será administrador).
    guardarAcceso({
      formato: "catalogo-wr-acceso",
      version: 1,
      kdf: { algoritmo: "PBKDF2-SHA256", iteraciones: ITERACIONES },
      huella: await huellaDEK(llavero.dek),
      usuarios: {},
      administracion: {},
    });
    fs.mkdirSync(PRIVADO, { recursive: true });
    fs.writeFileSync(LLAVERO, escribirLlavero(llavero), { mode: 0o600 });
    escribirFuente(FUENTE, datos);
    console.log(`Catálogo creado: ${rel(BOVEDA)} y ${rel(ACCESO)}.`);
    console.log('Siguiente paso: npm run catalogo -- usuario agregar <usuario> --nombre "Nombre"   (el primero será administrador)');
  },

  // Sitio de prueba con datos ficticios, para revisar la interfaz.
  async demo(_, opciones) {
    const destino = path.resolve(typeof opciones.destino === "string" ? opciones.destino : path.join(PRIVADO, "demo"));
    const crudo = JSON.parse(fs.readFileSync(DEMO, "utf8"));
    const datos = desplazarFechas(crudo, diasEntre(crudo.referencia, hoyISO()));
    datos.taxonomia = JSON.parse(fs.readFileSync(SEMILLA, "utf8"));
    const { errores } = validar(datos);
    if (errores.length) {
      imprimirLista("Errores en los datos demo", errores);
      throw new ErrorUso("Los datos demo no son válidos.");
    }
    const paquete = empaquetar({
      ...datos,
      usuarios: [{ usuario: "demo", nombre: "Usuario Demo", alta: hoyISO() }],
      bitacora: crudo.bitacora ?? [],
    });
    fs.rmSync(destino, { recursive: true, force: true });
    fs.mkdirSync(destino, { recursive: true });
    fs.cpSync(path.join(RAIZ, "catalogo"), path.join(destino, "catalogo"), {
      recursive: true,
      // Sin los datos reales ni las herramientas (el demo solo lleva la web)
      filter: (origen) => {
        const relativo = path.relative(path.join(RAIZ, "catalogo"), origen).split(path.sep)[0];
        return relativo !== "datos" && relativo !== "herramientas";
      },
    });
    for (const archivo of ["index.html", "css/styles.css"]) {
      fs.mkdirSync(path.dirname(path.join(destino, archivo)), { recursive: true });
      fs.copyFileSync(path.join(RAIZ, archivo), path.join(destino, archivo));
    }
    const dek = nuevaDEK();
    const sal = aleatorio(16);
    const contrasena = typeof opciones.contrasena === "string" ? opciones.contrasena : "demo-catalogo";
    const [id, entrada] = await entradaAcceso(dek, await derivarKEK(contrasena, sal), sal, "demo");
    fs.mkdirSync(path.join(destino, "catalogo", "datos"), { recursive: true });
    fs.writeFileSync(path.join(destino, "catalogo", "datos", "catalogo.enc"), await cifrarCatalogo(paquete, dek));
    fs.writeFileSync(
      path.join(destino, "catalogo", "datos", "acceso.json"),
      JSON.stringify({ formato: "catalogo-wr-acceso", version: 1, kdf: { algoritmo: "PBKDF2-SHA256", iteraciones: ITERACIONES }, huella: await huellaDEK(dek), usuarios: { [id]: entrada } }, null, 2),
    );
    console.log(`Sitio demo en ${destino}`);
    console.log(`Sírvelo con: npx serve "${destino}"  y abre /catalogo/  (usuario: demo · contraseña: ${contrasena})`);
  },

  ayuda() {
    console.log(`Catálogo de cotizaciones · comandos (npm run catalogo -- <comando>)

Sesión de trabajo
  abrir [--forzar]            Descifra la bóveda en .catalogo/fuente/
  estado                      Qué cambió en la copia de trabajo respecto a la bóveda
  validar                     Revisa reglas y referencias sin guardar
  cerrar [--nota "texto"]     Valida, anota en la bitácora y vuelve a cifrar

Consultas (usan la copia de trabajo si está abierta)
  arbol [--atributos]         Taxonomía con ids, conteos y atributos sugeridos
  buscar <texto>              Encuentra productos, proveedores, cotizaciones y fichas
  producto <P-0001>           Detalle de un producto y todas sus cotizaciones
  siguiente <tipo> [n]        Próximo id libre: producto, cotizacion o ficha
  archivo <C-0001|FT-0001>    Nombre, carpeta y descripción del PDF en Drive

Acceso (requiere credenciales de administrador)
  usuario agregar <u> [--nombre "Nombre"] [--admin] [--contrasena X]
  usuario contrasena <u> [--contrasena X]
  usuario admin <u>           Le permite editar el catálogo
  usuario quitar <u>          Quita el acceso y rota la llave
  usuario listar
  clave rotar                 Nueva llave de datos (las contraseñas no cambian)
  verificar                   Comprueba que acceso.json, llavero y bóveda concuerdan

Otros
  iniciar [--forzar]          Crea un catálogo vacío con la taxonomía semilla
  demo [--destino dir]        Sitio de prueba con datos ficticios (usuario demo)`);
  },
};

async function listarUsuarios() {
  const acceso = leerAcceso();
  const llavero = await cargarLlavero(acceso);
  const datos = await leerBoveda(llavero.dek);
  titulo(`Usuarios con acceso (${Object.keys(acceso?.usuarios ?? {}).length} en acceso.json)`);
  for (const u of datos.usuarios ?? []) {
    const id = await idUsuario(u.usuario);
    const marcas = [
      acceso?.usuarios[id] ? "puede entrar" : "SIN ACCESO",
      llavero.admins.has(u.usuario) ? "administrador" : "",
      llavero.usuarios.has(u.usuario) ? "" : "sin llave en el llavero",
    ];
    console.log(`  ${u.usuario.padEnd(16)} ${String(u.nombre ?? "").padEnd(28)} alta ${u.alta ?? "?"}   ${marcas.filter(Boolean).join(" · ")}`);
  }
}

function avisoCommit() {
  console.log(`\nCambiaron ${rel(ACCESO)} y ${rel(BOVEDA)}: haz commit y push de catalogo/datos/ para publicarlo.`);
}

// Corre las fechas de los datos demo para que las vigencias sigan teniendo sentido.
function desplazarFechas(datos, dias) {
  const mover = (iso) => (iso ? sumarDias(iso, dias) : iso);
  const copia = structuredClone(datos);
  for (const c of copia.cotizaciones ?? []) {
    c.fecha = mover(c.fecha);
    c.vigencia = mover(c.vigencia);
    if (c.tipo_cambio) c.tipo_cambio.fecha = mover(c.tipo_cambio.fecha);
  }
  for (const f of copia.fichas ?? []) f.fecha = mover(f.fecha);
  for (const b of copia.bitacora ?? []) b.fecha = `${mover(b.fecha.slice(0, 10))}${b.fecha.slice(10)}`;
  return copia;
}

// ---- Punto de entrada ----

const ejecutadoDirecto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ejecutadoDirecto) {
  const [comando = "ayuda", ...resto] = process.argv.slice(2);
  const { posicionales, opciones } = argumentos(resto);
  const accion = comandos[comando];
  try {
    if (!accion) throw new ErrorUso(`Comando desconocido "${comando}". Ejecuta "ayuda".`);
    await accion(posicionales, opciones);
  } catch (e) {
    console.error(e instanceof ErrorUso ? `\n${e.message}` : e);
    process.exitCode = 1;
  }
}

export { comandos };
