import jwt from 'jsonwebtoken';
import { suscribir } from '../../services/notificaciones/salaEventos.js';
import * as sala from '../../services/notificaciones/salaServices.js';

// AJUSTA: usa tu responderError si ya tienes uno
function responderError(res, error) {
  if (!error.status) console.error(error);
  res.status(error.status ?? 500).json({ error: error.status ? error.message : 'Error interno' });
}

const entero = (valor, nombre) => {
  const n = Number.parseInt(valor, 10);
  if (!Number.isInteger(n)) throw new sala.ErrorSala(`${nombre} no es válido`, 400);
  return n;
};

// ---- Pantalla de la TV (sin login: usa un token propio de solo lectura) ----
export const eventosSala = async (req, res) => {
  try {
    const idClinica = entero(req.params.idClinica, 'La clínica');
    try {
      const p = jwt.verify(String(req.query.key ?? ''), process.env.JWT_SECRET, { algorithms: ['HS256'] });
      if (p.scope !== 'pantalla' || Number(p.idClinica) !== idClinica) throw new Error();
    } catch {
      return res.status(401).json({ error: 'Pantalla no autorizada' });
    }
    suscribir(idClinica, req, res, await sala.estadoSala(idClinica));
  } catch (error) {
    responderError(res, error);
  }
};

// Un administrador genera el enlace que se abre en la TV
export const crearTokenPantalla = (req, res) => {
  try {
    const idClinica = entero(req.body?.idClinica, 'La clínica');
    // Sin "sub": este token NO sirve para el resto de tu API (leerToken lo rechaza)
    const token = jwt.sign({ scope: 'pantalla', idClinica }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '365d',
    });
    res.json({ token });
  } catch (error) {
    responderError(res, error);
  }
};

// ---- Acciones ----
export const llegada = async (req, res) => {
  try {
    res.json(await sala.marcarLlegada(entero(req.params.id, 'El id de la cita')));
  } catch (error) { responderError(res, error); }
};

const accionDoctor = (fn) => async (req, res) => {
  try {
    const idOdontologo = await sala.idOdontologoDeUsuario(req.usuario.sub);
    res.json(await fn(idOdontologo));
  } catch (error) { responderError(res, error); }
};

export const faltan5 = accionDoctor(sala.faltan5);
export const terminar = accionDoctor(sala.terminar);
export const llamarSiguiente = accionDoctor(sala.llamarSiguiente);