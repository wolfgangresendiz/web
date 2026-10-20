// ============================================================
//  Bóveda cifrada del catálogo
// ============================================================
//
// El repositorio es público, así que los datos se publican cifrados:
//
//   catalogo.enc = "WRC1" ‖ iv (12 bytes) ‖ AES-256-GCM(DEK, gzip(JSON))
//
// La llave de datos (DEK) nunca se publica. Para cada usuario,
// acceso.json guarda una copia de la DEK envuelta con una llave
// derivada de su contraseña:
//
//   KEK = PBKDF2-SHA256(contraseña, sal, 600 000 iteraciones)
//
// Al entrar, el navegador deriva la KEK, desenvuelve la DEK y descifra
// el catálogo. Sin una contraseña válida los datos son ilegibles.
//
// El mismo módulo corre en el navegador y en Node ≥ 20 (los dos traen
// WebCrypto y CompressionStream), así que la web y las herramientas
// de línea de comandos cifran y descifran con el mismo código.

const subtle = globalThis.crypto.subtle;
const codificador = new TextEncoder();
const decodificador = new TextDecoder();

const MAGIA = codificador.encode("WRC1");
const LARGO_IV = 12;
export const ITERACIONES = 600_000;
const PREFIJO_USUARIO = "catalogo-wr:";

export class ErrorAcceso extends Error {
  constructor() {
    super("Usuario o contraseña incorrectos");
    this.name = "ErrorAcceso";
  }
}

// ---- Codificación ----

export const aHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function deHex(hex) {
  const limpio = String(hex).trim().toLowerCase();
  if (!/^([0-9a-f]{2})+$/.test(limpio)) throw new Error("Texto hexadecimal inválido");
  return Uint8Array.from(limpio.match(/../g), (par) => parseInt(par, 16));
}

// Solo para valores cortos (llaves, sales, vectores de inicialización).
export const aB64 = (bytes) => btoa(String.fromCharCode(...bytes));
export const deB64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

export const aleatorio = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// ---- Compresión ----

async function transformar(bytes, flujo) {
  const salida = new Blob([bytes]).stream().pipeThrough(flujo);
  return new Uint8Array(await new Response(salida).arrayBuffer());
}

const comprimir = (bytes) => transformar(bytes, new CompressionStream("gzip"));
const descomprimir = (bytes) => transformar(bytes, new DecompressionStream("gzip"));

// ---- Catálogo ----

const llaveAES = (bytes, usos) => subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, usos);

export const nuevaDEK = () => aleatorio(32);

export async function cifrarCatalogo(datos, dek) {
  const iv = aleatorio(LARGO_IV);
  const plano = await comprimir(codificador.encode(JSON.stringify(datos)));
  const llave = await llaveAES(dek, ["encrypt"]);
  const cifrado = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv, additionalData: MAGIA }, llave, plano),
  );
  const salida = new Uint8Array(MAGIA.length + LARGO_IV + cifrado.length);
  salida.set(MAGIA, 0);
  salida.set(iv, MAGIA.length);
  salida.set(cifrado, MAGIA.length + LARGO_IV);
  return salida;
}

export async function descifrarCatalogo(bytes, dek) {
  const datos = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!MAGIA.every((b, i) => datos[i] === b)) throw new Error("El archivo no es un catálogo cifrado");
  const iv = datos.subarray(MAGIA.length, MAGIA.length + LARGO_IV);
  const llave = await llaveAES(dek, ["decrypt"]);
  const plano = await subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: MAGIA },
    llave,
    datos.subarray(MAGIA.length + LARGO_IV),
  );
  return JSON.parse(decodificador.decode(await descomprimir(new Uint8Array(plano))));
}

// Huella corta de la DEK: permite comprobar que el llavero local y
// acceso.json corresponden a la misma llave sin revelarla.
export async function huellaDEK(dek) {
  return aHex(new Uint8Array(await subtle.digest("SHA-256", dek))).slice(0, 16);
}

// ---- Usuarios ----

export const normalizarUsuario = (usuario) => String(usuario ?? "").normalize("NFKC").trim().toLowerCase();

// acceso.json no guarda nombres de usuario, solo este resumen.
export async function idUsuario(usuario) {
  const resumen = await subtle.digest("SHA-256", codificador.encode(PREFIJO_USUARIO + normalizarUsuario(usuario)));
  return aHex(new Uint8Array(resumen));
}

export async function derivarKEK(contrasena, sal, iteraciones = ITERACIONES) {
  const base = await subtle.importKey(
    "raw",
    codificador.encode(String(contrasena).normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteraciones },
    base,
    256,
  );
  return new Uint8Array(bits);
}

export async function envolverDEK(dek, kek, id) {
  const iv = aleatorio(LARGO_IV);
  const llave = await llaveAES(kek, ["encrypt"]);
  const envuelta = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv, additionalData: codificador.encode(id) }, llave, dek),
  );
  return { iv: aB64(iv), llave: aB64(envuelta) };
}

export async function desenvolverDEK(entrada, kek, id) {
  const llave = await llaveAES(kek, ["decrypt"]);
  const dek = await subtle.decrypt(
    { name: "AES-GCM", iv: deB64(entrada.iv), additionalData: codificador.encode(id) },
    llave,
    deB64(entrada.llave),
  );
  return new Uint8Array(dek);
}

// Inicio de sesión completo: devuelve la DEK o lanza ErrorAcceso.
export async function entrar(acceso, usuario, contrasena) {
  const id = await idUsuario(usuario);
  const entrada = acceso?.usuarios?.[id];
  const iteraciones = entrada?.iteraciones ?? acceso?.kdf?.iteraciones ?? ITERACIONES;
  // Si el usuario no existe se deriva de todos modos, para que el tiempo
  // de respuesta no delate qué usuarios existen.
  const kek = await derivarKEK(contrasena, entrada ? deB64(entrada.sal) : aleatorio(16), iteraciones);
  if (!entrada) throw new ErrorAcceso();
  try {
    return await desenvolverDEK(entrada, kek, id);
  } catch {
    throw new ErrorAcceso();
  }
}
