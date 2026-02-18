export function TxStatus({
  txHash,
  isPending,
  isConfirmed,
  error,
}: {
  txHash: string | null;
  isPending: boolean;
  isConfirmed: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="glass-panel border border-red-500/50 p-3 text-sm text-red-400 font-body">
        <span className="font-display text-xs tracking-wider text-red-500 mr-2">FAILED</span>
        Transaction failed: {error}
      </div>
    );
  }

  if (isPending && txHash) {
    return (
      <div className="glass-panel border border-neon-yellow/30 p-3 flex items-center gap-3"
        style={{ animation: "neon-pulse 2s ease-in-out infinite", "--pulse-color": "#ffe600" } as React.CSSProperties}
      >
        <div className="w-4 h-4 border-2 border-neon-yellow border-t-transparent rounded-full animate-spin" />
        <div className="text-sm">
          <p className="font-display text-xs tracking-wider neon-text-yellow">PENDING</p>
          <p className="font-mono text-xs mt-1 text-gray-500 break-all">
            {txHash}
          </p>
        </div>
      </div>
    );
  }

  if (isConfirmed && txHash) {
    return (
      <div className="glass-panel border border-neon-green/30 p-3 text-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block px-2 py-0.5 text-[10px] font-display font-bold tracking-widest bg-neon-green text-bg-deep rounded">
            CONFIRMED
          </span>
        </div>
        <p className="font-mono text-xs text-gray-500 break-all">
          {txHash}
        </p>
      </div>
    );
  }

  return null;
}
