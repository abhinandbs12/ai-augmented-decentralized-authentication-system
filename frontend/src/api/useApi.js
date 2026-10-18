import { useCallback, useEffect, useState } from 'react';
import { api } from './client';

/** GET `path` and re-fetch whenever it changes. Returns { data, error, loading, reload }. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    setState((previous) => ({ ...previous, error: null, loading: true }));
    api.get(path).then(
      (data) => current && setState({ data, error: null, loading: false }),
      (error) => current && setState({ data: null, error, loading: false }),
    );
    return () => {
      current = false;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

/** Builds a query string, skipping empty values. */
export function query(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}
