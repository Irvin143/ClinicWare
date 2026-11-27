import { useEffect, useState, useCallback } from "react";
import { salaApi } from "../../services/api.js";

const base =
  "rounded-2xl p-4 text-xl font-medium focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#10302C] disabled:opacity-50";

export default function PanelDoctor() {
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState(null); // null | "llamado" | "en_consulta"

  const cargarEstado = useCallback(async () => {
    try {
      const { pacienteActual } = await salaApi.estado();
      setEstado(pacienteActual?.estado ?? null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    cargarEstado();
  }, [cargarEstado]);

  async function ejecutar(accion) {
    setError("");
    setOcupado(true);
    try {
      await accion();
      await cargarEstado(); // refresca para mostrar los botones correctos
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-md gap-3 p-4">
      {estado === null && (
        <button
          disabled={ocupado}
          onClick={() => ejecutar(salaApi.llamarSiguiente)}
          className={`${base} border-2 border-[#1B7F66] text-[#1B7F66]`}
        >
          Llamar siguiente
        </button>
      )}

      {estado === "llamado" && (
        <>
          <p className="rounded-xl bg-amber-50 p-3 text-center text-[#2B1B00]">
            Paciente llamado, esperando que llegue al consultorio
          </p>
          <button
            disabled={ocupado}
            onClick={() => ejecutar(salaApi.iniciarConsulta)}
            className={`${base} bg-[#1B7F66] text-white`}
          >
            Ya llegó · Iniciar consulta
          </button>
        </>
      )}

      {estado === "en_consulta" && (
        <>
          <button
            disabled={ocupado}
            onClick={() => ejecutar(salaApi.faltan5)}
            className={`${base} bg-[#E59A2F] text-[#2B1B00]`}
          >
            Faltan 5 min
          </button>
          <button
            disabled={ocupado}
            onClick={() => ejecutar(salaApi.terminar)}
            className={`${base} bg-[#1B7F66] text-white`}
          >
            Terminé
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}