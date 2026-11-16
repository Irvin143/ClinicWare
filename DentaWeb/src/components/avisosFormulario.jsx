export function AvisoCampo({ mensaje }) {
  if (!mensaje) return null;
  return <p className="mt-1 text-xs text-red-600 dark:text-error">{mensaje}</p>;
}

export function AvisoGeneral({ mensaje }) {
  if (!mensaje) return null;
  return (
    <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 md:rounded-xl md:p-3 md:text-sm dark:bg-error-container dark:text-error" role="alert">
      {mensaje}
    </p>
  );
}

/**
 * Map a backend error message to a specific form field.
 * Returns { campo, mensaje } or null if it cannot be mapped.
 */
export function mapearErrorBackend(mensaje) {
  if (!mensaje || typeof mensaje !== 'string') return null;
  const m = mensaje.toLowerCase();
  if (m.includes('correo') || m.includes('email')) return { campo: 'correo', mensaje };
  if (m.includes('teléfono') || m.includes('telefono')) return { campo: 'telefono', mensaje };
  if (m.includes('contraseña') || m.includes('password') || m.includes('clave')) return { campo: 'contrasena', mensaje };
  if (m.includes('cédula') || m.includes('cedula')) return { campo: 'cedula', mensaje };
  if (m.includes('identificación fiscal') || m.includes('rfc')) return { campo: 'identificacion_fiscal', mensaje };
  if (m.includes('nombre')) return { campo: 'nombre', mensaje };
  return null;
}

export function scrollAlPrimerCampo(raiz, errores) {
  const campo = Object.keys(errores ?? {})[0];
  if (!campo || !raiz) return;
  const elemento = raiz.querySelector(`[data-campo="${campo}"]`);
  if (elemento) {
    const foco = elemento.querySelector('input, select, textarea, button');
    if (foco) foco.focus();
    elemento.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
