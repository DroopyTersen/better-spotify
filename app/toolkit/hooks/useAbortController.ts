import { useEffect, useRef } from "react";

export const useAbortController = () => {
  const abortControllerRef = useRef<AbortController | null>(
    new AbortController()
  );

  useEffect(() => {
    // cleanup function when component unmounts
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const createAbortController = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current as AbortController;
  };
  const getAbortController = () => {
    return abortControllerRef.current as AbortController;
  };

  return {
    createAbortController,
    getAbortController,
  };
};
