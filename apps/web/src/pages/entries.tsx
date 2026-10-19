import { ENTRY_KINDS, type CreateEntry, type EntryDto, type EntryKind } from '@finapp/contracts';
import { useState, type SubmitEvent } from 'react';
import { formatDate, formatMonth, shiftMonth, today } from '../format.js';
import { KIND_LABEL } from '../i18n.js';
import {
  useAccounts,
  useCategories,
  useEntries,
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

type Link = 'source' | 'destination' | 'category' | 'goal' | 'liability';

/** Which inputs each kind shows. Mirrors the domain rules (ADR 0002); the API still validates. */
const FIELDS: Record<EntryKind, readonly Link[]> = {
  income: ['destination', 'category'],
  expense: ['source', 'category'],
  transfer: ['source', 'destination', 'category'],
  goal_contribution: ['source', 'goal', 'category'],
  debt_payment: ['source', 'liability', 'category'],
  adjustment: [],
};

export function EntriesPage() {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const entries = useEntries(month);

  return (
    <>
      <PageHeader title="Movimientos">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            aria-label="Mes anterior"
            onClick={() => {
              setMonth(shiftMonth(month, -1));
            }}
          >
            ←
          </Button>
          <span className="w-40 text-center text-sm font-medium capitalize">
            {formatMonth(month)}
          </span>
          <Button
            variant="ghost"
            aria-label="Mes siguiente"
            onClick={() => {
              setMonth(shiftMonth(month, 1));
            }}
          >
            →
          </Button>
        </div>
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          {entries.isPending ? (
            <Loading />
          ) : entries.error ? (
            <ErrorText error={entries.error} />
          ) : entries.data.length === 0 ? (
            <Empty>No hay movimientos en este mes.</Empty>
          ) : (
            <EntryTable entries={entries.data} />
          )}
        </Card>
        <Card title="Nuevo movimiento">
          <EntryForm />
        </Card>
      </div>
    </>
  );
}

function EntryTable({ entries }: { entries: EntryDto[] }) {
  const accounts = useAccountNames();
  const categories = new Map(useCategories().data?.map((c) => [c.id, c.name]));
  const goals = new Map(useGoals().data?.map((g) => [g.id, g.name]));
  const liabilities = new Map(useLiabilities().data?.map((l) => [l.id, l.name]));

  const describe = (e: EntryDto) => {
    const from = e.sourceAccountId ? accounts.get(e.sourceAccountId) : undefined;
    const to = e.destinationAccountId ? accounts.get(e.destinationAccountId) : undefined;
    const target = e.goalId
      ? goals.get(e.goalId)
      : e.liabilityId
        ? liabilities.get(e.liabilityId)
        : undefined;
    return [from && to ? `${from} → ${to}` : (from ?? to), target].filter(Boolean).join(' · ');
  };
  /** Money leaving an account is shown negative; transfers are neutral. */
  const signed = (e: EntryDto) => {
    const outflow = e.kind === 'transfer' ? 0 : e.sourceAccountId ? -1 : 1;
    const reversal = e.reversesEntryId ? -1 : 1;
    return outflow === 0 ? e.amountMinor : outflow * reversal * e.amountMinor;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
            <th className="py-2 pr-3 font-medium">Fecha</th>
            <th className="py-2 pr-3 font-medium">Tipo</th>
            <th className="py-2 pr-3 font-medium">Detalle</th>
            <th className="py-2 pr-3 text-right font-medium">Monto</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {entries.map((e) => (
            <tr
              key={e.id}
              className={e.reversedByEntryId || e.reversesEntryId ? 'text-stone-400' : ''}
            >
              <td className="whitespace-nowrap py-2 pr-3">{formatDate(e.occurredOn)}</td>
              <td className="py-2 pr-3">
                {KIND_LABEL[e.kind]}
                {e.reversesEntryId && <span className="ml-1 text-xs">(reversión)</span>}
                {e.reversedByEntryId && <span className="ml-1 text-xs">(reversado)</span>}
              </td>
              <td className="py-2 pr-3">
                <div>{describe(e)}</div>
                {(e.categoryId || e.note) && (
                  <div className="text-xs text-stone-500">
                    {[e.categoryId ? categories.get(e.categoryId) : null, e.note]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
              </td>
              <td className="whitespace-nowrap py-2 pr-3 text-right">
                <Amount
                  minor={signed(e)}
                  className={e.kind === 'transfer' ? 'text-stone-500' : ''}
                />
              </td>
              <td className="py-2 text-right">
                {!e.reversedByEntryId && !e.reversesEntryId && <ReverseButton entry={e} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReverseButton({ entry }: { entry: EntryDto }) {
  const { requestId } = useRequestId();
  const reverse = useWrite<{ requestId: string; occurredOn: string; note: string }>(
    () => `/entries/${String(entry.id)}/reverse`,
  );
  const date = entry.occurredOn > today() ? entry.occurredOn : today();
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant="danger"
        className="px-2 py-1 text-xs"
        disabled={reverse.isPending}
        onClick={() => {
          if (
            window.confirm('¿Reversar este movimiento? Se registrará un movimiento que lo anula.')
          ) {
            reverse.mutate({ requestId, occurredOn: date, note: 'Reversión' });
          }
        }}
      >
        Reversar
      </Button>
      <ErrorText error={reverse.error} />
    </span>
  );
}

function useAccountNames() {
  return new Map(useAccounts().data?.map((a) => [a.id, a.name]));
}

function EntryForm() {
  const accounts = useAccounts().data ?? [];
  const categories = useCategories().data ?? [];
  const goals = useGoals().data ?? [];
  const liabilities = useLiabilities().data ?? [];
  const { requestId, next } = useRequestId();
  const create = useWrite<CreateEntry & { requestId: string }>(() => '/entries');

  const [kind, setKind] = useState<EntryKind>('expense');
  const [occurredOn, setOccurredOn] = useState(today);
  const [amount, setAmount] = useState<number | null>(null);
  const [interest, setInterest] = useState<number | null>(null);
  const [links, setLinks] = useState<Partial<Record<Link, number>>>({});
  const [adjustDirection, setAdjustDirection] = useState<'credit' | 'debit'>('credit');
  const [note, setNote] = useState('');
  const [formKey, setFormKey] = useState(0);

  const show = new Set(FIELDS[kind]);
  const set = (link: Link) => (value: number) => {
    setLinks((l) => ({ ...l, [link]: value }));
  };
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }));

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    if (amount === null) return;
    const adjustmentAccount = links.source ?? null;
    create.mutate(
      {
        requestId,
        kind,
        occurredOn,
        amountMinor: amount,
        interestMinor: kind === 'debt_payment' ? (interest ?? 0) : 0,
        sourceAccountId:
          kind === 'adjustment'
            ? adjustDirection === 'debit'
              ? adjustmentAccount
              : null
            : show.has('source')
              ? (links.source ?? null)
              : null,
        destinationAccountId:
          kind === 'adjustment'
            ? adjustDirection === 'credit'
              ? adjustmentAccount
              : null
            : show.has('destination')
              ? (links.destination ?? null)
              : null,
        categoryId: show.has('category') ? (links.category ?? null) : null,
        goalId: show.has('goal') ? (links.goal ?? null) : null,
        liabilityId: show.has('liability') ? (links.liability ?? null) : null,
        note: note.trim() === '' ? null : note.trim(),
      },
      {
        onSuccess: () => {
          next();
          setAmount(null);
          setInterest(null);
          setNote('');
          setFormKey((k) => k + 1); // clears the money inputs
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" key={formKey}>
      <Field label="Tipo">
        {(id) => (
          <Select
            id={id}
            value={kind}
            onChange={setKind}
            options={ENTRY_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha">
          {(id) => (
            <input
              id={id}
              type="date"
              className={inputClass}
              value={occurredOn}
              onChange={(e) => {
                setOccurredOn(e.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Monto">{(id) => <MoneyInput id={id} onChange={setAmount} />}</Field>
      </div>

      {kind === 'adjustment' && (
        <>
          <Field label="Cuenta">
            {(id) => (
              <Select
                id={id}
                value={links.source ?? ''}
                onChange={set('source')}
                options={accountOptions}
                placeholder="Elige una cuenta"
              />
            )}
          </Field>
          <Field label="Efecto">
            {(id) => (
              <Select
                id={id}
                value={adjustDirection}
                onChange={setAdjustDirection}
                options={[
                  { value: 'credit', label: 'Sumar al saldo' },
                  { value: 'debit', label: 'Restar del saldo' },
                ]}
              />
            )}
          </Field>
        </>
      )}
      {show.has('source') && (
        <Field label="Desde la cuenta">
          {(id) => (
            <Select
              id={id}
              value={links.source ?? ''}
              onChange={set('source')}
              options={accountOptions}
              placeholder="Elige una cuenta"
            />
          )}
        </Field>
      )}
      {show.has('destination') && (
        <Field label={kind === 'income' ? 'A la cuenta' : 'Hacia la cuenta'}>
          {(id) => (
            <Select
              id={id}
              value={links.destination ?? ''}
              onChange={set('destination')}
              options={accountOptions}
              placeholder="Elige una cuenta"
            />
          )}
        </Field>
      )}
      {show.has('goal') && (
        <Field label="Meta">
          {(id) => (
            <Select
              id={id}
              value={links.goal ?? ''}
              onChange={set('goal')}
              options={goals.map((g) => ({ value: g.id, label: g.name }))}
              placeholder="Elige una meta"
            />
          )}
        </Field>
      )}
      {show.has('liability') && (
        <>
          <Field label="Deuda">
            {(id) => (
              <Select
                id={id}
                value={links.liability ?? ''}
                onChange={set('liability')}
                options={liabilities.map((l) => ({ value: l.id, label: l.name }))}
                placeholder="Elige una deuda"
              />
            )}
          </Field>
          <Field label="De ese pago, intereses" hint="Solo el resto (capital) reduce la deuda.">
            {(id) => <MoneyInput id={id} onChange={setInterest} />}
          </Field>
        </>
      )}
      {show.has('category') && (
        <Field label={kind === 'transfer' ? 'Categoría (opcional)' : 'Categoría'}>
          {(id) => (
            <Select
              id={id}
              value={links.category ?? ''}
              onChange={set('category')}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Elige una categoría"
            />
          )}
        </Field>
      )}
      <Field label={kind === 'adjustment' ? 'Motivo' : 'Nota (opcional)'}>
        {(id) => (
          <input
            id={id}
            className={inputClass}
            value={note}
            maxLength={500}
            onChange={(e) => {
              setNote(e.target.value);
            }}
          />
        )}
      </Field>
      <ErrorText error={create.error} />
      <Button type="submit" disabled={create.isPending || amount === null || amount <= 0}>
        {create.isPending ? 'Guardando…' : 'Guardar movimiento'}
      </Button>
    </form>
  );
}
