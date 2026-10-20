// ============================================================
//  Modelo del catálogo: índices, precios normalizados y resúmenes
// ============================================================
//
// Recibe el JSON descifrado y arma las estructuras que usan las vistas
// (y la CLI). Para comparar, todo precio se lleva a MXN, sin IVA y por
// unidad del producto:
//
//   p_MXN = p · TC / ((1 + τ)^[IVA incluido] · e)
//
//   p   precio unitario neto tal como viene en la cotización
//   TC  tipo de cambio a MXN del día de la cotización (1 si ya está en MXN)
//   τ   tasa de IVA de la cotización (0.16 si no se indica)
//   e   equivalencia: unidades del producto por unidad cotizada (1 si no se indica)

import { compararId, compararTexto, diasEntre, hoyISO, normalizar } from "./util.js";

export const ESQUEMA = 1;
export const MONEDA_BASE = "MXN";
export const IVA_GENERAL = 0.16;

export const ETIQUETAS_CONDICIONES = {
  pago: "Pago",
  entrega: "Tiempo de entrega",
  lab: "Lugar de entrega (LAB)",
  flete: "Flete",
  garantia: "Garantía",
  otras: "Otras condiciones",
};

const porFechaDesc = (a, b) => compararTexto(b.fecha, a.fecha) || compararId(b.id, a.id);

// ---- Precios ----

export function precioPartida(cotizacion, partida, config = {}) {
  const moneda = cotizacion.moneda || MONEDA_BASE;
  const tc = moneda === MONEDA_BASE ? 1 : Number(cotizacion.tipo_cambio?.valor);
  const tasa = cotizacion.iva ?? config.iva ?? IVA_GENERAL;
  const divisorIva = cotizacion.precios_incluyen_iva ? 1 + tasa : 1;
  const equivalencia = Number(partida.equivalencia ?? 1) || 1;
  const pu = Number(partida.precio_unitario);
  // Sin cantidad (partida opcional o lista de precios) no hay importe.
  const cantidad = partida.cantidad == null ? NaN : Number(partida.cantidad);
  const puSinIva = pu / divisorIva;
  return {
    moneda,
    tc,
    tasa,
    equivalencia,
    ivaIncluido: Boolean(cotizacion.precios_incluyen_iva),
    puOriginal: pu, // como viene en el documento
    puOriginalSinIva: puSinIva, // en la moneda de la cotización
    puMXN: (puSinIva * tc) / equivalencia, // MXN sin IVA por unidad del producto
    importeOriginal: Number.isFinite(cantidad) ? puSinIva * cantidad : NaN,
    importeMXN: Number.isFinite(cantidad) ? puSinIva * tc * cantidad : NaN,
  };
}

export function estadoVigencia(cotizacion, hoy = hoyISO()) {
  if (!cotizacion.vigencia) return "sin-vigencia";
  return cotizacion.vigencia >= hoy ? "vigente" : "vencida";
}

function totalesCotizacion(cotizacion, config) {
  const conImporte = cotizacion.partidas.filter((p) => Number.isFinite(p.precio.importeMXN));
  const tasa = cotizacion.iva ?? config.iva ?? IVA_GENERAL;
  if (!conImporte.length) return null; // lista de precios sin cantidades
  const subtotalMXN = conImporte.reduce((s, p) => s + p.precio.importeMXN, 0);
  const subtotalOriginal = conImporte.reduce((s, p) => s + p.precio.importeOriginal, 0);
  return {
    tasa,
    subtotalMXN,
    ivaMXN: subtotalMXN * tasa,
    totalMXN: subtotalMXN * (1 + tasa),
    subtotalOriginal,
    totalOriginal: subtotalOriginal * (1 + tasa),
  };
}

const comoLista = (valor) => (Array.isArray(valor) ? valor : valor ? [valor] : []).filter(Boolean);

// ---- Índice ----

export function construirIndice(datos, { hoy = hoyISO() } = {}) {
  const config = { moneda_base: MONEDA_BASE, iva: IVA_GENERAL, ...(datos.config ?? {}) };

  // Taxonomía: los productos cuelgan de hojas; cada nodo conoce su ruta.
  const nodos = new Map();
  const alias = new Map();
  const raices = [];
  const recorrer = (lista, padre, nivel) => {
    for (const fuente of lista ?? []) {
      const nodo = {
        id: fuente.id,
        nombre: fuente.nombre,
        descripcion: fuente.descripcion ?? "",
        atributos: fuente.atributos ?? [],
        nivel,
        padre,
        hijos: [],
        productos: [],
        total: 0,
        ruta: padre ? [...padre.ruta, fuente.id] : [fuente.id],
      };
      nodos.set(nodo.id, nodo);
      for (const viejo of fuente.alias ?? []) alias.set(viejo, nodo.id);
      (padre ? padre.hijos : raices).push(nodo);
      recorrer(fuente.hijos, nodo, nivel + 1);
    }
  };
  recorrer(datos.taxonomia, null, 1);

  const proveedores = new Map();
  for (const p of datos.proveedores ?? []) {
    proveedores.set(p.id, {
      ...p,
      contactos: p.contactos ?? [],
      marcas: p.marcas ?? [],
      cotizaciones: [],
      productos: new Set(),
      categorias: new Set(),
    });
  }

  const productos = new Map();
  for (const p of datos.productos ?? []) {
    const nodo = nodos.get(p.categoria) ?? nodos.get(alias.get(p.categoria)) ?? null;
    const producto = { ...p, atributos: p.atributos ?? {}, nodo, ofertas: [], fichas: [] };
    productos.set(p.id, producto);
    if (nodo) nodo.productos.push(producto);
  }

  const cotizaciones = new Map();
  for (const c of datos.cotizaciones ?? []) {
    const proveedor = proveedores.get(c.proveedor) ?? null;
    const cotizacion = {
      ...c,
      condiciones: c.condiciones ?? {},
      proveedorObj: proveedor,
      contactoObj: proveedor?.contactos.find((k) => k.id === c.contacto) ?? null,
      estado: estadoVigencia(c, hoy),
      partidas: [],
    };
    cotizacion.partidas = (c.partidas ?? []).map((partida, i) => {
      const producto = partida.producto ? productos.get(partida.producto) ?? null : null;
      const oferta = {
        ...partida,
        n: i + 1,
        cotizacion,
        productoObj: producto,
        diferencias: comoLista(partida.diferencias),
        precio: precioPartida(c, partida, config),
      };
      if (producto) producto.ofertas.push(oferta);
      return oferta;
    });
    cotizacion.totales = totalesCotizacion(cotizacion, config);
    cotizaciones.set(c.id, cotizacion);
    if (proveedor) {
      proveedor.cotizaciones.push(cotizacion);
      for (const partida of cotizacion.partidas) {
        if (!partida.productoObj) continue;
        proveedor.productos.add(partida.productoObj);
        if (partida.productoObj.nodo) proveedor.categorias.add(partida.productoObj.nodo.ruta[0]);
      }
    }
  }

  const fichas = new Map();
  for (const f of datos.fichas ?? []) {
    const producto = productos.get(f.producto) ?? null;
    const ficha = { ...f, datos: f.datos ?? [], archivo: f.archivo ?? {}, productoObj: producto };
    fichas.set(f.id, ficha);
    if (producto) producto.fichas.push(ficha);
  }

  for (const producto of productos.values()) producto.resumen = resumirProducto(producto);
  const contar = (nodo) => {
    nodo.total = nodo.productos.length + nodo.hijos.reduce((suma, hijo) => suma + contar(hijo), 0);
    return nodo.total;
  };
  raices.forEach(contar);
  for (const nodo of nodos.values()) nodo.productos.sort((a, b) => compararTexto(a.nombre, b.nombre));
  for (const proveedor of proveedores.values()) proveedor.cotizaciones.sort(porFechaDesc);

  return {
    config,
    hoy,
    generado: datos.generado ?? null,
    nodos,
    raices,
    alias,
    productos,
    proveedores,
    cotizaciones,
    fichas,
    listaCotizaciones: [...cotizaciones.values()].sort(porFechaDesc),
    bitacora: [...(datos.bitacora ?? [])].sort((a, b) => compararTexto(b.fecha, a.fecha)),
    usuarios: datos.usuarios ?? [],
  };
}

// ---- Consultas sobre el índice ----

export const buscarNodo = (indice, id) => indice.nodos.get(id) ?? indice.nodos.get(indice.alias.get(id)) ?? null;

export function hojasDe(nodo) {
  return nodo.hijos.length ? nodo.hijos.flatMap(hojasDe) : [nodo];
}

export function productosDe(nodo) {
  return [...nodo.productos, ...nodo.hijos.flatMap(productosDe)];
}

// Columnas de atributos para la tabla de una familia: las sugeridas por
// la taxonomía (heredadas de los ancestros) y luego las que aparecen en
// los productos, de la más a la menos frecuente.
export function columnasDe(nodo, productos = productosDe(nodo), maximo = 6) {
  const sugeridas = [];
  for (let n = nodo; n; n = n.padre) sugeridas.unshift(...n.atributos);
  const frecuencia = new Map();
  for (const p of productos) {
    for (const clave of Object.keys(p.atributos)) frecuencia.set(clave, (frecuencia.get(clave) ?? 0) + 1);
  }
  const presentes = [...new Set(sugeridas)].filter((c) => frecuencia.has(c));
  const extra = [...frecuencia.entries()]
    .filter(([c]) => !presentes.includes(c))
    .sort((a, b) => b[1] - a[1] || compararTexto(a[0], b[0]))
    .map(([c]) => c);
  return [...presentes, ...extra].slice(0, maximo);
}

// ---- Resumen de precios de un producto ----

export function resumirProducto(producto) {
  const ofertas = [...producto.ofertas].sort(
    (a, b) => compararTexto(b.cotizacion.fecha, a.cotizacion.fecha) || a.precio.puMXN - b.precio.puMXN,
  );
  if (!ofertas.length) return { n: 0, ofertas, historial: [], comparativa: [], nProveedores: 0 };

  const porProveedor = new Map();
  for (const oferta of ofertas) {
    const clave = oferta.cotizacion.proveedor;
    if (!porProveedor.has(clave)) porProveedor.set(clave, []);
    porProveedor.get(clave).push(oferta);
  }

  // Lo más reciente de cada proveedor, del más barato al más caro.
  const comparativa = [...porProveedor.values()]
    .map((lista) => lista[0])
    .sort((a, b) => a.precio.puMXN - b.precio.puMXN);

  const mejorVigente = ofertas
    .filter((o) => o.cotizacion.estado === "vigente")
    .reduce((mejor, o) => (!mejor || o.precio.puMXN < mejor.precio.puMXN ? o : mejor), null);

  // Variación en el tiempo: se mide con un mismo proveedor (para no mezclar
  // diferencias entre proveedores con cambios de precio), el de cotización
  // más reciente que tenga al menos dos fechas distintas.
  let variacion = null;
  const listas = [...porProveedor.values()].sort((a, b) =>
    compararTexto(b[0].cotizacion.fecha, a[0].cotizacion.fecha),
  );
  for (const lista of listas) {
    const hasta = lista[0];
    const desde = lista[lista.length - 1];
    if (hasta.cotizacion.fecha === desde.cotizacion.fecha) continue;
    variacion = {
      proveedor: hasta.cotizacion.proveedorObj,
      desde,
      hasta,
      cambio: hasta.precio.puMXN / desde.precio.puMXN - 1,
      dias: diasEntre(desde.cotizacion.fecha, hasta.cotizacion.fecha),
    };
    break;
  }

  const valores = ofertas.map((o) => o.precio.puMXN);
  return {
    n: ofertas.length,
    ofertas,
    historial: [...ofertas].reverse(),
    ultimo: ofertas[0],
    comparativa,
    mejorVigente,
    minimo: Math.min(...valores),
    maximo: Math.max(...valores),
    nProveedores: porProveedor.size,
    variacion,
  };
}

// Campos en los que difieren las ofertas de distintos proveedores para un
// mismo producto. Complementa las notas de "diferencias" de cada partida.
export function diferenciasEntreOfertas(ofertas) {
  if (ofertas.length < 2) return [];
  const campos = [
    ["Marca", (o) => o.marca],
    ["Modelo", (o) => o.modelo],
    ["Unidad cotizada", (o) => o.unidad],
    ["Moneda", (o) => o.cotizacion.moneda || MONEDA_BASE],
    ["Tiempo de entrega", (o) => o.cotizacion.condiciones.entrega],
    ["Flete", (o) => o.cotizacion.condiciones.flete],
    ["Pago", (o) => o.cotizacion.condiciones.pago],
  ];
  const resultado = [];
  for (const [etiqueta, leer] of campos) {
    const valores = ofertas.map((o) => String(leer(o) ?? "").trim());
    if (valores.every((v) => !v)) continue;
    if (new Set(valores.map(normalizar)).size > 1) {
      resultado.push({
        etiqueta,
        valores: ofertas.map((o, i) => ({ proveedor: o.cotizacion.proveedorObj, valor: valores[i] })),
      });
    }
  }
  return resultado;
}

// Ruta de nombres de un nodo: ["Válvulas", "Seccionamiento", "Compuerta"].
export const rutaNombres = (indice, nodo) => (nodo ? nodo.ruta.map((id) => indice.nodos.get(id).nombre) : []);
