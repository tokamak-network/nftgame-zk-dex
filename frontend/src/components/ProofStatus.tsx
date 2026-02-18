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
      <div className="glass-panel border border-red-500/50 p-3 text-sm text-red-400 font-body">
        <span className="font-display text-xs tracking-wider text-red-500 mr-2">ERROR</span>
        Proof failed: {error}
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="glass-panel border border-neon-cyan/30 p-3 data-stream-bg flex items-center gap-3">
        <div className="w-4 h-4 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-display tracking-wider neon-text-cyan">
          Generating ZK proof... {(elapsed / 1000).toFixed(1)}s
        </span>
      </div>
    );
  }

  if (duration != null) {
    return (
      <div className="glass-panel border border-neon-green/30 p-3 text-sm">
        <span className="font-display text-xs tracking-wider neon-text-green mr-2">VERIFIED</span>
        <span className="font-body text-gray-300">
          Proof generated in {(duration / 1000).toFixed(1)}s
        </span>
      </div>
    );
  }

  return null;
}
