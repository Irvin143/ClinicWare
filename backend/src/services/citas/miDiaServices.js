import conexion from '../../services/conexion.js';


const ZONA = 'America/Mazatlan';

export const obtenerMiDia = async ({ idOdontologo }) => {
    const { rows } = await conexion.query(
        `SELECT c.idCita AS id_cita,
                to_char(c.fecha, 'YYYY-MM-DD') AS fecha,
                to_char(c.hora, 'HH24:MI') AS hora,
                to_char(c.hora_fin, 'HH24:MI') AS hora_fin,
                upper(c.estado) AS estado,
                c.observaciones,
                c.hora_llegada, c.inicio_consulta, c.fin_consulta, c.aviso_5min,
                CONCAT_WS(' ', p.nombre, p.ape_pat, p.ape_mat) AS paciente,
                s.nombre AS servicio
         FROM citas c
         JOIN pacientes p         ON p.idPaciente = c.idPaciente
         JOIN clinica_servicio cs ON cs.idClinica_Servicio = c.idClinica_Servicio
         JOIN servicios s         ON s.idServicio = cs.idServicio
         WHERE c.idOdontologo = $1::int
           AND c.fecha = (now() AT TIME ZONE '${ZONA}')::date
           AND upper(c.estado) <> 'CANCELADA'
         ORDER BY CASE upper(c.estado)
                    WHEN 'EN_CONSULTA' THEN 0
                    WHEN 'EN_SALA' THEN 1
                    WHEN 'CONFIRMADA' THEN 2
                    WHEN 'PENDIENTE' THEN 2
                    ELSE 3 END,
                  c.hora_llegada NULLS LAST, c.hora`,
        [idOdontologo]
    );
    return rows;
};

// El odontólogo avisa que le faltan 5 minutos (solo informativo)
export const avisarCincoMin = async ({ idCita, idOdontologo }) => {
    const { rows } = await conexion.query(
        `UPDATE citas SET aviso_5min = true
         WHERE idCita = $1::int
           AND idOdontologo = $2::int
           AND upper(estado) = 'EN_CONSULTA'
         RETURNING idCita AS id_cita, aviso_5min`,
        [idCita, idOdontologo]
    );
    if (!rows[0]) throw errorHttp(409, 'Solo puedes avisar en una cita que está en consulta.');
    return rows[0];
};