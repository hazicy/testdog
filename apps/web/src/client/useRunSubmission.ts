'use client';

import { createId } from '@/client/id';

import { useRef } from 'react';
import { isHTTPError } from 'ky';
import { api } from '@/client/api';

export function useRunSubmission() {
  const pending = useRef(new Map<string, string>());

  return async <T>(url: string, payload: unknown): Promise<T> => {
    const signature = `${url}:${JSON.stringify(payload)}`;
    const key = pending.current.get(signature) ?? createId();

    pending.current.set(signature, key);
    try {
      const response = await api
        .post(url, { json: payload, headers: { 'Idempotency-Key': key } })
        .json<T>();

      pending.current.delete(signature);

      return response;
    } catch (error) {
      if (isHTTPError(error) && error.response.status < 500) pending.current.delete(signature);
      throw error;
    }
  };
}
