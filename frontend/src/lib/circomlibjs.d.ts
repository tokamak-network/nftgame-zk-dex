declare module "circomlibjs" {
  interface BabyJub {
    F: {
      toObject(el: unknown): bigint;
      e(val: bigint | string | number): unknown;
    };
    Base8: [unknown, unknown];
    subOrder: bigint;
    mulPointEscalar(base: [unknown, unknown] | unknown[], scalar: bigint): [unknown, unknown];
    addPoint(p1: [unknown, unknown], p2: [unknown, unknown]): [unknown, unknown];
    inCurve(p: [unknown, unknown]): boolean;
    packPoint(p: [unknown, unknown]): Uint8Array;
    unpackPoint(packed: Uint8Array): [unknown, unknown];
  }

  interface Poseidon {
    (inputs: (bigint | number | string)[]): unknown;
    F: {
      toObject(el: unknown): bigint;
    };
  }

  export function buildBabyjub(): Promise<BabyJub>;
  export function buildPoseidon(): Promise<Poseidon>;
  export function buildEddsa(): Promise<unknown>;
}
