// ============================================================
//  Búsqueda instantánea sobre todo el catálogo
// ============================================================
//
// Cada término de la consulta debe aparecer (como palabra o prefijo)
// en algún campo del documento. El puntaje suma, por término, el peso
// del mejor campo donde aparece: el nombre pesa más que la descripción.

import { normalizar } from "./util.js";
import { rutaNombres } from "./modelo.js";

// Variantes que la gente escribe para lo mismo.
const SINONIMOS = {
  pulgada: "in",
  pulgadas: "in",
  pulg: "in",
  plg: "in",
  inch: "in",
  fierro: "hierro",
  fofo: "hierro",
  hdpe: "pead",
  pe100: "pead",
  valv: "valvula",
  vlv: "valvula",
  mts: "m",
  mt: "m",
  metro: "m",
  metros: "m",
  pza: "pieza",
  pzas: "pieza",
  piezas: "pieza",
};

export function terminos(texto) {
  // En México 2" y 2'' son pulgadas; 20' son pies.
  return normalizar(texto)
    .replace(/''|["″”“]/g, " in ")
    .replace(/(\d)\s*['’](?=\s|$)/g, "$1 ft ")
    .split(/[^a-z0-9./-]+/)
    .map((t) => t.replace(/^[./-]+|[./-]+$/g, ""))
    .filter(Boolean)
    .map((t) => SINONIMOS[t] ?? t);
}

function campo(peso, ...textos) {
  const lista = terminos(textos.flat().filter(Boolean).join(" "));
  return { peso, terminos: lista, unido: ` ${lista.join(" ")} ` };
}

function documentos(indice) {
  const docs = [];
  for (const p of indice.productos.values()) {
    const ofertas = p.resumen?.ofertas ?? [];
    docs.push({
      tipo: "producto",
      id: p.id,
      objeto: p,
      campos: [
        campo(10, p.id),
        campo(5, p.nombre),
        campo(4, p.palabras_clave ?? []),
        campo(2, Object.values(p.atributos).map(String), rutaNombres(indice, p.nodo)),
        campo(2.5, ofertas.flatMap((o) => [o.marca, o.modelo, o.clave])),
        campo(1.5, ofertas.map((o) => o.descripcion)),
        campo(1, p.descripcion, ofertas.map((o) => o.cotizacion.proveedorObj?.nombre)),
      ],
    });
  }
  for (const p of indice.proveedores.values()) {
    docs.push({
      tipo: "proveedor",
      id: p.id,
      objeto: p,
      campos: [
        campo(5, p.nombre),
        campo(3, p.razon_social, p.rfc),
        campo(2, p.marcas, p.contactos.map((k) => k.nombre)),
        campo(1, p.ciudad, p.tipo, p.notas),
      ],
    });
  }
  for (const c of indice.cotizaciones.values()) {
    docs.push({
      tipo: "cotizacion",
      id: c.id,
      objeto: c,
      campos: [campo(10, c.id), campo(6, c.folio), campo(3, c.proveedorObj?.nombre), campo(2, c.proyecto, c.fecha)],
    });
  }
  for (const f of indice.fichas.values()) {
    docs.push({
      tipo: "ficha",
      id: f.id,
      objeto: f,
      campos: [
        campo(10, f.id),
        campo(4, f.titulo, f.fabricante, f.modelo),
        campo(2, f.productoObj?.nombre),
        campo(1, f.datos.map((d) => `${d.parametro} ${d.valor}`)),
      ],
    });
  }
  return docs;
}

// Qué tan bien aparece un término en un campo: exacto, prefijo o dentro.
function coincidencia(termino, c) {
  if (c.terminos.includes(termino)) return 1;
  if (c.unido.includes(` ${termino}`)) return 0.7;
  if (termino.length >= 3 && c.unido.includes(termino)) return 0.35;
  return 0;
}

export function crearBuscador(indice) {
  const docs = documentos(indice);
  return {
    buscar(consulta, { limite = 50, tipos = null } = {}) {
      const lista = [...new Set(terminos(consulta))];
      if (!lista.length) return [];
      const resultados = [];
      for (const doc of docs) {
        if (tipos && !tipos.includes(doc.tipo)) continue;
        let puntaje = 0;
        for (const termino of lista) {
          let mejor = 0;
          for (const c of doc.campos) mejor = Math.max(mejor, coincidencia(termino, c) * c.peso);
          if (!mejor) {
            puntaje = 0;
            break;
          }
          puntaje += mejor;
        }
        if (puntaje) resultados.push({ tipo: doc.tipo, id: doc.id, objeto: doc.objeto, puntaje });
      }
      return resultados.sort((a, b) => b.puntaje - a.puntaje).slice(0, limite);
    },
  };
}
