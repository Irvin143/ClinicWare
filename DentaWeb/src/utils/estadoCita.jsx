const CLASE_PILDORA = 'inline-block rounded-full px-2.5 py-1 text-xs font-medium';

const ESTADOS = {
  pendiente: 'Pendiente',
  atendida: 'Atendida',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
  en_sala: 'En sala',
  en_consulta: 'En consulta',
};

export const ESTADOS_API = {
  pendiente: 'PENDIENTE',
  confirmada: 'CONFIRMADA',
  atendida: 'ATENDIDA',
  cancelada: 'CANCELADA',
  no_asistio: 'NO_ASISTIO',
  en_sala: 'EN_SALA',
  en_consulta: 'EN_CONSULTA',
};

export const OPCIONES_ESTADO_CITA = Object.entries(ESTADOS).map(([clave, etiqueta]) => ({
  valor: ESTADOS_API[clave],
  etiqueta,
}));

const TONOS = {
  Pendiente:     'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300',
  Confirmada:    'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300',
  'En sala':     'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-300',
  'En consulta': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300',
  Atendida:      'bg-teal-100 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300',
  Cancelada:     'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300',
  'No asistió':  'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300',
};

export const TONO_DESCONOCIDO = 'bg-surface-container text-on-surface-variant';

const claveEstado = (valor) =>
  String(valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');

export function etiquetaEstado(valor) {
  const clave = claveEstado(valor);
  if (ESTADOS[clave]) return ESTADOS[clave];
  const texto = String(valor ?? '').trim();
  return texto || '';
}

export function estadoParaApi(valor) {
  return ESTADOS_API[claveEstado(valor)] ?? null;
}

export function claseEstado(valor) {
  const etiqueta = etiquetaEstado(valor);
  return TONOS[etiqueta] ?? TONO_DESCONOCIDO;
}

export function BadgeEstado({ estado }) {
  const etiqueta = etiquetaEstado(estado);
  if (!etiqueta) return null;
  return <span className={`${CLASE_PILDORA} ${claseEstado(estado)}`}>{etiqueta}</span>;
}
