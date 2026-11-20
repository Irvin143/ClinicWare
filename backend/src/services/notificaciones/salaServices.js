import conexion from '../conexion.js'; //
import { emitir } from './salaEventos.js';
// Fecha "de hoy" en la zona horaria de Culiacán
const HOY = `(now() AT TIME ZONE 'America/Mazatlan')::date`;

export class ErrorSala extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

// "María José Pérez" -> "María P."  (privacidad en la TV)
const abreviar = (nombre, apellido) => {
  const n = String(nombre ?? '').trim().split(/\s+/)[0];
  const a = String(apellido ?? '').trim().charAt(0).toUpperCase();
  return a ? `${n} ${a}.` : n;
};

// ---------- Estado que ve la pantalla ----------
export async function estadoSala(idClinica) {
  // AJUSTA nombres de columnas: pacientes.nombre/apellido, odontologos.nombre/apellido
  const { rows } = await conexion.query(
    `SELECT c.idcita, c.estado, c.aviso_5min, c.inicio_consulta, c.idodontologo,
            p.nombre AS pac_nombre, p.ape_pat AS pac_apellido,
            o.nombre AS odo_nombre, o.ape_pat AS odo_apellido
       FROM citas c
       JOIN clinica_servicio cs ON cs.idclinica_servicio = c.idclinica_servicio
       JOIN pacientes p  ON p.idpaciente = c.idpaciente
       JOIN odontologos o ON o.idodontologo = c.idodontologo
      WHERE cs.idclinica = $1
        AND c.fecha = ${HOY}
        AND c.estado IN ('EN_SALA', 'EN_CONSULTA')
      ORDER BY c.hora, c.idcita`,
    [idClinica]
  );

  // Una fila por odontólogo: quién está adentro y quién sigue
  const porDoctor = new Map();
  for (const r of rows) {
    if (!porDoctor.has(r.idodontologo)) {
      porDoctor.set(r.idodontologo, {
        idodontologo: r.idodontologo,
        nombre: `${r.odo_nombre} ${r.odo_apellido}`.trim(),
        actual: null,
        siguiente: null,
      });
    }
    const d = porDoctor.get(r.idodontologo);
    const paciente = abreviar(r.pac_nombre, r.pac_apellido);

    if (r.estado === 'EN_CONSULTA') {
      d.actual = {
        paciente,
        aviso5min: r.aviso_5min,
        llamadoEn: r.inicio_consulta ? new Date(r.inicio_consulta).getTime() : null,
      };
    } else if (!d.siguiente) {
      d.siguiente = { paciente }; // el primero EN_SALA por hora
    }
  }

  // después
  let clinica = null;
  try {
    const { rows: cl } = await conexion.query(
      'SELECT nombre FROM clinicas WHERE idclinica = $1', // AJUSTA tabla/columnas si difieren
      [idClinica]
    );
    clinica = cl[0]?.nombre ?? null;
  } catch (e) {
    console.error('No se pudo leer el nombre de la clínica:', e.message);
  }

  return { ahora: Date.now(), clinica, doctores: [...porDoctor.values()] };
}

// Recalcula el estado de la clínica de una cita y lo empuja a las pantallas
export async function emitirPorCita(idCita) {
  const { rows } = await conexion.query(
    `SELECT cs.idclinica
       FROM citas c JOIN clinica_servicio cs USING (idclinica_servicio)
      WHERE c.idcita = $1`,
    [idCita]
  );
  if (!rows[0]) return null;
  const estado = await estadoSala(rows[0].idclinica);
  emitir(rows[0].idclinica, estado);
  return estado;
}

// ---------- Quién es el odontólogo del usuario logueado ----------
// AJUSTA: asumo odontologos.idusuario
export async function idOdontologoDeUsuario(idUsuario) {
  const { rows } = await conexion.query(
    'SELECT idodontologo FROM odontologos WHERE idusuario = $1',
    [idUsuario]
  );
  if (!rows[0]) throw new ErrorSala('Tu usuario no está ligado a un odontólogo', 403);
  return rows[0].idodontologo;
}

// ---------- Acciones ----------

// 1. Recepción: el paciente llegó
export async function marcarLlegada(idCita) {
  const { rowCount } = await conexion.query(
    `UPDATE citas SET estado = 'EN_SALA', hora_llegada = now()
      WHERE idcita = $1
        AND estado IN ('PENDIENTE', 'CONFIRMADA')
        AND fecha = ${HOY}`,
    [idCita]
  );
  if (!rowCount) {
    throw new ErrorSala('La cita no es de hoy o ya no está pendiente/confirmada', 409);
  }
  return emitirPorCita(idCita);
}

// 2. Doctor: "Faltan 5 min" (se guarda en la cita que está en consulta)
export async function faltan5(idOdontologo) {
  const { rows } = await conexion.query(
    `UPDATE citas SET aviso_5min = true
      WHERE idodontologo = $1 AND estado = 'EN_CONSULTA'
      RETURNING idcita`,
    [idOdontologo]
  );
  if (!rows[0]) throw new ErrorSala('No tienes ningún paciente en consulta', 409);
  return emitirPorCita(rows[0].idcita);
}

// Pasa al primer EN_SALA (por hora) a EN_CONSULTA. Devuelve la cita o null.
async function llamarSiguienteTx(client, idOdontologo) {
  const { rows } = await client.query(
    `UPDATE citas SET estado = 'EN_CONSULTA', inicio_consulta = now()
      WHERE idcita = (
        SELECT idcita FROM citas
         WHERE idodontologo = $1 AND estado = 'EN_SALA' AND fecha = ${HOY}
         ORDER BY hora, idcita
         LIMIT 1
         FOR UPDATE SKIP LOCKED)
      RETURNING idcita`,
    [idOdontologo]
  );
  return rows[0] ?? null;
}

async function enTransaccion(fn) {
  const client = await conexion.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// 3. Doctor: "Terminé" -> cierra la actual y llama al siguiente
export async function terminar(idOdontologo) {
  const idRef = await enTransaccion(async (client) => {
    const fin = await client.query(
      `UPDATE citas SET estado = 'ATENDIDA', fin_consulta = now()
        WHERE idodontologo = $1 AND estado = 'EN_CONSULTA'
        RETURNING idcita`,
      [idOdontologo]
    );
    const sig = await llamarSiguienteTx(client, idOdontologo);
    if (!fin.rows[0] && !sig) {
      throw new ErrorSala('No hay consulta que terminar ni pacientes en espera', 409);
    }
    return (sig ?? fin.rows[0]).idcita;
  });
  return emitirPorCita(idRef);
}

// 4. Doctor: "Llamar siguiente" (primer paciente del día o tras una pausa)
export async function llamarSiguiente(idOdontologo) {
  const idRef = await enTransaccion(async (client) => {
    const ocupado = await client.query(
      `SELECT 1 FROM citas WHERE idodontologo = $1 AND estado = 'EN_CONSULTA'`,
      [idOdontologo]
    );
    if (ocupado.rowCount) throw new ErrorSala('Ya hay un paciente en consulta', 409);
    const sig = await llamarSiguienteTx(client, idOdontologo);
    if (!sig) throw new ErrorSala('No hay pacientes en sala de espera', 404);
    return sig.idcita;
  });
  return emitirPorCita(idRef);
}