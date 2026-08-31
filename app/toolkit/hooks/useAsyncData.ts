import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type DependencyList,
} from "react";

export interface AsyncDataState<T> {
  isLoading: boolean;
  data: T;
  error: unknown | null;
}

type AsyncDataAction<T> =
  | { type: "start" }
  | { type: "success"; data: T }
  | { type: "error"; error: unknown }
  | { type: "replace"; data: T };

type AsyncTask<T> = (...args: never[]) => Promise<T>;

function reducer<T>(
  state: AsyncDataState<T>,
  action: AsyncDataAction<T>
): AsyncDataState<T> {
  switch (action.type) {
    case "start":
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case "success":
      return {
        isLoading: false,
        data: action.data,
        error: null,
      };
    case "error":
      return {
        ...state,
        isLoading: false,
        error: action.error,
      };
    case "replace":
      return {
        isLoading: false,
        data: action.data,
        error: null,
      };
  }
}

export function useAsyncData<T>(
  asyncFn: AsyncTask<T>,
  args: DependencyList,
  initialValue: T
) {
  const [state, dispatch] = useReducer(reducer<T>, {
    isLoading: false,
    error: null,
    data: initialValue,
  });

  const asyncFnRef = useRef(asyncFn);
  asyncFnRef.current = asyncFn;

  useEffect(() => {
    let isActive = true;
    const doAsync = async () => {
      dispatch({ type: "start" });
      try {
        const data = await asyncFnRef.current(
          ...(args as unknown as never[])
        );
        if (!isActive) return;
        dispatch({ type: "success", data });
      } catch (error) {
        if (!isActive) return;
        dispatch({ type: "error", error });
      }
    };

    void doAsync();
    return () => {
      isActive = false;
    };
    // The argument list is the hook's explicit dependency interface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, args);

  return {
    ...state,
    replace: useCallback(
      (data: T) => dispatch({ type: "replace", data }),
      []
    ),
  };
}
