import type {
  AccountDto,
  CategoryDto,
  EntryDto,
  GoalDto,
  LiabilityDto,
  Session,
  SummaryDto,
} from '@finapp/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, setCsrfToken } from './api.js';

export const keys = {
  session: ['session'] as const,
  summary: ['summary'] as const,
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  liabilities: ['liabilities'] as const,
  goals: ['goals'] as const,
  entries: (month: string) => ['entries', month] as const,
};

export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: async () => {
      const session = await api.get<Session>('/session');
      setCsrfToken(session.csrfToken);
      return session;
    },
  });
}

export const useSummary = () =>
  useQuery({ queryKey: keys.summary, queryFn: () => api.get<SummaryDto>('/summary') });
export const useAccounts = () =>
  useQuery({ queryKey: keys.accounts, queryFn: () => api.get<AccountDto[]>('/accounts') });
export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: () => api.get<CategoryDto[]>('/categories') });
export const useLiabilities = () =>
  useQuery({ queryKey: keys.liabilities, queryFn: () => api.get<LiabilityDto[]>('/liabilities') });
export const useGoals = () =>
  useQuery({ queryKey: keys.goals, queryFn: () => api.get<GoalDto[]>('/goals') });
export const useEntries = (month: string) =>
  useQuery({
    queryKey: keys.entries(month),
    queryFn: () => api.get<EntryDto[]>(`/entries?month=${month}`),
  });

/**
 * A write that refreshes everything derived from the ledger. Balances are computed on the server,
 * so after any change the cached lists are simply refetched.
 */
export function useWrite<TBody extends { requestId: string }, TResult = unknown>(
  path: (body: TBody) => string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => api.post<TResult>(path(body), body),
    onSuccess: () => client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' }),
  });
}

/**
 * One idempotency key per form submission: double clicks and retries reuse it, so the API never
 * records the same entry twice. Call `next()` after a successful save to start a new submission.
 */
export function useRequestId() {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  return {
    requestId,
    next: () => {
      setRequestId(crypto.randomUUID());
    },
  };
}
