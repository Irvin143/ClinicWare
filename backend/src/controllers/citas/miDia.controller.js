import { obtenerMiDia } from '../../services/citas/miDiaServices.js';
import { alcancePersonal } from './misCItas.controller.js';

// Errores con .status (los que lanza errorHttp) se devuelven tal cual;
// cualquier otro es inesperado: se registra y se responde genérico.
function responderError(res, error, contexto) {
    if (res.headersSent) return;
    if (error?.status) {
        return res.status(error.status).json({ error: error.message });
    }
    console.error(`[${contexto}]`, error);
    res.status(500).json({ error: 'Error interno. Intenta de nuevo.' });
}

// GET /citas/mi-dia
export const miDia = async (req, res) => {
    try {
        const alcance = await alcancePersonal(req.usuario);
        if (alcance.idOdontologo == null) {
            return res.status(403).json({ error: 'Esta vista es solo para odontólogos' });
        }
        res.json(await obtenerMiDia({ idOdontologo: alcance.idOdontologo }));
    } catch (error) {
        responderError(res, error, 'miDia');
    }
};