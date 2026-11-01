// Pruebas de las zonas del sitio: node --test herramientas/pruebas/  (o npm test)

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { zonaDe, motivoBloqueo, revisarCambio, leerRegistro, GENERAL } from "../proyectos.mjs";

const proyectos = {
  calculadoras: { nombre: "Calculadoras", carpetas: ["calculadoras"] },
  catalogo: { nombre: "Catálogo", carpetas: ["catalogo", ".catalogo"] },
};
const RAIZ = path.resolve("/repo");

test("cada ruta pertenece a su proyecto o a la zona general", () => {
  assert.equal(zonaDe("calculadoras/caudal.html", proyectos), "calculadoras");
  assert.equal(zonaDe("catalogo/js/app.js", proyectos), "catalogo");
  assert.equal(zonaDe(".catalogo/fuente/config.json", proyectos), "catalogo");
  assert.equal(zonaDe("catalogo", proyectos), "catalogo");
  assert.equal(zonaDe("css/styles.css", proyectos), GENERAL);
  assert.equal(zonaDe("index.html", proyectos), GENERAL);
  // Un prefijo parecido no es la misma carpeta
  assert.equal(zonaDe("catalogos-viejos/x.html", proyectos), GENERAL);
});

test("el registro real tiene proyectos con carpetas", () => {
  const real = leerRegistro();
  assert.ok(Object.keys(real).length > 0);
  for (const p of Object.values(real)) assert.ok(p.nombre && p.carpetas.length);
  assert.ok(!Object.hasOwn(real, GENERAL));
});

test("sin WEB_PROYECTO no se bloquea nada", () => {
  assert.equal(motivoBloqueo("/repo/catalogo/js/app.js", "", proyectos, RAIZ), null);
});

test("un proyecto solo escribe en sus carpetas", () => {
  assert.equal(motivoBloqueo("/repo/calculadoras/js/caudal.js", "calculadoras", proyectos, RAIZ), null);
  assert.match(motivoBloqueo("/repo/catalogo/js/app.js", "calculadoras", proyectos, RAIZ), /proyecto «catalogo»/);
  assert.match(motivoBloqueo("/repo/css/styles.css", "calculadoras", proyectos, RAIZ), /zona general/);
  assert.equal(motivoBloqueo("/repo/.catalogo/fuente/x.json", "catalogo", proyectos, RAIZ), null);
  // Fuera del repositorio (scratchpad, /tmp) no aplica
  assert.equal(motivoBloqueo("/tmp/notas.md", "calculadoras", proyectos, RAIZ), null);
});

test("la zona general no escribe en los proyectos", () => {
  assert.equal(motivoBloqueo("/repo/index.html", GENERAL, proyectos, RAIZ), null);
  assert.equal(motivoBloqueo("/repo/.claude/settings.json", GENERAL, proyectos, RAIZ), null);
  assert.match(motivoBloqueo("/repo/catalogo/index.html", GENERAL, proyectos, RAIZ), /catalogo/);
});

test("un WEB_PROYECTO desconocido bloquea todo dentro del repo", () => {
  assert.match(motivoBloqueo("/repo/index.html", "bombas", proyectos, RAIZ), /no es "general" ni un proyecto/);
});

test("un cambio de una sola zona pasa la revisión", () => {
  const { zonas, errores } = revisarCambio(["catalogo/datos/catalogo.enc", "catalogo/datos/acceso.json"], proyectos);
  assert.deepEqual(zonas, ["catalogo"]);
  assert.deepEqual(errores, []);
});

test("un cambio que mezcla zonas falla, salvo con «varias-zonas»", () => {
  const archivos = ["calculadoras/js/caudal.js", "catalogo/js/app.js"];
  assert.ok(revisarCambio(archivos, proyectos).errores.length > 0);
  assert.deepEqual(revisarCambio(archivos, proyectos, { varias: true }).errores, []);
});

test("una rama con prefijo de zona solo toca esa zona", () => {
  assert.deepEqual(revisarCambio(["catalogo/js/app.js"], proyectos, { rama: "catalogo/arreglo" }).errores, []);
  const { errores } = revisarCambio(["css/styles.css"], proyectos, { rama: "calculadoras/estilos" });
  assert.match(errores.join("\n"), /es de «calculadoras» pero toca general/);
  // Ramas sin prefijo de zona (p. ej. claude/…) solo exigen una zona
  assert.deepEqual(revisarCambio(["css/styles.css"], proyectos, { rama: "claude/x" }).errores, []);
});

test("el entorno local solo puede cambiar su zona", () => {
  const { errores } = revisarCambio(["catalogo/js/app.js"], proyectos, { zona: "calculadoras" });
  assert.match(errores.join("\n"), /Este entorno es «calculadoras»/);
});
