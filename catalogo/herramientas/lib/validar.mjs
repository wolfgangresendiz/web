// ============================================================
//  Validación del catálogo antes de cifrarlo
// ============================================================
//
// Errores: impiden guardar (datos rotos o reglas del catálogo violadas).
// Avisos: se guardan igual, pero conviene revisarlos.

import { esFechaISO, normalizar } from "../../js/util.js";

const RE = {
  producto: /^P-\d{4,}$/,
  cotizacion: /^C-\d{4,}$/,
  ficha: /^FT-\d{4,}$/,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  moneda: /^[A-Z]{3}$/,
  usuario: /^[a-z0-9][a-z0-9._-]{1,31}$/,
};

// Rango razonable de tipos de cambio, para detectar errores de captura.
const RANGO_TC = { USD: [12, 30], EUR: [13, 35] };

export function validar(datos, { archivos = null } = {}) {
  const errores = [];
  const avisos = [];
  const error = (m) => errores.push(m);
  const aviso = (m) => avisos.push(m);
  const revisarArchivo = (coleccion, registro, donde) => {
    const nombre = archivos?.[coleccion]?.[registro.id];
    if (archivos && nombre && nombre !== `${registro.id}.json`) error(`${donde}: el archivo ${nombre} debe llamarse ${registro.id}.json`);
  };

  // ---- Taxonomía ----
  const nodos = new Map();
  const hojas = new Set();
  const alias = new Map();
  const recorrer = (lista, nivel, ruta) => {
    if (!Array.isArray(lista)) {
      error(`taxonomia: se esperaba una lista${ruta ? ` en ${ruta}` : ""}`);
      return;
    }
    for (const n of lista) {
      const donde = `taxonomia › ${[ruta, n?.nombre ?? n?.id].filter(Boolean).join(" › ")}`;
      if (!n?.id || !RE.slug.test(n.id)) error(`${donde}: id inválido "${n?.id}" (minúsculas, números y guiones)`);
      if (!n?.nombre) error(`${donde}: falta nombre`);
      if (nodos.has(n.id)) error(`${donde}: id repetido "${n.id}"`);
      if (nivel > 3) error(`${donde}: la taxonomía admite como máximo 3 niveles`);
      if (n.atributos != null && !Array.isArray(n.atributos)) error(`${donde}: "atributos" debe ser una lista de nombres`);
      nodos.set(n.id, n);
      for (const viejo of n.alias ?? []) {
        if (alias.has(viejo)) error(`${donde}: el alias "${viejo}" ya lo usa otro nodo`);
        alias.set(viejo, n.id);
      }
      if (n.hijos?.length) recorrer(n.hijos, nivel + 1, [ruta, n.nombre].filter(Boolean).join(" › "));
      else hojas.add(n.id);
    }
  };
  recorrer(datos.taxonomia, 1, "");
  for (const viejo of alias.keys()) if (nodos.has(viejo)) error(`taxonomia: el alias "${viejo}" coincide con un id vigente`);
  const resolverNodo = (id) => (nodos.has(id) ? id : alias.get(id));

  // ---- Proveedores ----
  const proveedores = new Map();
  for (const p of datos.proveedores ?? []) {
    const donde = `proveedores/${p.id}`;
    if (!p.id || !RE.slug.test(p.id)) error(`${donde}: id inválido "${p.id}" (minúsculas, números y guiones)`);
    revisarArchivo("proveedores", p, donde);
    if (proveedores.has(p.id)) error(`${donde}: id repetido`);
    if (!p.nombre) error(`${donde}: falta nombre`);
    const contactos = new Set();
    for (const k of p.contactos ?? []) {
      if (!k.id || !RE.slug.test(k.id)) error(`${donde}: contacto con id inválido "${k.id}"`);
      if (contactos.has(k.id)) error(`${donde}: contacto repetido "${k.id}"`);
      if (!k.nombre) error(`${donde}: el contacto "${k.id}" no tiene nombre`);
      contactos.add(k.id);
    }
    if (!contactos.size && !p.telefono && !p.correo) aviso(`${donde}: sin contactos ni teléfono o correo`);
    if (p.sitio_web && !/^https?:\/\//i.test(p.sitio_web)) aviso(`${donde}: sitio_web debe empezar con https://`);
    if (p.marcas != null && !Array.isArray(p.marcas)) error(`${donde}: "marcas" debe ser una lista`);
    proveedores.set(p.id, contactos);
  }

  // ---- Productos ----
  const productos = new Map();
  const etiquetasPorFamilia = new Map();
  for (const p of datos.productos ?? []) {
    const donde = `productos/${p.id}`;
    if (!RE.producto.test(p.id ?? "")) error(`${donde}: id inválido (formato P-0001)`);
    revisarArchivo("productos", p, donde);
    if (productos.has(p.id)) error(`${donde}: id repetido`);
    if (!p.nombre) error(`${donde}: falta nombre`);
    if (!["producto", "servicio"].includes(p.tipo)) error(`${donde}: "tipo" debe ser "producto" o "servicio"`);
    if (!p.unidad) error(`${donde}: falta unidad (pza, m, kg, L, lote, servicio…)`);
    const familia = resolverNodo(p.categoria);
    if (!familia) error(`${donde}: la categoría "${p.categoria}" no existe en la taxonomía`);
    else if (!hojas.has(familia)) error(`${donde}: "${p.categoria}" tiene subcategorías; asigna una familia final`);
    else if (familia !== p.categoria) aviso(`${donde}: usa el alias "${p.categoria}"; cámbialo a "${familia}"`);
    if (p.atributos != null && (typeof p.atributos !== "object" || Array.isArray(p.atributos))) {
      error(`${donde}: "atributos" debe ser un objeto { "Nombre": "valor" }`);
    }
    for (const [clave, valor] of Object.entries(p.atributos ?? {})) {
      if (typeof valor !== "string" && typeof valor !== "number") error(`${donde}: el atributo "${clave}" debe ser texto o número`);
      if (!familia) continue;
      if (!etiquetasPorFamilia.has(familia)) etiquetasPorFamilia.set(familia, new Map());
      const mapa = etiquetasPorFamilia.get(familia);
      const llave = normalizar(clave).replace(/[^a-z0-9]/g, "");
      if (!mapa.has(llave)) mapa.set(llave, new Set());
      mapa.get(llave).add(clave);
    }
    if (p.palabras_clave != null && !Array.isArray(p.palabras_clave)) error(`${donde}: "palabras_clave" debe ser una lista`);
    productos.set(p.id, p);
  }
  for (const [familia, mapa] of etiquetasPorFamilia) {
    for (const variantes of mapa.values()) {
      if (variantes.size > 1) {
        aviso(`familia ${familia}: un mismo atributo escrito de varias formas (${[...variantes].map((v) => `"${v}"`).join(", ")})`);
      }
    }
  }

  // ---- Cotizaciones ----
  const conUso = new Set();
  const cotizaciones = new Set();
  for (const c of datos.cotizaciones ?? []) {
    const donde = `cotizaciones/${c.id}`;
    if (!RE.cotizacion.test(c.id ?? "")) error(`${donde}: id inválido (formato C-0001)`);
    revisarArchivo("cotizaciones", c, donde);
    if (cotizaciones.has(c.id)) error(`${donde}: id repetido`);
    cotizaciones.add(c.id);
    if (!proveedores.has(c.proveedor)) error(`${donde}: el proveedor "${c.proveedor}" no existe`);
    else if (c.contacto && !proveedores.get(c.proveedor).has(c.contacto)) {
      error(`${donde}: el contacto "${c.contacto}" no existe en ${c.proveedor}`);
    }
    if (!esFechaISO(c.fecha)) error(`${donde}: fecha inválida "${c.fecha}" (AAAA-MM-DD)`);
    if (c.vigencia != null) {
      if (!esFechaISO(c.vigencia)) error(`${donde}: vigencia inválida "${c.vigencia}" (AAAA-MM-DD)`);
      else if (esFechaISO(c.fecha) && c.vigencia < c.fecha) error(`${donde}: la vigencia es anterior a la fecha`);
    } else {
      aviso(`${donde}: sin vigencia (si el documento dice "30 días", regístrala como fecha)`);
    }
    const moneda = c.moneda ?? "MXN";
    if (!RE.moneda.test(moneda)) error(`${donde}: moneda inválida "${moneda}" (código ISO: MXN, USD, EUR)`);
    if (moneda !== "MXN") {
      const tc = c.tipo_cambio;
      if (!tc || !(Number(tc.valor) > 0)) error(`${donde}: cotización en ${moneda} sin tipo_cambio.valor`);
      else {
        if (!esFechaISO(tc.fecha)) error(`${donde}: tipo_cambio.fecha inválida`);
        if (!tc.fuente) error(`${donde}: falta tipo_cambio.fuente (p. ej. "Banxico FIX")`);
        if (esFechaISO(tc.fecha) && esFechaISO(c.fecha) && tc.fecha > c.fecha) {
          aviso(`${donde}: el tipo de cambio es posterior a la fecha de la cotización`);
        }
        const rango = RANGO_TC[moneda];
        if (rango && (tc.valor < rango[0] || tc.valor > rango[1])) {
          aviso(`${donde}: tipo de cambio ${tc.valor} fuera del rango habitual para ${moneda} (${rango.join(" a ")}); revísalo`);
        }
      }
    } else if (c.tipo_cambio) {
      aviso(`${donde}: está en MXN y trae tipo_cambio (se ignora)`);
    }
    if (c.iva != null && !(typeof c.iva === "number" && c.iva >= 0 && c.iva < 1)) error(`${donde}: "iva" es una fracción: 0.16, 0.08 o 0`);
    if (c.precios_incluyen_iva != null && typeof c.precios_incluyen_iva !== "boolean") {
      error(`${donde}: "precios_incluyen_iva" debe ser true o false`);
    }
    if (!c.archivo?.drive_id) error(`${donde}: falta archivo.drive_id (toda cotización enlaza su PDF en Drive)`);
    if (!Array.isArray(c.partidas) || !c.partidas.length) error(`${donde}: sin partidas`);
    (c.partidas ?? []).forEach((pt, i) => {
      const d = `${donde}, partida ${i + 1}`;
      if (pt.producto == null) aviso(`${d}: no está ligada a ningún producto del catálogo`);
      else if (!productos.has(pt.producto)) error(`${d}: el producto "${pt.producto}" no existe`);
      else conUso.add(pt.producto);
      if (!pt.descripcion) error(`${d}: falta la descripción tal como la escribió el proveedor`);
      if (!(typeof pt.precio_unitario === "number" && pt.precio_unitario >= 0)) error(`${d}: precio_unitario debe ser un número ≥ 0`);
      if (pt.cantidad != null && !(typeof pt.cantidad === "number" && pt.cantidad > 0)) error(`${d}: cantidad debe ser un número > 0 o null`);
      if (pt.equivalencia != null && !(typeof pt.equivalencia === "number" && pt.equivalencia > 0)) {
        error(`${d}: equivalencia debe ser un número > 0`);
      }
      if (pt.diferencias != null && !Array.isArray(pt.diferencias) && typeof pt.diferencias !== "string") {
        error(`${d}: "diferencias" debe ser una lista de textos`);
      }
      const producto = productos.get(pt.producto);
      if (producto && pt.unidad && pt.equivalencia == null && normalizar(pt.unidad) !== normalizar(producto.unidad)) {
        aviso(`${d}: cotizado por "${pt.unidad}" y ${producto.id} se mide en "${producto.unidad}"; ¿falta "equivalencia"?`);
      }
    });
  }

  // ---- Fichas técnicas ----
  const fichas = new Set();
  for (const f of datos.fichas ?? []) {
    const donde = `fichas/${f.id}`;
    if (!RE.ficha.test(f.id ?? "")) error(`${donde}: id inválido (formato FT-0001)`);
    revisarArchivo("fichas", f, donde);
    if (fichas.has(f.id)) error(`${donde}: id repetido`);
    fichas.add(f.id);
    if (!productos.has(f.producto)) error(`${donde}: el producto "${f.producto}" no existe (cada ficha pertenece a un producto)`);
    else conUso.add(f.producto);
    if (!f.titulo) error(`${donde}: falta título`);
    if (!f.archivo?.drive_id) error(`${donde}: falta archivo.drive_id (los datos técnicos siempre remiten a su PDF)`);
    if (f.fecha != null && !esFechaISO(f.fecha)) error(`${donde}: fecha inválida "${f.fecha}"`);
    if (!Array.isArray(f.datos)) error(`${donde}: "datos" debe ser una lista`);
    else {
      f.datos.forEach((d, i) => {
        if (!d?.parametro || d.valor == null || d.valor === "") error(`${donde}, dato ${i + 1}: requiere "parametro" y "valor"`);
      });
    }
  }

  for (const p of productos.values()) if (!conUso.has(p.id)) aviso(`productos/${p.id}: no tiene cotizaciones ni fichas`);

  // ---- Usuarios y configuración ----
  const usuarios = new Set();
  for (const u of datos.usuarios ?? []) {
    if (!RE.usuario.test(u.usuario ?? "")) error(`usuarios: nombre de usuario inválido "${u.usuario}"`);
    if (usuarios.has(u.usuario)) error(`usuarios: "${u.usuario}" repetido`);
    usuarios.add(u.usuario);
  }
  const iva = datos.config?.iva;
  if (iva != null && !(typeof iva === "number" && iva >= 0 && iva < 1)) error(`config: "iva" es una fracción, p. ej. 0.16`);

  return { errores, avisos };
}

export const esUsuarioValido = (usuario) => RE.usuario.test(usuario);
