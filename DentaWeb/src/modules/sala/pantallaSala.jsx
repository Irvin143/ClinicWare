import { useEffect, useRef, useState } from "react";
import { salaApi } from "../../services/api.js";

function ding() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
    osc.start();
    osc.stop(ctx.currentTime + 1);
  } catch { /* el navegador bloquea audio hasta el primer clic */ }
}

export default function PantallaSala() {
  const params = new URLSearchParams(window.location.search);
  const idClinica = params.get("clinica");

  const [key, setKey] = useState(params.get("key"));
  const [errorClave, setErrorClave] = useState("");
  const [estado, setEstado] = useState(null);
  const [sonido, setSonido] = useState(false);
  const previos = useRef({}); // idodontologo -> paciente llamado (para detectar cambios)

  useEffect(() => {
    if (key || !idClinica) return;
    let activo = true;
    salaApi
      .crearTokenPantalla(Number(idClinica))
      .then(({ token }) => {
        if (!activo) return;
        const url = new URL(window.location.href);
        url.searchParams.set("key", token);
        window.history.replaceState(null, "", url);
        setKey(token);
      })
      .catch(() =>
        activo &&
        setErrorClave("No se pudo obtener la clave. Inicia sesión como administrador o abre un enlace que incluya la clave.")
      );
    return () => { activo = false; };
  }, [key, idClinica]);

  useEffect(() => {
    if (!idClinica || !key) return;
    const es = new EventSource(salaApi.urlEventos(idClinica, key));
    es.onmessage = (e) => {
      const nuevo = JSON.parse(e.data);
      nuevo.doctores.forEach((d) => {
        const nombre = d.llamado?.paciente ?? null;
        if (nombre && previos.current[d.idodontologo] !== nombre) ding();
        previos.current[d.idodontologo] = nombre;
      });
      setEstado(nuevo);
    };
    return () => es.close();
  }, [idClinica, key]);

  if (!idClinica) {
    return <p className="p-6">Falta la clínica. Abre la dirección así: /sala?clinica=1</p>;
  }
  if (errorClave) {
    return <p className="p-6 text-red-700">{errorClave}</p>;
  }

  return (
    <main className="grid min-h-screen content-start gap-[3vh] bg-[#EEF4F2] px-[4vw] py-[3vh] font-['Atkinson_Hyperlegible',system-ui,sans-serif] text-[#10302C] grid-cols-[repeat(auto-fit,minmax(min(26rem,100%),1fr))]">
      {!sonido && (
        <button
          className="fixed bottom-4 right-4 z-10 cursor-pointer rounded-xl bg-[#10302C] px-4 py-2.5 text-white"
          onClick={() => { setSonido(true); ding(); }}
        >
          Activar sonido
        </button>
      )}
      {estado?.clinica && (
        <h1 className="col-span-full text-[clamp(1.5rem,3vw,3rem)] font-bold">
          {estado.clinica}
        </h1>
      )}

      {!estado && <p className="col-span-full text-3xl text-[#6B8782]">Conectando…</p>}
      {estado && estado.doctores.length === 0 && (
        <p className="col-span-full text-3xl text-[#6B8782]">No hay pacientes en sala por ahora</p>
      )}

      {estado?.doctores.map((d) => {
        const llamado = !!d.llamado;
        const enConsulta = !llamado && !!d.actual;
        const prepararse = d.actual?.aviso5min && d.siguiente;

        const etiqueta = llamado
          ? "Pase al consultorio"
          : enConsulta
          ? "En consulta"
          : "Consultorio libre";
        const paciente = llamado ? d.llamado.paciente : d.actual?.paciente ?? "—";

        return (
          <section className="grid gap-[1.5vh]" key={d.idodontologo}>
            <h2 className="text-[clamp(1.3rem,2.2vw,2rem)] text-[#4F6B66]">{d.nombre}</h2>

            <div
              className={`flex min-h-[24vh] flex-col justify-center rounded-3xl px-[2.5vw] py-[3vh] ${
                llamado ? "animate-pulse bg-[#1B7F66] text-white" : "bg-white"
              }`}
            >
              <small className={`mb-1 text-[clamp(1rem,1.8vw,1.6rem)] ${llamado ? "text-[#D5F0E8]" : "text-[#6B8782]"}`}>
                {etiqueta}
              </small>
              <strong className="text-[clamp(2.5rem,6vw,6rem)] leading-[1.05]">
                {paciente}
              </strong>
            </div>

            <div
              className={`flex min-h-[14vh] flex-col justify-center rounded-3xl border-[3px] px-[2.5vw] py-[3vh] ${
                prepararse
                  ? "border-[#E59A2F] bg-[#E59A2F] text-[#2B1B00]"
                  : "border-dashed border-[#B7CBC6]"
              }`}
            >
              <small className={`mb-1 text-[clamp(1rem,1.8vw,1.6rem)] ${prepararse ? "text-[#4A3000]" : "text-[#6B8782]"}`}>
                {prepararse ? "Prepárese" : "Siguiente"}
              </small>
              <strong className="text-[clamp(1.6rem,3.6vw,3.6rem)] leading-[1.1]">
                {d.siguiente ? d.siguiente.paciente : "Sin pacientes en espera"}
              </strong>
            </div>
          </section>
        );
      })}
    </main>
  );
}