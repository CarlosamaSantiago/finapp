import type { Session, SetupRequest } from '@finapp/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent, type ReactNode } from 'react';
import { api, setCsrfToken } from '../api.js';
import { keys } from '../queries.js';
import { Button, ErrorText, Field, inputClass } from '../ui.js';

function Shell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="mb-1 text-sm font-semibold text-emerald-700">Finanzas</div>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mb-6 text-sm text-stone-600">{intro}</div>
        {children}
      </div>
    </main>
  );
}

function useStartSession(path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: object) => api.post<Session>(path, body),
    onSuccess: (session) => {
      setCsrfToken(session.csrfToken);
      client.setQueryData(keys.session, session);
    },
  });
}

export function SetupPage() {
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [seedDemoData, setSeedDemoData] = useState(true);
  const setup = useStartSession('/session/setup');
  const tooShort = passphrase.length > 0 && passphrase.length < 12;
  const mismatch = repeat.length > 0 && repeat !== passphrase;

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    if (passphrase.length >= 12 && passphrase === repeat) {
      setup.mutate({ passphrase, seedDemoData } satisfies SetupRequest);
    }
  };

  return (
    <Shell
      title="Crea tu frase de acceso"
      intro={
        <>
          Tus datos se guardan cifrados en este computador. La frase de acceso es la llave:{' '}
          <strong>si la pierdes, no hay forma de recuperar la información.</strong>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Frase de acceso"
          hint="Al menos 12 caracteres. Varias palabras son más fáciles de recordar."
        >
          {(id) => (
            <input
              id={id}
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Repite la frase">
          {(id) => (
            <input
              id={id}
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={repeat}
              onChange={(e) => {
                setRepeat(e.target.value);
              }}
            />
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={seedDemoData}
            onChange={(e) => {
              setSeedDemoData(e.target.checked);
            }}
          />
          Cargar datos de ejemplo para explorar la aplicación
        </label>
        {tooShort && (
          <p className="text-sm text-rose-700">La frase debe tener al menos 12 caracteres.</p>
        )}
        {mismatch && <p className="text-sm text-rose-700">Las frases no coinciden.</p>}
        <ErrorText error={setup.error} />
        <Button
          type="submit"
          disabled={setup.isPending || passphrase.length < 12 || passphrase !== repeat}
        >
          {setup.isPending ? 'Cifrando…' : 'Crear y entrar'}
        </Button>
      </form>
    </Shell>
  );
}

export function LoginPage() {
  const [passphrase, setPassphrase] = useState('');
  const login = useStartSession('/session/login');
  return (
    <Shell title="Ingresar" intro="Escribe tu frase de acceso para descifrar tus datos.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (passphrase) login.mutate({ passphrase });
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Frase de acceso">
          {(id) => (
            <input
              id={id}
              type="password"
              autoComplete="current-password"
              autoFocus
              className={inputClass}
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
              }}
            />
          )}
        </Field>
        <ErrorText error={login.error} />
        <Button type="submit" disabled={login.isPending || !passphrase}>
          {login.isPending ? 'Descifrando…' : 'Ingresar'}
        </Button>
      </form>
    </Shell>
  );
}
