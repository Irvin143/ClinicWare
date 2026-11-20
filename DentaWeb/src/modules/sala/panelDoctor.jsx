import { useState } from "react";
import { salaApi } from "../../services/api.js";

export default function PanelDoctor() {
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function ejecutar(accion) {
    setError("");
    setOcupado(true);
    try {
      await accion();
    } catch (e) {
      setError(e.message); // ApiError ya trae el mensaje del backend
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-md gap-3 p-4">
      <button
        disabled={ocupado}
        onClick={() => ejecutar(salaApi.faltan5)}
        className="rounded-2xl bg-[#E59A2F] p-4 text-xl font-medium text-[#2B1B00] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#10302C] disabled:opacity-50"
      >
        Faltan 5 min
      </button>
      <button
        disabled={ocupado}
        onClick={() => ejecutar(salaApi.terminar)}
        className="rounded-2xl bg-[#1B7F66] p-4 text-xl font-medium text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#10302C] disabled:opacity-50"
      >
        Terminé
      </button>
      <button
        disabled={ocupado}
        onClick={() => ejecutar(salaApi.llamarSiguiente)}
        className="rounded-2xl border-2 border-[#1B7F66] p-4 text-xl font-medium text-[#1B7F66] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#10302C] disabled:opacity-50"
      >
        Llamar siguiente
      </button>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}