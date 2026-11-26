import conexion from '../conexion.js';

const ZONA = 'America/Mazatlan';

// Estados que solo se pueden aplicar cuando ya pasó la hora de la cita
const ESTADOS_SOLO_DESPUES_DE_LA_CITA = ['ATENDIDA', 'NO_ASISTIO'];

const errorHttp = (status, mensaje) => {
    const error = new Error(mensaje);
    error.status = status;
    return error;
};

// Condición SQL para un odontólogo que consulta su agenda: únicamente sus propias citas.
// Agrega los parámetros que necesita a `params`. Requiere el alias c (citas).
function condicionOdontologo(params, idOdontologo) {
    params.push(idOdontologo);
    return `c.idOdontologo = $${params.length}::int`;
}

export async function idOdontologoDeUsuario(idUsuario) {
    const { rows } = await conexion.query(
        `SELECT o.idOdontologo AS id
         FROM odontologos o
         WHERE o.idUsuario = $1::int
         LIMIT 1`,
        [idUsuario]
    );
    return rows[0]?.id ?? null;
}

export async function idsClinicaDeUsuario(idUsuario) {
    const { rows } = await conexion.query(
        `SELECT c.idClinica AS id
         FROM clinicas c
         WHERE c.idUsuario = $1::int`,
        [idUsuario]
    );
    return rows.map((fila) => fila.id);
}

export async function listarCitasPersonal({
    desde,
    hasta,
    incluirCanceladas = false,
    idOdontologo = null,
    idsClinica = null,
} = {}) {
    const params = [desde, hasta];
    const where = ['c.fecha BETWEEN $1::date AND $2::date'];

    if (!incluirCanceladas) {
        where.push(`LOWER(c.estado) IS DISTINCT FROM 'cancelada'`);
    }

    if (idOdontologo != null) {
        where.push(condicionOdontologo(params, idOdontologo));
    }

    if (Array.isArray(idsClinica)) {
        params.push(idsClinica);
        where.push(`cl.idClinica = ANY($${params.length}::int[])`);
    }

    const { rows } = await conexion.query(
        `SELECT
            c.idCita AS id_cita,
            to_char(c.fecha, 'YYYY-MM-DD') AS fecha,
            to_char(c.hora, 'HH24:MI') AS hora,
            to_char(c.hora_fin, 'HH24:MI') AS hora_fin,
            c.estado,
            c.observaciones,
            json_build_object(
                'nombre', p.nombre,
                'ape_pat', p.ape_pat,
                'ape_mat', p.ape_mat
            ) AS paciente,
            json_build_object(
                'id_odontologo', o.idOdontologo,
                'nombre', o.nombre,
                'ape_pat', o.ape_pat
            ) AS odontologo,
            json_build_object(
                'id_clinica', cl.idClinica,
                'nombre', cl.nombre
            ) AS clinica,
            s.nombre AS servicio,
            t.nombre AS tipo
         FROM citas c
         JOIN pacientes p ON p.idPaciente = c.idPaciente
         JOIN odontologos o ON o.idOdontologo = c.idOdontologo
         JOIN clinica_servicio cs ON cs.idClinica_Servicio = c.idClinica_Servicio
         JOIN clinicas cl ON cl.idClinica = cs.idClinica
         LEFT JOIN servicios s ON s.idServicio = cs.idServicio
         LEFT JOIN tipo_cita t ON t.idTipo = c.idTipo
         WHERE ${where.join(' AND ')}
         ORDER BY c.fecha, c.hora, c.idCita`,
        params
    );

    return rows;
}

const ESTADOS_DE_LLEGADA = ['EN_SALA', 'EN_CONSULTA'];

export async function cambiarEstadoCita({
    idCita,
    estado,
    idOdontologo = null,
    idsClinica = null,
}) {
    const params = [idCita, MINUTOS_ANTICIPACION];
    const where = ['c.idCita = $1::int'];

    if (idOdontologo != null) {
        where.push(condicionOdontologo(params, idOdontologo));
    }
    if (Array.isArray(idsClinica)) {
        params.push(idsClinica);
        where.push(`cl.idClinica = ANY($${params.length}::int[])`);
    }

    const { rows } = await conexion.query(
        `SELECT c.idCita AS id,
                upper(c.estado) AS estado_actual,
                (c.fecha + c.hora) > (now() AT TIME ZONE '${ZONA}') AS futura,
                (c.fecha + c.hora) > (now() AT TIME ZONE '${ZONA}') + make_interval(mins => $2::int) AS muy_temprano
         FROM citas c
         JOIN clinica_servicio cs ON cs.idClinica_Servicio = c.idClinica_Servicio
         JOIN clinicas cl ON cl.idClinica = cs.idClinica
         WHERE ${where.join(' AND ')}
         LIMIT 1`,
        params
    );
    const cita = rows[0];
    if (!cita) throw errorHttp(404, 'No encontramos esa cita');

    // Regla: no se puede poner en sala ni en consulta con más de 2 horas de anticipación
    if (ESTADOS_DE_LLEGADA.includes(estado) && cita.muy_temprano) {
        throw errorHttp(409, 'Solo se puede marcar la llegada hasta 2 horas antes de la cita.');
    }

    // Regla: a "En consulta" solo se llega desde "En sala"
    if (estado === 'EN_CONSULTA' && cita.estado_actual !== 'EN_SALA') {
        throw errorHttp(409, 'Para pasar a consulta, el paciente primero debe estar en sala.');
    }

    if(cita.estado_actual === estado) {
        throw errorHttp(409, 'La cita ya está en el estado deseado.');
    }

    if(cita.estado_actual === 'CANCELADA') {
        throw errorHttp(409, 'No se puede cambiar el estado de una cita cancelada.');
    }

    if(cita.estado_actual === 'ATENDIDA' || cita.estado_actual === 'NO_ASISTIO') {
        throw errorHttp(409, 'No se puede cambiar el estado de una cita que ya fue atendida o marcada como no asistió.');
    }

    if (estado === 'EN_CONSULTA') {
        const { rows: ocupado } = await conexion.query(
            `SELECT 1 FROM citas
            WHERE idOdontologo = (SELECT idOdontologo FROM citas WHERE idCita = $1::int)
            AND upper(estado) = 'EN_CONSULTA' AND idCita <> $1::int
            LIMIT 1`,
            [idCita]
        );
        if (ocupado[0]) {
            throw errorHttp(409, 'Ya tienes un paciente en consulta. Termínala antes de iniciar otra.');
        }
    }

    // Atendida / no asistió: solo si la cita ya ocurrió o el paciente ya estaba en sala o en consulta
    const yaEstabaAdentro = ESTADOS_DE_LLEGADA.includes(cita.estado_actual);
    if (ESTADOS_SOLO_DESPUES_DE_LA_CITA.includes(estado) && cita.futura && !yaEstabaAdentro) {
        const nombre = estado === 'ATENDIDA' ? 'atendida' : 'no asistió';
        throw errorHttp(409, `No se puede marcar como ${nombre} una cita que todavía no ocurre.`);
    }

    const { rows: actualizadas } = await conexion.query(
    `UPDATE citas
     SET estado = $2::varchar,
         hora_llegada = CASE
             WHEN $2::text = 'EN_SALA' THEN now()
             WHEN $2::text IN ('PENDIENTE', 'CONFIRMADA') THEN NULL
             ELSE hora_llegada END,
         inicio_consulta = CASE
             WHEN $2::text = 'EN_CONSULTA' THEN now()
             WHEN $2::text IN ('PENDIENTE', 'CONFIRMADA', 'EN_SALA') THEN NULL
             ELSE inicio_consulta END,
         fin_consulta = CASE
             WHEN $2::text = 'ATENDIDA' AND inicio_consulta IS NOT NULL THEN now()
             WHEN $2::text IN ('PENDIENTE', 'CONFIRMADA', 'EN_SALA', 'EN_CONSULTA') THEN NULL
             ELSE fin_consulta END,
         aviso_5min = CASE
             WHEN $2::text IN ('PENDIENTE', 'CONFIRMADA', 'EN_SALA') THEN false
             ELSE aviso_5min END
     WHERE idCita = $1::int
       AND upper(estado) = $3
     RETURNING idCita AS id, estado`,
    [idCita, estado, cita.estado_actual]
    );
    return actualizadas[0];
}
/* ============================================================
   REAGENDAR (PERSONAL)
   ============================================================ */

// Mueve una cita a otra fecha y hora, en la misma sede y con el mismo odontólogo, respetando
// el alcance de quien la pide (admin: todas · odontólogo: las suyas · clínica: las de sus sedes).
// Misma lógica que reagendarCita del paciente, pero sin exigir que la cita sea del usuario.
// Se mantiene la duración original (hora_fin - hora). Las urgencias no se reagendan.
// fecha: 'AAAA-MM-DD' · hora: 'HH:mm'
export async function reagendarCitaPersonal({
    idCita,
    fecha,
    hora,
    idOdontologo = null,
    idsClinica = null,
}) {
    const params = [idCita, fecha, hora];
    const alcance = [];

    if (idOdontologo != null) {
        alcance.push(condicionOdontologo(params, idOdontologo));
    }
    if (Array.isArray(idsClinica)) {
        params.push(idsClinica);
        alcance.push(`cs.idClinica = ANY($${params.length}::int[])`);
    }
    const filtroAlcance = alcance.length ? `AND ${alcance.join(' AND ')}` : '';

    let rows;
    try {
        ({ rows } = await conexion.query(
            `UPDATE citas c
             SET fecha    = $2::date,
                 hora     = $3::time,
                 hora_fin = $3::time + (c.hora_fin - c.hora)
             FROM clinica_servicio cs
             WHERE c.idCita = $1::int
               AND cs.idClinica_Servicio = c.idClinica_Servicio
               ${filtroAlcance}
               AND lower(c.estado) IN ('pendiente', 'confirmada')
               AND (c.fecha + c.hora) > (now() AT TIME ZONE '${ZONA}')
               AND ($2::date + $3::time) > (now() AT TIME ZONE '${ZONA}')
               AND NOT EXISTS (
                     SELECT 1 FROM tipo_cita t
                     WHERE t.idTipo = c.idTipo AND lower(t.nombre) IN ('urgencia', 'urgencias')
               )
               AND EXISTS (
                     SELECT 1
                     FROM fn_slots_disponibles(cs.idClinica, $2::date) f
                     WHERE f.hora = $3::time AND f.idodontologo = c.idOdontologo
               )
               AND NOT EXISTS (
                     SELECT 1
                     FROM citas o
                     WHERE o.idOdontologo = c.idOdontologo
                       AND o.idCita <> c.idCita
                       AND lower(o.estado) <> 'cancelada'
                       AND o.fecha = $2::date
                       AND o.hora < ($3::time + (c.hora_fin - c.hora))
                       AND o.hora_fin > $3::time
               )
               AND NOT EXISTS (
                     SELECT 1
                     FROM citas o
                     WHERE o.idPaciente = c.idPaciente
                       AND o.idCita <> c.idCita
                       AND lower(o.estado) <> 'cancelada'
                       AND o.fecha = $2::date
                       AND o.hora < ($3::time + (c.hora_fin - c.hora))
                       AND o.hora_fin > $3::time
               )
             RETURNING c.idCita AS id,
                       to_char(c.fecha, 'YYYY-MM-DD') AS fecha,
                       to_char(c.hora, 'HH24:MI')     AS hora,
                       to_char(c.hora_fin, 'HH24:MI') AS hora_fin,
                       c.estado AS estado`,
            params
        ));
    } catch (err) {
        // Alguien tomó el horario justo ahora (la restricción de la tabla lo rechazó)
        if (err.code === '23P01') {
            if (String(err.constraint ?? '').includes('paciente')) {
                throw errorHttp(409, 'El paciente ya tiene otra cita en ese horario. Elige otro.');
            }
            throw errorHttp(409, 'Ese horario ya no está disponible. Elige otro.');
        }
        // fecha u hora con formato inválido
        if (['22007', '22008', '22P02'].includes(err.code)) {
            throw errorHttp(400, 'La fecha o la hora no son válidas');
        }
        throw err;
    }

    if (rows[0]) return rows[0];

    // No se actualizó nada: se averigua por qué para dar el mensaje correcto
    const { rows: existente } = await conexion.query(
        `SELECT lower(c.estado) AS estado,
                (c.fecha + c.hora) <= (now() AT TIME ZONE '${ZONA}') AS ya_paso,
                ($2::date + $3::time) <= (now() AT TIME ZONE '${ZONA}') AS nueva_pasada,
                EXISTS (
                    SELECT 1 FROM tipo_cita t
                    WHERE t.idTipo = c.idTipo AND lower(t.nombre) IN ('urgencia', 'urgencias')
                ) AS es_urgencia,
                EXISTS (
                    SELECT 1
                    FROM citas o
                    WHERE o.idPaciente = c.idPaciente
                      AND o.idCita <> c.idCita
                      AND lower(o.estado) <> 'cancelada'
                      AND o.fecha = $2::date
                      AND o.hora < ($3::time + (c.hora_fin - c.hora))
                      AND o.hora_fin > $3::time
                ) AS choque_paciente
         FROM citas c
         JOIN clinica_servicio cs ON cs.idClinica_Servicio = c.idClinica_Servicio
         WHERE c.idCita = $1::int
           ${filtroAlcance}`,
        params
    );
    const cita = existente[0];
    if (!cita) throw errorHttp(404, 'No encontramos esa cita');
    if (!['pendiente', 'confirmada'].includes(cita.estado)) {
        throw errorHttp(
            409,
            `Esta cita ya está ${cita.estado}, solo se pueden reagendar las pendientes o confirmadas`
        );
    }
    if (cita.ya_paso) throw errorHttp(409, 'Esta cita ya pasó y no se puede reagendar');
    if (cita.es_urgencia) {
        throw errorHttp(
            409,
            'Las urgencias no se pueden reagendar. Cancélala y registra otra con la hora que necesites.'
        );
    }
    if (cita.nueva_pasada) throw errorHttp(400, 'Elige una fecha y hora que todavía no hayan pasado');
    if (cita.choque_paciente) {
        throw errorHttp(409, 'El paciente ya tiene otra cita en ese horario. Elige otro.');
    }
    throw errorHttp(409, 'Ese horario ya no está disponible. Elige otro.');
}

const MINUTOS_ANTICIPACION = 120; // máximo de anticipación para marcar la llegada

export const marcarLlegada = async ({ idCita, enSala, idsClinica = null }) => {
    const desde = enSala ? ['PENDIENTE', 'CONFIRMADA'] : ['EN_SALA'];
    const hacia = enSala ? 'EN_SALA' : 'PENDIENTE';

    const { rows } = await conexion.query(
        `UPDATE citas c
         SET estado = $2,
             hora_llegada = CASE WHEN $5::boolean THEN now() ELSE NULL END
         FROM clinica_servicio cs
         WHERE c.idCita = $1::int
           AND cs.idClinica_Servicio = c.idClinica_Servicio
           AND ($4::int[] IS NULL OR cs.idClinica = ANY($4::int[]))
           AND upper(c.estado) = ANY($3::text[])
           AND c.fecha = (now() AT TIME ZONE '${ZONA}')::date
           AND ($5::boolean = false
                OR (c.fecha + c.hora) <= (now() AT TIME ZONE '${ZONA}') + make_interval(mins => $6::int))
         RETURNING c.idCita AS id_cita, c.estado`,
        [idCita, hacia, desde, idsClinica, enSala, MINUTOS_ANTICIPACION]
    );
    if (rows[0]) return rows[0];

    const { rows: d } = await conexion.query(
        `SELECT cs.idClinica AS id_clinica,
                ((c.fecha + c.hora) > (now() AT TIME ZONE '${ZONA}') + make_interval(mins => $2::int)) AS muy_temprano
         FROM citas c
         JOIN clinica_servicio cs ON cs.idClinica_Servicio = c.idClinica_Servicio
         WHERE c.idCita = $1::int`,
        [idCita, MINUTOS_ANTICIPACION]
    );

    if (!d[0] || (Array.isArray(idsClinica) && !idsClinica.includes(d[0].id_clinica))) {
        throw errorHttp(404, 'La cita no existe');
    }
    if (enSala && d[0].muy_temprano) {
        throw errorHttp(409, 'Solo se puede marcar la llegada hasta 2 horas antes de la cita.');
    }
    throw errorHttp(409, 'No se puede cambiar el estado de esta cita');
};