import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router';
import { api, setCsrfToken, setUnauthenticatedHandler } from './api.js';
import { DashboardPage } from './pages/dashboard.js';
import { EntriesPage } from './pages/entries.js';
import { AccountsPage, CategoriesPage, DebtsPage, GoalsPage } from './pages/master-data.js';
import { LoginPage, SetupPage } from './pages/session.js';
import { keys, useSession } from './queries.js';
import { ErrorText, Loading } from './ui.js';

const NAV = [
  ['/', 'Resumen'],
  ['/movimientos', 'Movimientos'],
  ['/cuentas', 'Cuentas'],
  ['/deudas', 'Deudas'],
  ['/metas', 'Metas'],
  ['/categorias', 'Categorías'],
] as const;

export function App() {
  const session = useSession();
  const client = useQueryClient();

  useEffect(() => {
    // Any 401 (logout elsewhere, idle timeout) sends the user back to the login screen.
    setUnauthenticatedHandler(() => {
      setCsrfToken(undefined);
      client.clear();
      void client.invalidateQueries({ queryKey: keys.session });
    });
  }, [client]);

  if (session.isPending) return <Loading />;
  if (session.error) {
    return (
      <main className="mx-auto max-w-md p-8">
        <ErrorText error={session.error} />
      </main>
    );
  }
  if (session.data.state === 'uninitialized') return <SetupPage />;
  if (session.data.state === 'locked' || !session.data.csrfToken) return <LoginPage />;

  return (
    <BrowserRouter>
      <div className="min-h-screen md:flex">
        <Sidebar />
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/movimientos" element={<EntriesPage />} />
            <Route path="/cuentas" element={<AccountsPage />} />
            <Route path="/deudas" element={<DebtsPage />} />
            <Route path="/metas" element={<GoalsPage />} />
            <Route path="/categorias" element={<CategoriesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function Sidebar() {
  const client = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api.post('/session/logout'),
    onSettled: () => {
      setCsrfToken(undefined);
      client.clear();
      void client.invalidateQueries({ queryKey: keys.session });
    },
  });

  return (
    <aside className="border-b border-stone-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-56 md:flex-col md:border-r md:border-b-0">
      <div className="flex items-center justify-between px-4 py-4 md:block md:px-5 md:py-6">
        <div className="text-lg font-semibold tracking-tight text-emerald-800">Finanzas</div>
        <button
          type="button"
          onClick={() => {
            logout.mutate();
          }}
          className="text-sm text-stone-500 hover:text-stone-900 md:hidden"
        >
          Salir
        </button>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:px-3 md:pb-0">
        {NAV.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                isActive ? 'bg-emerald-50 text-emerald-800' : 'text-stone-600 hover:bg-stone-100'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="hidden p-3 md:block">
        <button
          type="button"
          onClick={() => {
            logout.mutate();
          }}
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-900"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
