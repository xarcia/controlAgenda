import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Estas dos variables vienen del entorno (.env / variables de Vercel), no están
// escritas en el código — así se pueden cambiar sin volver a construir el proyecto
// entero cada vez, y no quedan expuestas en el repositorio de git.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseClient: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
          // fetch envuelto para evitar que el navegador sirva una respuesta cacheada
          // en vez de ir a buscar los datos frescos. IMPORTANTE: hay que enlazarlo a
          // window (.bind) y pasar los argumentos tal como vienen — escribirlo como
          // (url, options) => fetch(...) pierde el contexto del navegador y hace que
          // las peticiones fallen, que es justo lo que rompía el guardado.
          fetch: (...args: Parameters<typeof fetch>) => {
            const [input, init] = args;
            return window.fetch(input, { ...(init || {}), cache: 'no-store' });
          },
        },
      })
    : null;

if (!supabaseClient) {
  // eslint-disable-next-line no-console
  console.warn('Supabase no está configurado — faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el .env');
}