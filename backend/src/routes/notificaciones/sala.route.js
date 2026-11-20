import { Router } from 'express';
import { exigirAcceso } from '../../middleware/auth.js'; 
import * as c from '../../controllers/notificaciones/sala.controller.js'; 

const router = Router();


router.get('/:idClinica/eventos', c.eventosSala); // TV: se protege con ?key=
router.post('/pantalla-token',  c.crearTokenPantalla);
router.post('/citas/:id/llegada', c.llegada);
router.post('/consulta/faltan-5',  c.faltan5);
router.post('/consulta/terminar',  c.terminar);
router.post('/consulta/llamar-siguiente', c.llamarSiguiente);

export default router;

// En tu app.js:  app.use('/api/sala', salaRoutes);