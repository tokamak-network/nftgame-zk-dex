export function ProofStatus({
  isGenerating,
  elapsed,
  error,
  duration,
}: {
  isGenerating: boolean;
  elapsed: number;
  error: string | null;
  duration?: number;
}) {
  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm text-red-300">
        Proof failed: {error}
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="bg-indigo-900/30 border border-indigo-700 rounded-lg p-3 flex items-center gap-3">
        <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-indigo-300">
          Generating ZK proof... {(elapsed / 1000).toFixed(1)}s
        </span>
      </div>
    );
  }

  if (duration != null) {
    return (
      <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 text-sm text-green-300">
        Proof generated in {(duration / 1000).toFixed(1)}s
      </div>
    );
  }

  return null;
}
