import { Link } from 'react-router';
import { formatMonth } from '../format.js';
import { ACCOUNT_TYPE_LABEL, LIABILITY_TYPE_LABEL } from '../i18n.js';
import { useAccounts, useGoals, useLiabilities, useSummary } from '../queries.js';
import { Amount, Card, Empty, ErrorText, Loading, PageHeader, Stat } from '../ui.js';

export function DashboardPage() {
  const summary = useSummary();
  const accounts = useAccounts();
  const liabilities = useLiabilities();
  const goals = useGoals();

  if (summary.isPending) return <Loading />;
  if (summary.error) return <ErrorText error={summary.error} />;
  const s = summary.data;
  const largest = Math.max(1, ...s.months.flatMap((m) => [m.incomeMinor, m.expenseMinor]));

  return (
    <>
      <PageHeader title="Resumen">
        <Link
          to="/movimientos"
          className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Registrar movimiento
        </Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Stat
            label="Patrimonio neto"
            minor={s.netWorthMinor}
            tone={s.netWorthMinor >= 0 ? 'good' : 'bad'}
          />
        </Card>
        <Card>
          <Stat label="Activos" minor={s.assetsMinor} />
        </Card>
        <Card>
          <Stat label="Deudas" minor={s.debtsMinor} tone={s.debtsMinor > 0 ? 'bad' : 'neutral'} />
        </Card>
        <Card>
          <Stat label="Fondo de emergencia" minor={s.emergencyFundMinor} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ingresos y gastos por mes">
          {s.months.length === 0 ? (
            <Empty>Aún no hay ingresos ni gastos.</Empty>
          ) : (
            <ul className="flex flex-col gap-4">
              {[...s.months].reverse().map((m) => (
                <li key={m.month}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium capitalize">{formatMonth(m.month)}</span>
                    <span className="text-stone-500">
                      Balance <Amount minor={m.incomeMinor - m.expenseMinor} />
                    </span>
                  </div>
                  <Bar
                    label="Ingresos"
                    minor={m.incomeMinor}
                    max={largest}
                    color="bg-emerald-600"
                  />
                  <Bar label="Gastos" minor={m.expenseMinor} max={largest} color="bg-rose-500" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Cuentas">
            {accounts.data?.length ? (
              <ul className="divide-y divide-stone-100">
                {accounts.data.map((a) => (
                  <li key={a.id} className="flex justify-between py-2 text-sm">
                    <span>
                      {a.name}{' '}
                      <span className="text-stone-400">· {ACCOUNT_TYPE_LABEL[a.type]}</span>
                    </span>
                    <Amount minor={a.balanceMinor} className="font-medium" />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Crea tu primera cuenta en «Cuentas».</Empty>
            )}
          </Card>

          <Card title="Deudas">
            {liabilities.data?.length ? (
              <ul className="divide-y divide-stone-100">
                {liabilities.data.map((l) => (
                  <li key={l.id} className="py-2 text-sm">
                    <div className="flex justify-between">
                      <span>
                        {l.name}{' '}
                        <span className="text-stone-400">· {LIABILITY_TYPE_LABEL[l.type]}</span>
                      </span>
                      <Amount minor={l.balanceMinor} className="font-medium" />
                    </div>
                    <Progress
                      value={l.openingBalanceMinor - l.balanceMinor}
                      max={l.openingBalanceMinor}
                      label="pagado"
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Sin deudas registradas.</Empty>
            )}
          </Card>

          <Card title="Metas">
            {goals.data?.length ? (
              <ul className="divide-y divide-stone-100">
                {goals.data.map((g) => (
                  <li key={g.id} className="py-2 text-sm">
                    <div className="flex justify-between">
                      <span>{g.name}</span>
                      <span className="text-stone-500">
                        <Amount minor={g.progressMinor} /> de <Amount minor={g.targetMinor} />
                      </span>
                    </div>
                    <Progress value={g.progressMinor} max={g.targetMinor} label="ahorrado" />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Sin metas todavía.</Empty>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Bar({
  label,
  minor,
  max,
  color,
}: {
  label: string;
  minor: number;
  max: number;
  color: string;
}) {
  const width = `${String(Math.max(0, Math.min(100, (minor / max) * 100)))}%`;
  return (
    <div className="mb-1 flex items-center gap-2 text-xs">
      <span className="w-16 text-stone-500">{label}</span>
      <div className="h-2.5 flex-1 rounded-full bg-stone-100">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width }} />
      </div>
      <Amount minor={minor} className="w-32 text-right" />
    </div>
  );
}

function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="mt-1.5 flex items-center gap-2 text-xs text-stone-500">
      <div className="h-1.5 flex-1 rounded-full bg-stone-100">
        <div
          className="h-1.5 rounded-full bg-emerald-600"
          style={{ width: `${String(percent)}%` }}
        />
      </div>
      <span className="w-24 text-right">
        {Math.floor(percent)} % {label}
      </span>
    </div>
  );
}
