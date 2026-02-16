import { useMemo } from "react";
import type { JsonRpcSigner } from "ethers";
import { getContract } from "../lib/contracts";
import type { ContractName } from "../lib/types";

export function useContract(name: ContractName, signer: JsonRpcSigner | null) {
  return useMemo(() => {
    if (!signer) return null;
    try {
      return getContract(name, signer);
    } catch {
      return null;
    }
  }, [name, signer]);
}
