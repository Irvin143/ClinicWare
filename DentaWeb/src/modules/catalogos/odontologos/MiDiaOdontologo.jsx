import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, CheckCheck, Clock, Loader2, PhoneCall, Stethoscope, User } from 'lucide-react';
import { citasApi, salaApi } from '../../../services/api.js';
import { ToastContainer } from '../../../components/Toast.jsx';

const REFRESCO_MS = 20000;

const ESTADOS_ESPERA = ['PENDIENTE', 'CONFIRMADA'];
const ESTADOS_FIN = ['ATENDIDA', 'NO_ASISTIO'];

const minutosDesde = (iso, ahora) => {
  if (!iso) return null;
  const ms = ahora - new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 60000)) : null;
};

/* ---------- Toasts ---------- */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const siguienteId = useRef(0);
  const temporizadores = useRef(new Set());

  const programar = useCallback((fn, ms) => {
    const t = setTimeout(() => {
      temporizadores.current.delete(t);
      fn();
    }, ms);
    temporizadores.current.add(t);
  }, []);

  useEffect(() => {
    const pendientes = temporizadores.current;
    return () => pendientes.forEach(clearTimeout);
  }, []);

  const cerrar = useCallback(
    (id) => {
      setToasts((a) => a.map((t) => (t.id === id ? { ...t, visible: false } : t)));
      programar(() => setToasts((a) => a.filter((t) => t.id !== id)), 300);
    },
    [programar],
  );

  const mostrar = useCallback(
    (tipo, mensaje, duracion = 5000) => {
      const id = ++siguienteId.current;
      setToasts((a) => [...a, { id, tipo, mensaje, visible: false }]);
      programar(() => setToasts((a) => a.map((t) => (t.id === id ? { ...t, visible: true } : t))), 20);
      programar(() => cerrar(id), duracion);
    },
    [programar, cerrar],
  );

  return { toasts, mostrar, cerrar };
}

/* ---------- Piezas ---------- */
function Bloque({ titulo, cantidad, children }) {
  return (
    <section className="rounded-2xl border border-outline-variant bg-on-primary p-4 shadow-sm sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-on-surface-variant">
        {titulo}
        <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs font-bold text-on-surface">
          {cantidad}
        </span>
      </h2>
      {children}
    </section>
  );
}

function Vacio({ texto }) {
  return <p className="text-sm text-on-surface-variant">{texto}</p>;
}

function FilaPaciente({ cita, detalle }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-outline-variant dark:bg-surface-container">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-semibold text-on-surface">
          <User size={15} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
          <span className="truncate">{cita.paciente}</span>
        </p>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          {cita.hora}–{cita.hora_fin} · {cita.servicio}
        </p>
      </div>
      {detalle ? <p className="text-xs font-medium text-on-surface-variant">{detalle}</p> : null}
    </li>
  );
}

/* ---------- Página ---------- */
export default function MiDiaOdontologo() {
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [accion, setAccion] = useState(null); // 'llamar' | 'aviso' | 'terminar'
  const [ahora, setAhora] = useState(() => Date.now());
  const { toasts, mostrar, cerrar: cerrarToast } = useToasts();

  const cargar = useCallback(async () => {
    try {
      const datos = await citasApi.miDia();
      setCitas(Array.isArray(datos) ? datos : []);
      setErrorCarga('');
    } catch (e) {
      setErrorCarga(e.message || 'No se pudieron cargar tus pacientes.');
    } finally {
      setCargando(false);
    }
  }, []);

  // Carga inicial + refresco periódico
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar
    void cargar();
    const refresco = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(refresco);
  }, [cargar]);

  // Reloj para los "lleva X min"
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(reloj);
  }, []);

  const enConsulta = citas.find((c) => c.estado === 'EN_CONSULTA') ?? null;
  const enSala = citas
    .filter((c) => c.estado === 'EN_SALA')
    .sort((a, b) => new Date(a.hora_llegada ?? 0) - new Date(b.hora_llegada ?? 0));
  const proximos = citas.filter((c) => ESTADOS_ESPERA.includes(c.estado));
  const terminados = citas.filter((c) => ESTADOS_FIN.includes(c.estado));

  async function ejecutar(nombre, fn, mensajeExito) {
    if (accion) return;
    setAccion(nombre);
    try {
      await fn();
      if (mensajeExito) mostrar('exito', mensajeExito);
      await cargar();
    } catch (e) {
      mostrar('error', e.message || 'No se pudo completar la acción.');
    } finally {
      setAccion(null);
    }
  }

  const llamarSiguiente = () => ejecutar('llamar', () => salaApi.llamarSiguiente(), 'Paciente en consulta.');
  const avisarCinco = () => ejecutar('aviso', () => salaApi.faltan5(), 'Se avisó que faltan 5 minutos.');
  const terminar = () =>
    ejecutar(
      'terminar',
      () => salaApi.terminar(),
      enSala.length > 0 ? 'Consulta terminada. Se llamó al siguiente.' : 'Consulta terminada.',
    );

  const claseBoton =
    'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <section className="flex min-h-full flex-col gap-5 bg-surface p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold text-on-surface">Mi día</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Tus pacientes de hoy. Se actualiza solo cada {REFRESCO_MS / 1000} segundos.
        </p>
      </header>

      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-on-surface-variant" aria-busy="true">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Cargando tus pacientes…
        </p>
      ) : errorCarga ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-2xl bg-error-container p-4">
          <p className="text-sm text-error">{errorCarga}</p>
          <button
            type="button"
            onClick={cargar}
            className="cursor-pointer rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {/* En consulta */}
          <Bloque titulo="En consulta" cantidad={enConsulta ? 1 : 0}>
            {enConsulta ? (
              <div className="rounded-xl border border-indigo-300 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-950/60">
                <p className="flex items-center gap-2 text-lg font-bold text-indigo-900 dark:text-indigo-200">
                  <Stethoscope size={20} aria-hidden="true" />
                  {enConsulta.paciente}
                </p>
                <p className="mt-1 text-sm text-indigo-900/80 dark:text-indigo-200/80">
                  {enConsulta.servicio} · lleva {minutosDesde(enConsulta.inicio_consulta, ahora) ?? 0} min en consulta
                </p>
                {enConsulta.observaciones ? (
                  <p className="mt-2 text-sm text-indigo-900/80 dark:text-indigo-200/80">{enConsulta.observaciones}</p>
                ) : null}
                {enConsulta.aviso_5min ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/70 dark:text-amber-300">
                    <BellRing size={13} aria-hidden="true" />
                    Ya avisaste que faltan 5 minutos
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={avisarCinco}
                    disabled={Boolean(accion) || enConsulta.aviso_5min}
                    className={`${claseBoton} border border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200`}
                  >
                    {accion === 'aviso' ? (
                      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <BellRing size={18} aria-hidden="true" />
                    )}
                    Faltan 5 min
                  </button>
                  <button
                    type="button"
                    onClick={terminar}
                    disabled={Boolean(accion)}
                    className={`${claseBoton} bg-teal-600 text-white hover:bg-teal-700`}
                  >
                    {accion === 'terminar' ? (
                      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCheck size={18} aria-hidden="true" />
                    )}
                    {enSala.length > 0 ? 'Terminé y llamar siguiente' : 'Terminé'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Vacio texto="No tienes ningún paciente en consulta." />
                <button
                  type="button"
                  onClick={llamarSiguiente}
                  disabled={Boolean(accion) || enSala.length === 0}
                  className={`${claseBoton} bg-teal-600 text-white hover:bg-teal-700`}
                >
                  {accion === 'llamar' ? (
                    <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <PhoneCall size={18} aria-hidden="true" />
                  )}
                  Llamar siguiente
                </button>
              </div>
            )}
          </Bloque>

          {/* En sala */}
          <Bloque titulo="En sala" cantidad={enSala.length}>
            {enSala.length === 0 ? (
              <Vacio texto="No hay pacientes esperando." />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {enSala.map((c) => {
                  const espera = minutosDesde(c.hora_llegada, ahora);
                  return (
                    <FilaPaciente
                      key={c.id_cita}
                      cita={c}
                      detalle={espera != null ? `Espera ${espera} min` : null}
                    />
                  );
                })}
              </ul>
            )}
          </Bloque>

          {/* Próximos */}
          <Bloque titulo="Próximos" cantidad={proximos.length}>
            {proximos.length === 0 ? (
              <Vacio texto="No tienes más citas programadas hoy." />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {proximos.map((c) => (
                  <FilaPaciente key={c.id_cita} cita={c} detalle="Aún no llega" />
                ))}
              </ul>
            )}
          </Bloque>

          {/* Terminados */}
          <Bloque titulo="Terminados" cantidad={terminados.length}>
            {terminados.length === 0 ? (
              <Vacio texto="Todavía no has terminado ninguna consulta hoy." />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {terminados.map((c) => (
                  <FilaPaciente
                    key={c.id_cita}
                    cita={c}
                    detalle={c.estado === 'NO_ASISTIO' ? 'No asistió' : 'Atendido'}
                  />
                ))}
              </ul>
            )}
          </Bloque>

        </>
      )}

      <ToastContainer toasts={toasts} onCerrar={cerrarToast} />
    </section>
  );
}