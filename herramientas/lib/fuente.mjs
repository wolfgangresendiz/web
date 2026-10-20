// ============================================================
//  Copia de trabajo en claro (.catalogo/fuente/)
// ============================================================
//
// Al abrir la bóveda, el catálogo se reparte en archivos JSON pequeños,
// uno por registro, para editarlos con comodidad:
//
//   config.json · taxonomia.json · usuarios.json · bitacora.json
//   proveedores/<id>.json · productos/<id>.json
//   cotizaciones/<id>.json · fichas/<id>.json
//
// Esta carpeta está en .gitignore: jamás debe subirse al repositorio.

import fs from "node:fs";
import path from "node:path";
import { compararId } from "../../catalogo/js/util.js";
import { ESQUEMA } from "../../catalogo/js/modelo.js";

export const COLECCIONES = ["proveedores", "productos", "cotizaciones", "fichas"];
const SUELTOS = { config: {}, taxonomia: [], usuarios: [], bitacora: [] };

const json = (valor) => `${JSON.stringify(valor, null, 2)}\n`;

export function leerFuente(dir) {
  if (!fs.existsSync(dir)) throw new Error(`No existe la copia de trabajo ${dir}. Ejecuta primero: npm run catalogo -- abrir`);
  const datos = { formato: "catalogo-wr", esquema: ESQUEMA };
  const errores = [];
  const leer = (archivo, defecto) => {
    if (!fs.existsSync(archivo)) return defecto;
    try {
      return JSON.parse(fs.readFileSync(archivo, "utf8"));
    } catch (e) {
      errores.push(`${path.relative(dir, archivo)}: JSON inválido (${e.message})`);
      return defecto;
    }
  };
  for (const [clave, defecto] of Object.entries(SUELTOS)) datos[clave] = leer(path.join(dir, `${clave}.json`), defecto);
  const archivos = {};
  for (const coleccion of COLECCIONES) {
    const carpeta = path.join(dir, coleccion);
    const nombres = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).filter((n) => n.endsWith(".json")) : [];
    datos[coleccion] = [];
    archivos[coleccion] = {};
    for (const nombre of nombres.sort(compararId)) {
      const registro = leer(path.join(carpeta, nombre), null);
      if (!registro) continue;
      datos[coleccion].push(registro);
      archivos[coleccion][registro.id] = nombre;
    }
    datos[coleccion].sort((a, b) => compararId(a.id, b.id));
  }
  return { datos, errores, archivos };
}

export function escribirFuente(dir, datos) {
  fs.mkdirSync(dir, { recursive: true });
  for (const clave of Object.keys(SUELTOS)) {
    fs.writeFileSync(path.join(dir, `${clave}.json`), json(datos[clave] ?? SUELTOS[clave]));
  }
  for (const coleccion of COLECCIONES) {
    const carpeta = path.join(dir, coleccion);
    fs.rmSync(carpeta, { recursive: true, force: true });
    fs.mkdirSync(carpeta, { recursive: true });
    for (const registro of datos[coleccion] ?? []) {
      fs.writeFileSync(path.join(carpeta, `${registro.id}.json`), json(registro));
    }
  }
}

// Paquete canónico que se cifra: mismas claves y orden siempre, para que
// dos paquetes con el mismo contenido se comparen como iguales.
export function empaquetar(datos, generado = new Date().toISOString()) {
  const ordenar = (lista) => [...(lista ?? [])].sort((a, b) => compararId(a.id, b.id));
  return {
    formato: "catalogo-wr",
    esquema: ESQUEMA,
    generado,
    config: datos.config ?? {},
    taxonomia: datos.taxonomia ?? [],
    proveedores: ordenar(datos.proveedores),
    productos: ordenar(datos.productos),
    cotizaciones: ordenar(datos.cotizaciones),
    fichas: ordenar(datos.fichas),
    usuarios: datos.usuarios ?? [],
    bitacora: datos.bitacora ?? [],
  };
}

// ---- Diferencias entre dos paquetes ----

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function diferencias(antes, despues) {
  const cambios = { colecciones: {}, taxonomia: false, config: false, usuarios: false, vacio: true };
  for (const coleccion of COLECCIONES) {
    const previo = new Map((antes?.[coleccion] ?? []).map((r) => [r.id, r]));
    const nuevo = new Map((despues?.[coleccion] ?? []).map((r) => [r.id, r]));
    const resultado = { agregados: [], modificados: [], eliminados: [] };
    for (const [id, registro] of nuevo) {
      if (!previo.has(id)) resultado.agregados.push(registro);
      else if (!igual(previo.get(id), registro)) resultado.modificados.push(registro);
    }
    for (const [id, registro] of previo) if (!nuevo.has(id)) resultado.eliminados.push(registro);
    cambios.colecciones[coleccion] = resultado;
    if (resultado.agregados.length || resultado.modificados.length || resultado.eliminados.length) cambios.vacio = false;
  }
  cambios.taxonomia = !igual(antes?.taxonomia ?? [], despues?.taxonomia ?? []);
  cambios.config = !igual(antes?.config ?? {}, despues?.config ?? {});
  cambios.usuarios = !igual(antes?.usuarios ?? [], despues?.usuarios ?? []);
  if (cambios.taxonomia || cambios.config || cambios.usuarios) cambios.vacio = false;
  return cambios;
}

const NOMBRES = {
  proveedores: { uno: "proveedor", varios: "proveedores", nuevo: "Alta de proveedor", a: "o" },
  productos: { uno: "producto", varios: "productos", nuevo: "Alta de producto", a: "o" },
  cotizaciones: { uno: "cotización", varios: "cotizaciones", nuevo: "Nueva cotización", a: "a" },
  fichas: { uno: "ficha técnica", varios: "fichas técnicas", nuevo: "Nueva ficha técnica", a: "a" },
};

// Texto legible de los cambios, para la bitácora (que viaja cifrada).
export function describirCambios(cambios, despues) {
  const proveedores = new Map((despues.proveedores ?? []).map((p) => [p.id, p.nombre]));
  const productos = new Map((despues.productos ?? []).map((p) => [p.id, p.nombre]));
  const etiqueta = (coleccion, r) => {
    if (coleccion === "cotizaciones") {
      const n = r.partidas?.length ?? 0;
      return `${r.id} de ${proveedores.get(r.proveedor) ?? r.proveedor} (${r.fecha}, ${n} ${n === 1 ? "partida" : "partidas"})`;
    }
    if (coleccion === "fichas") return `${r.id} ${r.titulo ?? ""} (${productos.get(r.producto) ?? r.producto})`;
    if (coleccion === "proveedores") return r.nombre ?? r.id;
    return `${r.id} ${r.nombre ?? ""}`.trim();
  };
  const resumen = [];
  const detalle = [];
  for (const coleccion of COLECCIONES) {
    const { agregados, modificados, eliminados } = cambios.colecciones[coleccion];
    const n = NOMBRES[coleccion];
    const nombre = (k) => (k === 1 ? n.uno : n.varios);
    if (agregados.length) {
      resumen.push(`+${agregados.length} ${nombre(agregados.length)}`);
      detalle.push(...agregados.map((r) => `${n.nuevo}: ${etiqueta(coleccion, r)}`));
    }
    if (modificados.length) {
      const k = modificados.length;
      resumen.push(`${k} ${nombre(k)} actualizad${n.a}${k === 1 ? "" : "s"}`);
      detalle.push(...modificados.map((r) => `Actualización de ${n.uno}: ${etiqueta(coleccion, r)}`));
    }
    if (eliminados.length) {
      resumen.push(`−${eliminados.length} ${nombre(eliminados.length)}`);
      detalle.push(...eliminados.map((r) => `Baja de ${n.uno}: ${etiqueta(coleccion, r)}`));
    }
  }
  if (cambios.taxonomia) {
    resumen.push("taxonomía actualizada");
    detalle.push("Cambios en la taxonomía de categorías");
  }
  if (cambios.usuarios) detalle.push("Cambios en los usuarios con acceso");
  if (cambios.config) detalle.push("Cambios en la configuración");
  return { resumen: resumen.join(", ") || "Ajustes internos", cambios: detalle };
}
