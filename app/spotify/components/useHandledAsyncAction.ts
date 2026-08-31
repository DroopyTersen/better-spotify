import { useCallback, useRef, useState } from "react";

export type AsyncVoidAction = () => Promise<void>;

type AsyncActionStateHandlers = {
  setPending: (pending: boolean) => void;
  setError: (error: string | null) => void;
};

export async function runHandledAsyncAction(
  action: AsyncVoidAction,
  errorMessage: string,
  { setPending, setError }: AsyncActionStateHandlers
): Promise<void> {
  setPending(true);
  setError(null);
  try {
    await action();
  } catch {
    setError(errorMessage);
  } finally {
    setPending(false);
  }
}

export function useHandledAsyncAction(
  action: AsyncVoidAction | undefined,
  errorMessage: string
) {
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const run = useCallback(async (): Promise<void> => {
    if (!action || pendingRef.current) return;
    pendingRef.current = true;
    try {
      await runHandledAsyncAction(action, errorMessage, {
        setPending,
        setError,
      });
    } finally {
      pendingRef.current = false;
    }
  }, [action, errorMessage]);

  return { error, isPending, run };
}
