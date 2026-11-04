// Pruebas de Darwin, la gatita del sitio (js/darwin.js): node --test herramientas/pruebas/

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const RAIZ = new URL("../../", import.meta.url);
const codigo = fs.readFileSync(new URL("js/darwin.js", RAIZ), "utf8");
const contexto = {};
vm.createContext(contexto);
vm.runInContext(codigo, contexto);
const D = contexto.DarwinPruebas;

const fecha = (m, d) => new Date(2026, m - 1, d);

test("cada fecha tiene a lo más una temporada y las temporadas no se enciman", () => {
  const vistas = new Map();
  for (let dia = new Date(2028, 0, 1); dia.getFullYear() === 2028; dia.setDate(dia.getDate() + 1)) {
    const md = (dia.getMonth() + 1) * 100 + dia.getDate();
    const todas = D.TEMPORADAS.filter((t) => md >= t.desde && md <= t.hasta);
    assert.ok(todas.length <= 1, `${md} cae en ${todas.map((t) => t.id)}`);
    if (todas[0]) vistas.set(todas[0].id, true);
  }
  for (const t of D.TEMPORADAS) assert.ok(vistas.has(t.id), `${t.id} nunca aparece`);
});

test("temporadas en fechas clave", () => {
  assert.equal(D.temporada(fecha(12, 24)).id, "navidad");
  assert.equal(D.temporada(fecha(1, 6)).id, "reyes");
  assert.equal(D.temporada(fecha(2, 14)).id, "sanvalentin");
  assert.equal(D.temporada(fecha(9, 15)).id, "patrias");
  assert.equal(D.temporada(fecha(10, 31)).id, "halloween");
  assert.equal(D.temporada(fecha(11, 2)).id, "muertos");
  assert.equal(D.temporada(fecha(7, 10)).id, "verano");
  assert.equal(D.temporada(fecha(5, 15)), null);
});

test("cada temporada usa un accesorio que existe", () => {
  for (const t of D.TEMPORADAS) assert.ok(D.ACCESORIOS[t.accesorio], `${t.id}: ${t.accesorio}`);
});

test("sprites y accesorios tienen filas parejas y colores de la paleta", () => {
  const revisar = (nombre, filas) => {
    const w = filas[0].length;
    filas.forEach((f, i) => {
      assert.equal(f.length, w, `${nombre} fila ${i}`);
      for (const c of f) assert.ok(c === "." || D.PAL[c], `${nombre}: color «${c}» sin definir`);
    });
  };
  for (const [n, p] of Object.entries(D.POSES)) {
    revisar(n, p.grid);
    for (const [pn, parte] of Object.entries(p.partes)) revisar(`${n}.${pn}`, Object.values(parte));
  }
  for (const [n, a] of Object.entries(D.ACCESORIOS))
    for (const pose of Object.keys(D.POSES)) revisar(`${n}/${pose}`, D.colocar(a, pose).g);
});

test("los accesorios caben completos en el lienzo en todas las poses", () => {
  for (const [n, a] of Object.entries(D.ACCESORIOS))
    for (const [pose, p] of Object.entries(D.POSES)) {
      const { x, y, g } = D.colocar(a, pose);
      g.forEach((fila, j) => [...fila].forEach((c, i) => {
        if (c === ".") return;
        const xx = x + i + p.ox, yy = y + j + D.MARGEN - 1; // -1: margen para el salto
        assert.ok(xx >= 0 && xx < D.ANCHO && yy >= 0 && yy < D.ALTO, `${n} se sale en ${pose} (${xx}, ${yy})`);
      }));
    }
});

test("todas las animaciones se arman con cada accesorio", () => {
  for (const acc of [null, ...Object.values(D.ACCESORIOS)]) {
    const anims = D.prepararAnimaciones(acc);
    for (const [n, a] of Object.entries(anims)) {
      assert.ok(a.seq.length > 0, n);
      for (const f of a.seq) {
        assert.equal(f.m.length, D.ALTO);
        assert.ok(f.m.every((r) => r.length === D.ANCHO));
        assert.ok(f.d >= 50, `${n}: cuadro demasiado corto`);
      }
    }
  }
});

test("la portada y la plantilla de proyectos incluyen a Darwin", () => {
  const portada = fs.readFileSync(new URL("index.html", RAIZ), "utf8");
  const plantilla = fs.readFileSync(new URL("herramientas/plantilla/index.html", RAIZ), "utf8");
  assert.match(portada, /<script src="js\/darwin\.js" defer><\/script>/);
  assert.match(plantilla, /<script src="\.\.\/js\/darwin\.js" defer><\/script>/);
});
