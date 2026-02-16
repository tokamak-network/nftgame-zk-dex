declare module "snarkjs" {
  interface Groth16Proof {
    pi_a: [string, string, string];
    pi_b: [[string, string], [string, string], [string, string]];
    pi_c: [string, string, string];
    protocol: string;
    curve: string;
  }

  interface FullProveResult {
    proof: Groth16Proof;
    publicSignals: string[];
  }

  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmFile: string,
      zkeyFile: string,
    ): Promise<FullProveResult>;
    verify(
      vkey: unknown,
      publicSignals: string[],
      proof: Groth16Proof,
    ): Promise<boolean>;
  };
}
