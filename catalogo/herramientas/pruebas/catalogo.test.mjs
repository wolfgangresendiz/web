// Pruebas del catálogo: node --test catalogo/herramientas/pruebas/  (o npm test)

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ErrorAcceso,
  aB64,
  aleatorio,
  cifrarCatalogo,
  derivarKEK,
  descifrarCatalogo,
  envolverDEK,
  entrar,
  idUsuario,
  nuevaDEK,
} from "../../js/boveda.js";
import { construirIndice, precioPartida, diferenciasEntreOfertas, columnasDe } from "../../js/modelo.js";
import { crearBuscador, terminos } from "../../js/buscar.js";
import { valorNumerico, compararTexto, fechaCorta, esFechaISO } from "../../js/util.js";
import { validar } from "../lib/validar.mjs";
import { leerLlavero, escribirLlavero, abrirLlavero, sellarLlavero } from "../lib/llavero.mjs";
import { diferencias, describirCambios, empaquetar } from "../lib/fuente.mjs";
import { generarContrasena } from "../catalogo.mjs";

const leerJSON = (ruta) => JSON.parse(fs.readFileSync(new URL(ruta, import.meta.url), "utf8"));
const demo = leerJSON("../demo/datos.json");
const datosDemo = { ...demo, taxonomia: leerJSON("../semilla/taxonomia.json") };
const HOY = "2026-10-20"; // fecha de referencia de los datos demo
const copia = (x) => structuredClone(x);

// ---- Bóveda ----

test("la bóveda cifra y descifra el mismo contenido", async () => {
  const dek = nuevaDEK();
  const bytes = await cifrarCatalogo(datosDemo, dek);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), "WRC1");
  assert.ok(!new TextDecoder().decode(bytes).includes("Hidráulica"), "el texto no debe verse en claro");
  assert.deepEqual(await descifrarCatalogo(bytes, dek), datosDemo);
});

test("con otra llave la bóveda no se puede descifrar", async () => {
  const bytes = await cifrarCatalogo({ hola: 1 }, nuevaDEK());
  await assert.rejects(descifrarCatalogo(bytes, nuevaDEK()));
});

test("entrar: la contraseña correcta devuelve la llave; la incorrecta o un usuario inexistente fallan igual", async () => {
  const dek = nuevaDEK();
  const sal = aleatorio(16);
  const id = await idUsuario("Ana");
  const kek = await derivarKEK("caballo-bateria-grapa", sal, 1000);
  const acceso = { kdf: { iteraciones: 1000 }, usuarios: { [id]: { sal: aB64(sal), ...(await envolverDEK(dek, kek, id)) } } };
  assert.deepEqual(await entrar(acceso, "  ANA ", "caballo-bateria-grapa"), dek, "el usuario no distingue mayúsculas ni espacios");
  await assert.rejects(entrar(acceso, "ana", "otra-contrasena"), ErrorAcceso);
  await assert.rejects(entrar(acceso, "beto", "caballo-bateria-grapa"), ErrorAcceso);
});

test("el llavero sobrevive ida y vuelta, aun con barras invertidas de por medio", () => {
  const llavero = { dek: nuevaDEK(), usuarios: new Map([["wolfgang", nuevaDEK()], ["ana.lopez", nuevaDEK()]]), admins: new Set(["wolfgang"]) };
  const texto = escribirLlavero(llavero);
  const leido = leerLlavero(texto.replace("ana.lopez", "ana\\.lopez"));
  assert.deepEqual(leido.dek, llavero.dek);
  assert.deepEqual([...leido.usuarios.keys()].sort(), ["ana.lopez", "wolfgang"]);
  assert.deepEqual([...leido.admins], ["wolfgang"]);
  assert.throws(() => leerLlavero("otra cosa"));
});

test("el llavero sellado en acceso.json solo lo abre un administrador con su contraseña", async () => {
  const dek = nuevaDEK();
  const [salA, salB] = [aleatorio(16), aleatorio(16)];
  const [kekA, kekB] = [await derivarKEK("admin-pass-123456", salA, 1000), await derivarKEK("lector-pass-123456", salB, 1000)];
  const [idA, idB] = [await idUsuario("admin"), await idUsuario("lector")];
  let acceso = {
    usuarios: {
      [idA]: { sal: aB64(salA), iteraciones: 1000, ...(await envolverDEK(dek, kekA, idA)) },
      [idB]: { sal: aB64(salB), iteraciones: 1000, ...(await envolverDEK(dek, kekB, idB)) },
    },
  };
  acceso = await sellarLlavero(acceso, { dek, usuarios: new Map([["admin", kekA], ["lector", kekB]]), admins: new Set(["admin"]) });
  assert.deepEqual(Object.keys(acceso.administracion), [idA]);
  const abierto = await abrirLlavero(acceso, " Admin ", "admin-pass-123456");
  assert.deepEqual(abierto.dek, dek);
  assert.deepEqual(abierto.usuarios.get("lector"), kekB);
  assert.deepEqual([...abierto.admins], ["admin"]);
  await assert.rejects(abrirLlavero(acceso, "admin", "otra-cosa-123456"), ErrorAcceso);
  await assert.rejects(abrirLlavero(acceso, "lector", "lector-pass-123456"), /no es administrador/);
});

test("las contraseñas generadas son largas y sin caracteres ambiguos", () => {
  const c = generarContrasena();
  assert.match(c, /^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
  assert.ok(!/[01ilo]/.test(c));
  assert.notEqual(generarContrasena(), generarContrasena());
});

// ---- Precios ----

test("precio normalizado: divisa, IVA incluido y equivalencia de unidades", () => {
  const cotizacion = { moneda: "USD", tipo_cambio: { valor: 20 }, precios_incluyen_iva: true };
  const p = precioPartida(cotizacion, { precio_unitario: 116, equivalencia: 2, cantidad: 3 });
  // 116 / 1.16 = 100 USD sin IVA · 20 MXN/USD = 2000 MXN por unidad cotizada · ÷ 2 = 1000 MXN por unidad del producto
  assert.equal(Math.round(p.puMXN * 100) / 100, 1000);
  assert.equal(Math.round(p.importeMXN), 6000);
  const opcional = precioPartida({ moneda: "MXN" }, { precio_unitario: 30000, cantidad: null });
  assert.ok(Number.isNaN(opcional.importeMXN), "una partida sin cantidad no tiene importe");
  const mxn = precioPartida({ moneda: "MXN" }, { precio_unitario: 50, cantidad: 2 });
  assert.equal(mxn.puMXN, 50);
  assert.equal(mxn.tc, 1);
});

test("resumen del producto: agrupa proveedores, mejor vigente y variación del mismo proveedor", () => {
  const indice = construirIndice(datosDemo, { hoy: HOY });
  const r = indice.productos.get("P-0003").resumen;
  assert.equal(r.n, 5);
  assert.equal(r.nProveedores, 2);
  assert.equal(r.mejorVigente.cotizacion.id, "C-0005");
  assert.equal(r.ultimo.cotizacion.id, "C-0006");
  assert.deepEqual(r.comparativa.map((o) => o.cotizacion.id), ["C-0005", "C-0006"]);
  // Variación medida con Hidráulica del Norte: 6,850 → 7,380
  assert.equal(r.variacion.proveedor.id, "hidraulica-norte-demo");
  assert.equal(Math.round(r.variacion.cambio * 1000) / 1000, Math.round((7380 / 6850 - 1) * 1000) / 1000);
  // El precio con IVA incluido de C-0002 se compara sin IVA: 8,120 / 1.16
  const c2 = r.ofertas.find((o) => o.cotizacion.id === "C-0002");
  assert.equal(Math.round(c2.precio.puMXN), 7000);
});

test("tramos de 6 m se comparan por metro y las diferencias entre ofertas se detectan", () => {
  const indice = construirIndice(datosDemo, { hoy: HOY });
  const tubo = indice.productos.get("P-0001").resumen;
  assert.equal(tubo.ultimo.precio.puMXN, 1104 / 6);
  const difs = diferenciasEntreOfertas(indice.productos.get("P-0003").resumen.comparativa).map((d) => d.etiqueta);
  assert.ok(difs.includes("Marca"));
  assert.ok(difs.includes("Tiempo de entrega"));
});

test("cotización con partida no catalogada suma en totales y no rompe nada", () => {
  const indice = construirIndice(datosDemo, { hoy: HOY });
  const c = indice.cotizaciones.get("C-0006");
  assert.equal(c.partidas.at(-1).productoObj, null);
  assert.equal(Math.round(c.totales.subtotalMXN * 100) / 100, 60 * 1104 + 30 * 2418 + 6 * 7380 + 2 * 11240 + 1500);
});

test("columnas de una familia: primero las sugeridas por la taxonomía", () => {
  const indice = construirIndice(datosDemo, { hoy: HOY });
  const nodo = indice.nodos.get("val-compuerta");
  assert.deepEqual(columnasDe(nodo).slice(0, 2), ["Diámetro nominal", "Presión de trabajo"]);
});

// ---- Validación ----

test("los datos demo y la taxonomía semilla pasan la validación", () => {
  const { errores } = validar(datosDemo);
  assert.deepEqual(errores, []);
});

test("la validación detecta reglas rotas", () => {
  const datos = copia(datosDemo);
  datos.productos[0].categoria = "valvulas"; // no es familia final
  delete datos.cotizaciones[3].tipo_cambio; // USD sin tipo de cambio
  datos.cotizaciones[0].archivo = {}; // sin PDF en Drive
  datos.fichas[0].producto = "P-9999"; // ficha huérfana
  datos.cotizaciones[1].partidas[0].precio_unitario = "8120"; // texto en vez de número
  const { errores } = validar(datos);
  const texto = errores.join("\n");
  assert.match(texto, /P-0001.*tiene subcategorías/);
  assert.match(texto, /C-0004.*sin tipo_cambio/);
  assert.match(texto, /C-0001.*drive_id/);
  assert.match(texto, /FT-0001.*P-9999/);
  assert.match(texto, /C-0002, partida 1: precio_unitario/);
});

test("la taxonomía admite máximo tres niveles", () => {
  const datos = copia(datosDemo);
  datos.taxonomia[0].hijos[0].hijos[0].hijos = [{ id: "cuarto-nivel", nombre: "Demasiado profundo" }];
  assert.match(validar(datos).errores.join("\n"), /máximo 3 niveles/);
});

// ---- Búsqueda y texto ----

test("la búsqueda entiende pulgadas, acentos, sinónimos e identificadores", () => {
  const buscador = crearBuscador(construirIndice(datosDemo, { hoy: HOY }));
  assert.equal(buscador.buscar('valvula compuerta 4"')[0].id, "P-0003");
  assert.equal(buscador.buscar("válvula compuerta 6 pulgadas")[0].id, "P-0004");
  assert.equal(buscador.buscar("C-0006")[0].id, "C-0006");
  assert.equal(buscador.buscar("walworth")[0].tipo, "producto");
  assert.equal(buscador.buscar("hidráulica norte", { tipos: ["proveedor"] })[0].id, "hidraulica-norte-demo");
  assert.deepEqual(buscador.buscar("zzzz-no-existe"), []);
  assert.deepEqual(terminos("Tubo 2'' PVC"), ["tubo", "2", "in", "pvc"]);
});

test("orden natural de medidas y formato de fechas", () => {
  assert.equal(valorNumerico('1 1/2"'), 1.5);
  assert.deepEqual(['10"', '1/2"', '2"', '1 1/2"'].sort(compararTexto), ['1/2"', '1 1/2"', '2"', '10"']);
  assert.equal(fechaCorta("2026-10-15"), "15 oct 2026");
  assert.ok(esFechaISO("2026-02-28"));
  assert.ok(!esFechaISO("2026-02-30"));
});

// ---- Bitácora ----

test("las diferencias entre versiones se describen para la bitácora", () => {
  const antes = empaquetar(datosDemo, "x");
  const despues = copia(antes);
  despues.cotizaciones.push({ ...copia(antes.cotizaciones[0]), id: "C-0011" });
  despues.productos[0].nombre = "Tubo renombrado";
  const cambios = diferencias(antes, despues);
  assert.equal(cambios.vacio, false);
  const { resumen, cambios: detalle } = describirCambios(cambios, despues);
  assert.equal(resumen, "1 producto actualizado, +1 cotización");
  assert.ok(detalle.some((d) => d.startsWith("Nueva cotización: C-0011")));
  assert.equal(diferencias(antes, copia(antes)).vacio, true);
});
