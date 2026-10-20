// ============================================================
//  Llavero: la llave de datos (DEK) y la KEK de cada usuario
// ============================================================
//
// El llavero viaja sellado dentro de acceso.json (campo "administracion"):
// una copia por administrador, cifrada con la KEK de su contraseña.
// Así, con el usuario y la contraseña de un administrador basta para
// editar el catálogo; no hay archivos de llaves que guardar aparte.
//
// En una sesión de Claude Code, la CLI lee esas credenciales de las
// variables de entorno CATALOGO_USUARIO y CATALOGO_CONTRASENA (se
// configuran en el entorno, nunca se escriben en el chat ni en el repo).
//
// Guardar la KEK de cada usuario (y no su contraseña) permite envolver
// una DEK nueva para todos sin pedirles nada, por ejemplo al dar de baja
// a alguien. Los usuarios que no son administradores no pueden abrir el
// llavero, así que quien se va no conserva las KEK de los demás.

import {
  ErrorAcceso,
  ITERACIONES,
  aB64,
  aHex,
  aleatorio,
  deB64,
  deHex,
  derivarKEK,
  desenvolverDEK,
  idUsuario,
  normalizarUsuario,
} from "../../catalogo/js/boveda.js";

const subtle = globalThis.crypto.subtle;
const codificador = new TextEncoder();
const decodificador = new TextDecoder();
const CABECERA = "CATALOGO-WR LLAVERO 1";

const llaveAES = (bytes, usos) => subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, usos);
const aad = (id) => codificador.encode(`admin:${id}`);

// ---- Sellado dentro de acceso.json ----

async function sellar(llavero, kek, id) {
  const contenido = {
    dek: aHex(llavero.dek),
    usuarios: Object.fromEntries([...llavero.usuarios].map(([u, k]) => [u, aHex(k)])),
    admins: [...llavero.admins].sort(),
  };
  const iv = aleatorio(12);
  const llave = await llaveAES(kek, ["encrypt"]);
  const datos = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(id) }, llave, codificador.encode(JSON.stringify(contenido)));
  return { iv: aB64(iv), datos: aB64(new Uint8Array(datos)) };
}

async function abrir(sellado, kek, id) {
  const llave = await llaveAES(kek, ["decrypt"]);
  const plano = await subtle.decrypt({ name: "AES-GCM", iv: deB64(sellado.iv), additionalData: aad(id) }, llave, deB64(sellado.datos));
  const contenido = JSON.parse(decodificador.decode(plano));
  return {
    dek: deHex(contenido.dek),
    usuarios: new Map(Object.entries(contenido.usuarios).map(([u, k]) => [u, deHex(k)])),
    admins: new Set(contenido.admins ?? []),
  };
}

// Abre el llavero con las credenciales de un administrador.
export async function abrirLlavero(acceso, usuario, contrasena) {
  const nombre = normalizarUsuario(usuario);
  const id = await idUsuario(nombre);
  const entrada = acceso?.usuarios?.[id];
  if (!entrada) throw new ErrorAcceso();
  const kek = await derivarKEK(contrasena, deB64(entrada.sal), entrada.iteraciones ?? ITERACIONES);
  try {
    await desenvolverDEK(entrada, kek, id);
  } catch {
    throw new ErrorAcceso();
  }
  const sellado = acceso.administracion?.[id];
  if (!sellado) throw new Error(`"${nombre}" puede ver el catálogo pero no es administrador: no puede editarlo.`);
  return abrir(sellado, kek, id);
}

// Vuelve a sellar el llavero para cada administrador (tras cualquier cambio).
export async function sellarLlavero(acceso, llavero) {
  const administracion = {};
  for (const admin of llavero.admins) {
    const kek = llavero.usuarios.get(admin);
    if (!kek) throw new Error(`Falta la KEK del administrador "${admin}"`);
    const id = await idUsuario(admin);
    administracion[id] = await sellar(llavero, kek, id);
  }
  return { ...acceso, administracion };
}

// ---- Copia local en texto (.catalogo/llavero.txt, ignorada por git) ----
//
// Solo para sesiones sin variables de entorno, como la que crea el
// catálogo. Formato de líneas sencillas:
//   CATALOGO-WR LLAVERO 1
//   dek <64 hex>
//   usuario <nombre> <64 hex de su KEK>
//   admin <nombre>

export function leerLlavero(texto) {
  const lineas = String(texto)
    .replace(/\\/g, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas[0] !== CABECERA) throw new Error("El llavero no tiene el formato esperado (cabecera inválida)");
  const llavero = { dek: null, usuarios: new Map(), admins: new Set() };
  for (const linea of lineas.slice(1)) {
    const partes = linea.split(/\s+/);
    if (partes[0] === "dek" && partes.length === 2) llavero.dek = deHex(partes[1]);
    else if (partes[0] === "usuario" && partes.length === 3) llavero.usuarios.set(partes[1], deHex(partes[2]));
    else if (partes[0] === "admin" && partes.length === 2) llavero.admins.add(partes[1]);
    else throw new Error(`Línea no reconocida en el llavero: "${linea.slice(0, 24)}…"`);
  }
  if (!llavero.dek || llavero.dek.length !== 32) throw new Error("El llavero no contiene una DEK válida");
  return llavero;
}

export function escribirLlavero(llavero) {
  const lineas = [CABECERA, `dek ${aHex(llavero.dek)}`];
  for (const [usuario, kek] of [...llavero.usuarios.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lineas.push(`usuario ${usuario} ${aHex(kek)}`);
  }
  for (const admin of [...llavero.admins].sort()) lineas.push(`admin ${admin}`);
  return `${lineas.join("\n")}\n`;
}
