import {
  ACCOUNT_TYPES,
  LIABILITY_TYPES,
  LIQUIDITY_LEVELS,
  type AccountType,
  type CreateAccount,
  type CreateCategory,
  type CreateGoal,
  type CreateLiability,
  type LiabilityType,
  type Liquidity,
} from '@finapp/contracts';
import { useState, type SubmitEvent, type ReactNode } from 'react';
import { formatDate } from '../format.js';
import { ACCOUNT_TYPE_LABEL, LIABILITY_TYPE_LABEL, LIQUIDITY_LABEL } from '../i18n.js';
import {
  useAccounts,
  useCategories,
  useGoals,
  useLiabilities,
  useRequestId,
  useWrite,
} from '../queries.js';
import {
  Amount,
  Button,
  Card,
  Empty,
  ErrorText,
  Field,
  Loading,
  MoneyInput,
  PageHeader,
  Select,
  inputClass,
} from '../ui.js';

function Layout({ title, list, form }: { title: string; list: ReactNode; form: ReactNode }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>{list}</Card>
        <Card title="Agregar">{form}</Card>
      </div>
    </>
  );
}

function ArchiveButton({ path }: { path: string }) {
  const { requestId } = useRequestId();
  const archive = useWrite<{ requestId: string }>(() => path);
  return (
    <Button
      variant="ghost"
      className="px-2 py-1 text-xs"
      disabled={archive.isPending}
      onClick={() => {
        if (window.confirm('¿Archivar? Dejará de aparecer, pero su historial se conserva.'))
          archive.mutate({ requestId });
      }}
    >
      Archivar
    </Button>
  );
}

/** Submits once per idempotency key and resets the form after a successful save. */
function useCreateForm<T extends { requestId: string }>(path: string) {
  const { requestId, next } = useRequestId();
  const mutation = useWrite<T>(() => path);
  const [resetKey, setResetKey] = useState(0);
  /** Always prevents the browser's own submit (a page reload); `null` means "not valid yet". */
  const submit = (e: SubmitEvent, body: Omit<T, 'requestId'> | null, onDone: () => void) => {
    e.preventDefault();
    if (body === null) return;
    mutation.mutate({ ...body, requestId } as T, {
      onSuccess: () => {
        next();
        onDone();
        setResetKey((k) => k + 1);
      },
    });
  };
  return { mutation, submit, resetKey };
}

// --- accounts ---------------------------------------------------------------------------------

export function AccountsPage() {
  const accounts = useAccounts();
  const { mutation, submit, resetKey } = useCreateForm<CreateAccount & { requestId: string }>(
    '/accounts',
  );
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('savings');
  const [liquidity, setLiquidity] = useState<Liquidity>('immediate');
  const [initial, setInitial] = useState<number | null>(0);
  const [emergency, setEmergency] = useState(false);

  return (
    <Layout
      title="Cuentas"
      list={
        accounts.isPending ? (
          <Loading />
        ) : !accounts.data?.length ? (
          <Empty>Sin cuentas todavía.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {accounts.data.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-stone-500">
                    {ACCOUNT_TYPE_LABEL[a.type]} · Liquidez{' '}
                    {LIQUIDITY_LABEL[a.liquidity].toLowerCase()}
                    {a.emergencyEligible && ' · Fondo de emergencia'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Amount minor={a.balanceMinor} className="font-medium" />
                  <ArchiveButton path={`/accounts/${String(a.id)}/archive`} />
                </div>
              </li>
            ))}
          </ul>
        )
      }
      form={
        <form
          key={resetKey}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            submit(
              e,
              initial === null
                ? null
                : {
                    name,
                    type,
                    liquidity,
                    initialBalanceMinor: initial,
                    emergencyEligible: emergency,
                  },
              () => {
                setName('');
                setInitial(0);
              },
            );
          }}
        >
          <Field label="Nombre">
            {(id) => (
              <input
                id={id}
                className={inputClass}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Tipo">
            {(id) => (
              <Select
                id={id}
                value={type}
                onChange={setType}
                options={ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABEL[t] }))}
              />
            )}
          </Field>
          <Field label="Liquidez">
            {(id) => (
              <Select
                id={id}
                value={liquidity}
                onChange={setLiquidity}
                options={LIQUIDITY_LEVELS.map((l) => ({ value: l, label: LIQUIDITY_LABEL[l] }))}
              />
            )}
          </Field>
          <Field label="Saldo inicial">
            {(id) => <MoneyInput id={id} onChange={setInitial} allowNegative />}
          </Field>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={emergency}
              onChange={(e) => {
                setEmergency(e.target.checked);
              }}
            />
            Cuenta para el fondo de emergencia
          </label>
          <ErrorText error={mutation.error} />
          <Button type="submit" disabled={mutation.isPending || !name.trim() || initial === null}>
            Crear cuenta
          </Button>
        </form>
      }
    />
  );
}

// --- liabilities ------------------------------------------------------------------------------

export function DebtsPage() {
  const liabilities = useLiabilities();
  const { mutation, submit, resetKey } = useCreateForm<CreateLiability>('/liabilities');
  const [name, setName] = useState('');
  const [type, setType] = useState<LiabilityType>('credit_card');
  const [opening, setOpening] = useState<number | null>(null);

  return (
    <Layout
      title="Deudas"
      list={
        liabilities.isPending ? (
          <Loading />
        ) : !liabilities.data?.length ? (
          <Empty>Sin deudas registradas.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {liabilities.data.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-stone-500">
                    {LIABILITY_TYPE_LABEL[l.type]} · Saldo inicial{' '}
                    <Amount minor={l.openingBalanceMinor} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Amount minor={l.balanceMinor} className="font-medium" />
                  <ArchiveButton path={`/liabilities/${String(l.id)}/archive`} />
                </div>
              </li>
            ))}
          </ul>
        )
      }
      form={
        <form
          key={resetKey}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            submit(
              e,
              opening === null ? null : { name, type, openingBalanceMinor: opening },
              () => {
                setName('');
              },
            );
          }}
        >
          <Field label="Nombre">
            {(id) => (
              <input
                id={id}
                className={inputClass}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Tipo">
            {(id) => (
              <Select
                id={id}
                value={type}
                onChange={setType}
                options={LIABILITY_TYPES.map((t) => ({ value: t, label: LIABILITY_TYPE_LABEL[t] }))}
              />
            )}
          </Field>
          <Field
            label="Saldo pendiente"
            hint="Lo que debes hoy. Los pagos se registran en Movimientos."
          >
            {(id) => <MoneyInput id={id} onChange={setOpening} />}
          </Field>
          <ErrorText error={mutation.error} />
          <Button type="submit" disabled={mutation.isPending || !name.trim() || opening === null}>
            Crear deuda
          </Button>
        </form>
      }
    />
  );
}

// --- goals ------------------------------------------------------------------------------------

export function GoalsPage() {
  const goals = useGoals();
  const accounts = useAccounts().data ?? [];
  const { mutation, submit, resetKey } = useCreateForm<CreateGoal & { requestId: string }>(
    '/goals',
  );
  const [name, setName] = useState('');
  const [target, setTarget] = useState<number | null>(null);
  const [targetDate, setTargetDate] = useState('');
  const [accountId, setAccountId] = useState<number | ''>('');

  return (
    <Layout
      title="Metas"
      list={
        goals.isPending ? (
          <Loading />
        ) : !goals.data?.length ? (
          <Empty>Sin metas todavía.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {goals.data.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-stone-500">
                    <Amount minor={g.progressMinor} /> de <Amount minor={g.targetMinor} />
                    {g.targetDate && ` · para el ${formatDate(g.targetDate)}`}
                  </div>
                </div>
                <ArchiveButton path={`/goals/${String(g.id)}/archive`} />
              </li>
            ))}
          </ul>
        )
      }
      form={
        <form
          key={resetKey}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            submit(
              e,
              target === null
                ? null
                : {
                    name,
                    targetMinor: target,
                    targetDate: targetDate || null,
                    accountId: accountId === '' ? null : accountId,
                  },
              () => {
                setName('');
              },
            );
          }}
        >
          <Field label="Nombre">
            {(id) => (
              <input
                id={id}
                className={inputClass}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Monto objetivo">
            {(id) => <MoneyInput id={id} onChange={setTarget} />}
          </Field>
          <Field label="Fecha objetivo (opcional)">
            {(id) => (
              <input
                id={id}
                type="date"
                className={inputClass}
                value={targetDate}
                onChange={(e) => {
                  setTargetDate(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Cuenta asociada (opcional)">
            {(id) => (
              <Select
                id={id}
                value={accountId}
                onChange={setAccountId}
                options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                placeholder="Ninguna"
              />
            )}
          </Field>
          <ErrorText error={mutation.error} />
          <Button
            type="submit"
            disabled={mutation.isPending || !name.trim() || target === null || target <= 0}
          >
            Crear meta
          </Button>
        </form>
      }
    />
  );
}

// --- categories -------------------------------------------------------------------------------

export function CategoriesPage() {
  const categories = useCategories();
  const { mutation, submit, resetKey } = useCreateForm<CreateCategory>('/categories');
  const [name, setName] = useState('');

  return (
    <Layout
      title="Categorías"
      list={
        categories.isPending ? (
          <Loading />
        ) : !categories.data?.length ? (
          <Empty>Sin categorías todavía.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {categories.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span>{c.name}</span>
                <ArchiveButton path={`/categories/${String(c.id)}/archive`} />
              </li>
            ))}
          </ul>
        )
      }
      form={
        <form
          key={resetKey}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            submit(e, { name }, () => {
              setName('');
            });
          }}
        >
          <Field label="Nombre">
            {(id) => (
              <input
                id={id}
                className={inputClass}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            )}
          </Field>
          <ErrorText error={mutation.error} />
          <Button type="submit" disabled={mutation.isPending || !name.trim()}>
            Crear categoría
          </Button>
        </form>
      }
    />
  );
}
