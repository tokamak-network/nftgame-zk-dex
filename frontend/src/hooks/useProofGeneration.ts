import { useState, useCallback, useRef } from "react";
import type { ProofResult } from "../lib/types";

type ProofState = {
  isGenerating: boolean;
  result: ProofResult | null;
  error: string | null;
  elapsed: number;
};

export function useProofGeneration() {
  const [state, setState] = useState<ProofState>({
    isGenerating: false,
    result: null,
    error: null,
    elapsed: 0,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generate = useCallback(
    async (
      proofFn: (inputs: Record<string, unknown>) => Promise<ProofResult>,
      inputs: Record<string, unknown>,
    ): Promise<ProofResult | null> => {
      setState({ isGenerating: true, result: null, error: null, elapsed: 0 });

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setState((prev) => ({ ...prev, elapsed: Date.now() - startTime }));
      }, 100);

      try {
        const result = await proofFn(inputs);
        clearInterval(timerRef.current!);
        setState({
          isGenerating: false,
          result,
          error: null,
          elapsed: result.duration,
        });
        return result;
      } catch (err) {
        clearInterval(timerRef.current!);
        const message = err instanceof Error ? err.message : "Proof generation failed";
        setState((prev) => ({
          ...prev,
          isGenerating: false,
          error: message,
          elapsed: Date.now() - startTime,
        }));
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState({ isGenerating: false, result: null, error: null, elapsed: 0 });
  }, []);

  return { ...state, generate, reset };
}
