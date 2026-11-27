import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Monitor } from 'lucide-react';
import { salaApi } from '../../services/api.js';

/**
 * Acceso a la pantalla de sala para cuentas de clínica.
 * - Si la cuenta tiene una sola clínica, abre la pantalla directamente.
 * - Si tiene varias, muestra la lista para elegir.
 * Abre la misma ruta que el botón "Pantalla de sala" del catálogo: /sala?clinica=ID
 */
export default function PantallaSalaAcceso() {
  const navigate = useNavigate();
  const [clinicas, setClinicas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

    const abrir = useCallback((idClinica, key) => {
    const url = `/sala?clinica=${idClinica}&key=${encodeURIComponent(key)}`;
    window.open(url, '_blank');
    }, []);

    const cargar = useCallback(async () => {
    setCargando(true);
    setError('');

    try {
        const datos = await salaApi.misClinicas();
        const lista = Array.isArray(datos) ? datos : [];

        if (lista.length === 1) {
        const respuesta = await salaApi.crearTokenPantalla(lista[0].id_clinica);

        abrir(lista[0].id_clinica, respuesta.token);
        return;
        }

        setClinicas(lista);
    } catch (e) {
        setError(e.message || 'No se pudieron cargar tus clínicas.');
    } finally {
        setCargando(false);
    }
    }, [abrir]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar
    void cargar();
  }, [cargar]);

  return (
    <section className="flex min-h-full flex-col gap-6 bg-surface p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold text-on-surface">Pantalla de sala</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Abre la pantalla que muestra a los pacientes quién sigue.
        </p>
      </header>

      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-on-surface-variant" aria-busy="true">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Buscando tus clínicas…
        </p>
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-2xl bg-error-container p-4">
          <p className="text-sm text-error">{error}</p>
          <button
            type="button"
            onClick={cargar}
            className="cursor-pointer rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container"
          >
            Reintentar
          </button>
        </div>
      ) : clinicas.length === 0 ? (
        <p className="rounded-2xl border border-outline-variant bg-on-primary p-4 text-sm text-on-surface-variant">
          Tu cuenta no tiene clínicas asignadas.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {clinicas.map((c) => (
            <li key={c.id_clinica}>
              <button
                type="button"
                onClick={() => abrir(c.id_clinica, false, key)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-outline-variant bg-on-primary p-4 text-left shadow-sm transition-colors hover:bg-surface-container"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container/10 text-primary">
                  <Monitor size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 font-semibold text-on-surface">{c.nombre}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}