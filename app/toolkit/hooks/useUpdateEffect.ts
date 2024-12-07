import { useEffect, useRef } from "react";

// Prev dependencies check has been added to prevent
// the React 18 "double effect"
export const useUpdateEffect = (effectFn: () => void, dependencies: any[]) => {
  const effectFnRef = useRef(effectFn);
  const hasMountedRef = useRef(false);
  const prevDepsRef = useRef(dependencies);

  useEffect(() => {
    effectFnRef.current = effectFn;
  });

  useEffect(() => {
    if (hasMountedRef.current) {
      if (dependencies.some((dep, i) => dep !== prevDepsRef.current[i])) {
        effectFnRef.current();
      }
    }
    prevDepsRef.current = dependencies;
  }, dependencies);

  useEffect(() => {
    hasMountedRef.current = true;
  }, []);
};
