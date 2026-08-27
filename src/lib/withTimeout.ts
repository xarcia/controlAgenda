/** Si `promise` no resuelve (ni falla) dentro de `ms`, se resuelve con `fallback` en su
 *  lugar — para que la app nunca se quede cargando para siempre si Supabase no responde
 *  (red caída, DNS, lo que sea). El request original sigue en curso, solo dejamos de
 *  esperarlo. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(fallback); }
    );
  });
}
