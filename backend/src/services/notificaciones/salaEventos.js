// Canal en tiempo real (SSE). Una "sala" = una clínica/sede.
const conexiones = new Map(); // idClinica -> Set<res>

export function suscribir(idClinica, req, res, estadoInicial) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // evita que nginx guarde en búfer el stream
  });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(estadoInicial)}\n\n`);

  if (!conexiones.has(idClinica)) conexiones.set(idClinica, new Set());
  conexiones.get(idClinica).add(res);
  req.on('close', () => conexiones.get(idClinica)?.delete(res));
}

// Manda el estado a todas las pantallas de esa clínica
export function emitir(idClinica, estado) {
  const msg = `data: ${JSON.stringify(estado)}\n\n`;
  conexiones.get(idClinica)?.forEach((res) => res.write(msg));
}

// Latido para que routers/proxies no cierren conexiones inactivas
setInterval(() => {
  conexiones.forEach((set) => set.forEach((res) => res.write(': ping\n\n')));
}, 25000);