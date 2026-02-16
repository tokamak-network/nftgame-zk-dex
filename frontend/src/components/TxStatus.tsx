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
      <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm text-red-300">
        Transaction failed: {error}
      </div>
    );
  }

  if (isPending && txHash) {
    return (
      <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 flex items-center gap-3">
        <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        <div className="text-sm">
          <p className="text-yellow-300">Awaiting confirmation...</p>
          <p className="text-yellow-500 font-mono text-xs mt-1 break-all">
            {txHash}
          </p>
        </div>
      </div>
    );
  }

  if (isConfirmed && txHash) {
    return (
      <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 text-sm">
        <p className="text-green-300">Transaction confirmed</p>
        <p className="text-green-500 font-mono text-xs mt-1 break-all">
          {txHash}
        </p>
      </div>
    );
  }

  return null;
}
