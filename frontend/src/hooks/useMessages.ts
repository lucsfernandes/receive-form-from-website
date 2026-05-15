import axios from 'axios';
import { useEffect, useState } from 'react';
import { getMessage, listMessages, type ApiFailure } from '../services/api';
import type { ContactMessage, PaginatedMessages } from '../types/contact';

type ListState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; data: PaginatedMessages }
  | { kind: 'error'; failure: ApiFailure };

interface ListArgs {
  page: number;
  pageSize: number;
  q: string;
}

/** Manages the paginated list query, cancelling in-flight requests on change. */
export function useMessageList({ page, pageSize, q }: ListArgs) {
  const [state, setState] = useState<ListState>({ kind: 'idle' });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // Always reset to loading on every fetch so transient errors and stale
    // success data don't linger across queries.
    setState({ kind: 'loading' });

    listMessages({ page, pageSize, q, signal: controller.signal })
      .then((data) => setState({ kind: 'success', data }))
      .catch((err) => {
        if (axios.isCancel(err)) return;
        setState({ kind: 'error', failure: err as ApiFailure });
      });

    return () => controller.abort();
  }, [page, pageSize, q, refreshKey]);

  return { state, refresh: () => setRefreshKey((k) => k + 1) };
}

type DetailState =
  | { kind: 'loading' }
  | { kind: 'success'; data: ContactMessage }
  | { kind: 'error'; failure: ApiFailure };

/** Fetches one message by id, cancelling on unmount or id change. */
export function useMessageDetail(id: string | undefined) {
  const [state, setState] = useState<DetailState>({ kind: 'loading' });

  useEffect(() => {
    if (!id) {
      setState({
        kind: 'error',
        failure: { kind: 'not-found', message: 'ID ausente' },
      });
      return;
    }
    const controller = new AbortController();
    setState({ kind: 'loading' });

    getMessage(id, controller.signal)
      .then((data) => setState({ kind: 'success', data }))
      .catch((err) => {
        if (axios.isCancel(err)) return;
        setState({ kind: 'error', failure: err as ApiFailure });
      });

    return () => controller.abort();
  }, [id]);

  return state;
}
