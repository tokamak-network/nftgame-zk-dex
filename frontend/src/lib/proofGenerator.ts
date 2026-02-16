import * as snarkjs from "snarkjs";
import type { CircuitName, SolidityProof, ProofResult } from "./types";

/**
 * Format snarkjs proof for Solidity verifier (swap pi_b indices)
 */
function formatProofForContract(
  proof: snarkjs.Groth16Proof,
): SolidityProof {
  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    b: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ],
    c: [proof.pi_c[0], proof.pi_c[1]],
  };
}

/**
 * Generate a ZK proof in the browser
 */
export async function generateProof(
  circuitName: CircuitName,
  inputs: Record<string, unknown>,
): Promise<ProofResult> {
  const wasmUrl = `/circuits/${circuitName}/${circuitName}.wasm`;
  const zkeyUrl = `/circuits/${circuitName}/${circuitName}.zkey`;

  const start = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    inputs,
    wasmUrl,
    zkeyUrl,
  );
  const duration = Date.now() - start;

  return {
    proof: formatProofForContract(proof),
    publicSignals,
    duration,
  };
}
