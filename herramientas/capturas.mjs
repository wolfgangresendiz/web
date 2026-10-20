#!/usr/bin/env node
// ============================================================
//  Capturas de pantalla del catálogo demo (revisión visual)
// ============================================================
//
// Genera el sitio demo, lo sirve en un puerto local, entra con el
// usuario demo y fotografía las vistas principales en escritorio y
// celular. También reporta errores de la consola del navegador.
//
// Uso: npm run capturas -- [--salida dir] [--oscuro]
//      npm run capturas -- --real --credenciales archivo   (sitio real; el
//      archivo trae el usuario en la 1.ª línea y la contraseña en la 2.ª)
// Requiere Playwright instalado (global o en el proyecto).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { comandos } from "./catalogo.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opcion = (nombre, defecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] ?? true : defecto;
};
const SALIDA = path.resolve(opcion("salida", path.join(RAIZ, ".catalogo", "capturas")));
const DEMO = path.join(RAIZ, ".catalogo", "demo");
const OSCURO = args.includes("--oscuro");
const REAL = args.includes("--real");

function cargarPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require("playwright");
  } catch {
    const global = execSync("npm root -g").toString().trim();
    return require(require.resolve("playwright", { paths: [global] }));
  }
}

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".enc": "application/octet-stream",
};

function servir(dir) {
  const servidor = http.createServer((pedido, respuesta) => {
    const ruta = decodeURIComponent(new URL(pedido.url, "http://x").pathname);
    let archivo = path.join(dir, ruta);
    if (!archivo.startsWith(dir)) return respuesta.writeHead(403).end();
    if (fs.existsSync(archivo) && fs.statSync(archivo).isDirectory()) archivo = path.join(archivo, "index.html");
    if (!fs.existsSync(archivo)) return respuesta.writeHead(404).end("no encontrado");
    respuesta.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo)] ?? "application/octet-stream" });
    fs.createReadStream(archivo).pipe(respuesta);
  });
  return new Promise((resolver) => servidor.listen(0, "127.0.0.1", () => resolver(servidor)));
}

const VISTAS = [
  ["inicio", "#/"],
  ["categoria-valvulas", "#/categoria/valvulas"],
  ["familia-compuerta", "#/categoria/val-compuerta"],
  ["producto-valvula", "#/producto/P-0003"],
  ["producto-medidor-usd", "#/producto/P-0006"],
  ["cotizaciones", "#/cotizaciones"],
  ["cotizacion-secciones", "#/cotizacion/C-0006"],
  ["proveedores", "#/proveedores"],
  ["proveedor", "#/proveedor/hidraulica-norte-demo"],
  ["fichas", "#/fichas"],
  ["busqueda", "#/buscar?q=valvula%204%20in"],
  ["novedades", "#/novedades"],
];

let [usuario, contrasena] = ["demo", "demo-catalogo"];
if (REAL) {
  [usuario, contrasena] = fs.readFileSync(opcion("credenciales"), "utf8").split(/\r?\n/);
} else {
  await comandos.demo([], { destino: DEMO });
}
fs.mkdirSync(SALIDA, { recursive: true });
const servidor = await servir(REAL ? RAIZ : DEMO);
const base = `http://127.0.0.1:${servidor.address().port}/catalogo/`;
const { chromium } = cargarPlaywright();
const navegador = await chromium.launch();
const errores = [];

for (const [nombre, ancho, alto, movil] of [["escritorio", 1440, 960, false], ["movil", 390, 844, true]]) {
  const contexto = await navegador.newContext({
    viewport: { width: ancho, height: alto },
    deviceScaleFactor: movil ? 2 : 1,
    isMobile: movil,
    hasTouch: movil,
    colorScheme: OSCURO ? "dark" : "light",
  });
  const pagina = await contexto.newPage();
  pagina.on("console", (m) => m.type() === "error" && errores.push(`[${nombre}] ${m.text()}`));
  pagina.on("pageerror", (e) => errores.push(`[${nombre}] ${e.message}`));

  await pagina.goto(base);
  await pagina.screenshot({ path: path.join(SALIDA, `${nombre}-00-acceso.png`) });
  await pagina.fill("#acceso-usuario", usuario);
  await pagina.fill("#acceso-contrasena", contrasena);
  await pagina.click("button[type=submit]");
  await pagina.waitForSelector(".barra", { timeout: 20000 });

  const vistas = REAL ? VISTAS.filter(([v]) => ["inicio", "categoria-valvulas", "cotizaciones", "proveedores", "novedades"].includes(v)) : VISTAS;
  for (const [i, [vista, hash]] of vistas.entries()) {
    await pagina.evaluate((h) => (location.hash = h), hash);
    await pagina.waitForTimeout(250);
    await pagina.screenshot({ path: path.join(SALIDA, `${nombre}-${String(i + 1).padStart(2, "0")}-${vista}.png`), fullPage: true });
  }

  if (REAL) {
    await contexto.close();
    continue;
  }
  // Sugerencias de búsqueda y recuadro de la gráfica.
  await pagina.evaluate(() => (location.hash = "#/producto/P-0003"));
  await pagina.waitForTimeout(250);
  const grafica = await pagina.$("[data-grafica-historial] svg");
  if (grafica) {
    await grafica.scrollIntoViewIfNeeded();
    const caja = await grafica.boundingBox();
    await pagina.mouse.move(caja.x + caja.width * 0.8, caja.y + caja.height / 2);
    await pagina.waitForTimeout(150);
    const marco = await pagina.$("[data-grafica-historial]");
    await marco.screenshot({ path: path.join(SALIDA, `${nombre}-20-grafica-hover.png`) });
  }
  await pagina.evaluate(() => window.scrollTo(0, 0));
  await pagina.fill("#buscador", "compuerta 6");
  await pagina.waitForTimeout(200);
  await pagina.screenshot({ path: path.join(SALIDA, `${nombre}-21-sugerencias.png`) });
  await contexto.close();
}

await navegador.close();
servidor.close();
console.log(`Capturas en ${SALIDA}`);
if (errores.length) {
  console.log(`\nErrores de consola (${errores.length}):`);
  for (const e of errores) console.log(`  · ${e}`);
  process.exitCode = 1;
} else console.log("Sin errores de consola.");
