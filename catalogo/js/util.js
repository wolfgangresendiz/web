// ============================================================
//  Utilidades compartidas del catálogo
// ============================================================
//
// Nada aquí toca el DOM: las mismas funciones las usan la web y
// las herramientas de línea de comandos (catalogo/herramientas/catalogo.mjs).

// ---- Texto ----

// Minúsculas y sin acentos: "Válvula" → "valvula". Base de búsquedas y comparaciones.
export const normalizar = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// "Tubos del Norte, S.A." → "tubos-del-norte-s-a"
export const slug = (texto) =>
  normalizar(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Valor numérico al inicio de un texto, entendiendo fracciones de pulgada:
// "1 1/2\"" → 1.5, "1/2\"" → 0.5, "100 mm" → 100. Si no hay número, NaN.
export function valorNumerico(texto) {
  const t = String(texto ?? "").trim().replace(",", ".");
  let m = t.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^(\d+)\/(\d+)/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = t.match(/^-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

// Orden natural en español: ignora acentos y mayúsculas, y compara
// numéricamente cuando ambos valores empiezan con número (2" < 4" < 10").
const colador = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
export function compararTexto(a, b) {
  const na = valorNumerico(a);
  const nb = valorNumerico(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return colador.compare(String(a ?? ""), String(b ?? ""));
}

// Orden natural de identificadores: P-0002 < P-0010.
export const compararId = (a, b) => colador.compare(String(a), String(b));

// ---- HTML seguro ----
//
// Todo lo que viene de los datos (descripciones de proveedores, nombres,
// notas) se escapa al interpolarse con html`...`. Solo crudo() deja pasar
// HTML tal cual, y se usa únicamente con marcado generado por el código.

class HTMLSeguro {
  constructor(texto) {
    this.texto = texto;
  }
  toString() {
    return this.texto;
  }
}

export const crudo = (texto) => new HTMLSeguro(String(texto));

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapar = (valor) => String(valor ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

function aHTML(valor) {
  if (valor == null || valor === false) return "";
  if (valor instanceof HTMLSeguro) return valor.texto;
  if (Array.isArray(valor)) return valor.map(aHTML).join("");
  return escapar(valor);
}

export function html(partes, ...valores) {
  let salida = partes[0];
  valores.forEach((valor, i) => {
    salida += aHTML(valor) + partes[i + 1];
  });
  return new HTMLSeguro(salida);
}

// ---- Números y dinero ----

const formatosMoneda = new Map();
function formatoMoneda(moneda, decimales) {
  const clave = `${moneda}:${decimales}`;
  if (!formatosMoneda.has(clave)) {
    formatosMoneda.set(
      clave,
      new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: moneda,
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      }),
    );
  }
  return formatosMoneda.get(clave);
}

// $1,234.50 · USD 1,234.50 · EUR 99.00
export function dinero(valor, moneda = "MXN", decimales = 2) {
  if (!Number.isFinite(valor)) return "";
  return formatoMoneda(moneda, decimales).format(valor);
}

// Montos grandes abreviados para ejes: $950 · $12.5 k · $1.3 M
const compacto = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });
export function dineroCompacto(valor) {
  if (!Number.isFinite(valor)) return "";
  return Math.abs(valor) < 1000 ? dinero(valor, "MXN", valor % 1 ? 2 : 0) : `$${compacto.format(valor)}`;
}

const formatoNumero = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 4 });
export const numero = (valor) => (Number.isFinite(valor) ? formatoNumero.format(valor) : "");

const formatoPorcentaje = new Intl.NumberFormat("es-MX", {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
export const porcentaje = (valor) => (Number.isFinite(valor) ? formatoPorcentaje.format(valor) : "");

// ---- Fechas (ISO AAAA-MM-DD, siempre en hora local) ----

const dosDigitos = (n) => String(n).padStart(2, "0");

export function hoyISO(fecha = new Date()) {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

export const esFechaISO = (texto) => {
  if (typeof texto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const f = aFecha(texto);
  return hoyISO(f) === texto;
};

export function aFecha(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d);
}

export const diasEntre = (isoA, isoB) => Math.round((aFecha(isoB) - aFecha(isoA)) / 864e5);

export function sumarDias(iso, dias) {
  const f = aFecha(iso);
  f.setDate(f.getDate() + dias);
  return hoyISO(f);
}

const formatoFecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" });
const formatoMes = new Intl.DateTimeFormat("es-MX", { month: "short", year: "numeric" });
const formatoDiaMes = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });
const formatoFechaHora = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// "15 oct 2026"
export const fechaCorta = (iso) => (iso ? formatoFecha.format(aFecha(iso)).replace(/\./g, "") : "");
// "oct 2026"
export const mesCorto = (iso) => (iso ? formatoMes.format(aFecha(iso)).replace(/\./g, "") : "");
// "15 oct"
export const diaMes = (iso) => (iso ? formatoDiaMes.format(aFecha(iso)).replace(/\./g, "") : "");
// "15 oct 2026, 14:05" a partir de un ISO completo con hora
export const fechaHora = (isoCompleto) =>
  isoCompleto ? formatoFechaHora.format(new Date(isoCompleto)).replace(/\./g, "") : "";

// "hace 3 meses", "hace 12 días", "hoy"
export function antiguedad(iso, hoy = hoyISO()) {
  const dias = diasEntre(iso, hoy);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 45) return `hace ${dias} días`;
  const meses = Math.round(dias / 30.44);
  if (meses < 18) return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
  const anios = dias / 365.25;
  return `hace ${numero(Math.round(anios * 10) / 10)} años`;
}

// ---- Varios ----

export const plural = (n, singular, pluralTexto = `${singular}s`) => `${numero(n)} ${n === 1 ? singular : pluralTexto}`;

// Solo enlaces http(s): evita que un dato como "javascript:..." llegue a un href.
export const urlSegura = (url) => (/^https?:\/\//i.test(String(url ?? "").trim()) ? String(url).trim() : "");

export const urlDrive = (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
export const urlCarpetaDrive = (id) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

// Para enlaces wa.me: solo dígitos, con lada de país (52 si el número es de 10 dígitos).
export function digitosTelefono(telefono) {
  const d = String(telefono ?? "").replace(/\D/g, "");
  return d.length === 10 ? `52${d}` : d;
}
