import { Router } from 'express';
import * as c from '../../controllers/notificaciones/sala.controller.js'; 
import { exigirSesion } from '../../middleware/auth.js';

const router = Router();


router.get('/:idClinica/eventos', c.eventosSala); // TV: se protege con ?key=

router.use(exigirSesion); // cualquier usuario con sesión válida

router.post('/pantalla-token',  c.crearTokenPantalla);
router.post('/consulta/faltan-5',  c.faltan5);
router.post('/consulta/terminar',  c.terminar);
router.post('/consulta/llamar-siguiente', c.llamarSiguiente);
router.get('/mis-clinicas', c.misClinicas);

export default router;

// En tu app.js:  app.use('/api/sala', salaRoutes);