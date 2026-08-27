import { useState, type FormEvent } from 'react';

interface Props {
  onSubmit: (code: string) => boolean;
}

export function AuthGate({ onSubmit }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = onSubmit(code.trim());
    if (!ok) {
      setError(true);
      setCode('');
    }
  }

  return (
    <div className="auth-gate">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img className="auth-logo" src="/logo-adelca.png" alt="ADELCA" />
        <div className="auth-title">Centro de Control · Capacitaciones SAP</div>
        <div className="auth-sub">Ingresa tu código de acceso para continuar</div>
        <input
          className="input auth-input"
          type="password"
          placeholder="Código de acceso"
          autoComplete="off"
          autoFocus
          value={code}
          onChange={e => { setCode(e.target.value); setError(false); }}
        />
        {error && <div className="auth-error">Código incorrecto. Intenta de nuevo.</div>}
        <button type="submit" className="btn btn-amber auth-submit">Entrar</button>
      </form>
    </div>
  );
}