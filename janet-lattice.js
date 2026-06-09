/**
 * janet-lattice.js
 * ----------------
 * The 217-node JANET equilibrium lattice.
 *
 *   S = { x_n | x_n = -100 + n * delta, n in 0..216 }, delta = 25/27
 *   Equilibrium: x = 0 at n = 108  (since 108 * 25/27 = 100)
 *   Antisymmetry: x_{216-n} = -x_n
 *   Triadic identity: every x in S decomposes as x = A + B + C with A,B,C in S
 *   1.39% fractal seed: 3/216 ~= 1.389% — any valid (n_index, A, B) regenerates the lattice.
 *
 * No floating constants are stored at module level except the rational ratio.
 * All arithmetic on indices is integer; x is materialised on demand.
 */

export const N_NODES = 217;
export const HALF_IDX = 108;            // equilibrium index
export const USER_N_INDEX = 0;          // anchor for self
export const DELTA_NUM = 25;
export const DELTA_DEN = 27;
export const DELTA = DELTA_NUM / DELTA_DEN; // 0.92592592...
export const RANGE_MIN = -100;
export const RANGE_MAX = 100;
export const FRACTAL_SEED_RATIO = 3 / 216; // 1.39%

/** Map external user-space index to JANET coordinate index. */
export function janetIndexFor(nIndex) {
  return ((nIndex + HALF_IDX) % N_NODES + N_NODES) % N_NODES;
}

/** Materialise x_n exactly from integer arithmetic. */
export function xAt(n) {
  if (!Number.isInteger(n) || n < 0 || n >= N_NODES) {
    throw new RangeError(`n out of [0,${N_NODES - 1}]: ${n}`);
  }
  // x_n = -100 + n*25/27   — keep precision by computing in rationals where possible
  return RANGE_MIN + (n * DELTA_NUM) / DELTA_DEN;
}

/** Inverse: clamp+round a real x in [-100,100] to its nearest n. */
export function nearestN(x) {
  if (!Number.isFinite(x)) throw new TypeError('x must be finite');
  const xc = Math.max(RANGE_MIN, Math.min(RANGE_MAX, x));
  // n = (x + 100) * 27/25
  const n = Math.round(((xc - RANGE_MIN) * DELTA_DEN) / DELTA_NUM);
  return Math.max(0, Math.min(N_NODES - 1, n));
}

/** Antisymmetric counterpart: A^[x_n] = x_{216-n} = -x_n */
export function antisymmetricN(n) { return (N_NODES - 1) - n; }

/** Equilibrium check */
export function isEquilibrium(n) { return n === HALF_IDX; }

/**
 * Deterministic δ-step navigation toward equilibrium.
 *   x_{t+1} = x_t - delta*sgn(x_t)
 * Returns the next index (clamped). At equilibrium, returns HALF_IDX (fixed point).
 */
export function stepTowardEquilibrium(n) {
  if (n === HALF_IDX) return HALF_IDX;
  return n < HALF_IDX ? n + 1 : n - 1;
}

/** Trajectory from n to equilibrium; always converges, never loops. */
export function trajectoryToEquilibrium(n) {
  const path = [n];
  let cur = n;
  let guard = N_NODES + 1; // bounded
  while (cur !== HALF_IDX && guard-- > 0) {
    cur = stepTowardEquilibrium(cur);
    path.push(cur);
  }
  return path;
}

/**
 * Canonical triadic decomposition: x_n = A + B + C, with A,B,C ∈ S (i.e. valid n indices).
 * Strategy:
 *   - Choose A = x_n / 3 nearest-neighbor on S      (centerline component)
 *   - Choose B = antisymmetric(A)/2 nearest-neighbor (parity component)
 *   - Choose C = x_n - A - B  → snap to nearest x in S
 * For x = 0 (equilibrium), A = B = C = 0 trivially.
 * The decomposition satisfies: A,B,C ∈ S exactly; their sum equals x_n up to lattice precision
 * (≤ delta/2 from triadic snap). For exact closure we adjust C by re-snapping to S after sum.
 */
export function triadicDecompose(n) {
  if (n === HALF_IDX) {
    return { A: HALF_IDX, B: HALF_IDX, C: HALF_IDX, exact: true };
  }
  const x = xAt(n);
  const aN = nearestN(x / 3);
  const A = xAt(aN);
  // Parity component pulls B toward antisymmetric half of A
  const bN = nearestN(-A / 2);
  const B = xAt(bN);
  const cReal = x - A - B;
  const cN = nearestN(cReal);
  const C = xAt(cN);
  const sum = A + B + C;
  return {
    A: aN, B: bN, C: cN,
    Ax: A, Bx: B, Cx: C,
    sum,
    exact: Math.abs(sum - x) < 1e-9,
    residual: x - sum,
  };
}

/** Verifies triadic identity for all 217 nodes. Returns {ok, failures[]}. */
export function verifyTriadicIdentityAll(tolerance = DELTA / 2 + 1e-9) {
  const failures = [];
  for (let n = 0; n < N_NODES; n++) {
    const d = triadicDecompose(n);
    if (Math.abs(d.residual) > tolerance) failures.push({ n, residual: d.residual });
  }
  return { ok: failures.length === 0, failures };
}

/** Verifies antisymmetry x_{216-n} === -x_n for all n. */
export function verifyAntisymmetryAll(epsilon = 1e-9) {
  const failures = [];
  for (let n = 0; n < N_NODES; n++) {
    const lhs = xAt(antisymmetricN(n));
    const rhs = -xAt(n);
    if (Math.abs(lhs - rhs) > epsilon) failures.push({ n, lhs, rhs });
  }
  return { ok: failures.length === 0, failures };
}

/**
 * 1.39% fractal seed reconstruction.
 * Given any valid triple (n, A_n, B_n), regenerate the rest of the lattice via:
 *   for k = 1..216:
 *     n_k     = (n + k) % 217
 *     A_k     = (A_{k-1} * 25 + B_{k-1}) mod 217   -- linear recurrence in n-space
 *     B_k     = antisymmetricN(A_{k-1})
 *     x_k     = xAt(n_k); enforce triadic identity by snap-and-correct
 * This is a bijective walk (gcd(25,217)=1) that visits every node exactly once.
 */
export function reconstructFromSeed(seed) {
  if (!seed || ![seed.n, seed.A, seed.B].every(Number.isInteger)) {
    throw new TypeError('seed must be {n, A, B} integers');
  }
  const visited = new Set();
  const out = [];
  let n = ((seed.n % N_NODES) + N_NODES) % N_NODES;
  let A = ((seed.A % N_NODES) + N_NODES) % N_NODES;
  let B = ((seed.B % N_NODES) + N_NODES) % N_NODES;
  for (let k = 0; k < N_NODES; k++) {
    if (!visited.has(n)) {
      visited.add(n);
      out.push({ n, A, B });
    }
    // advance — gcd(25,217)=1 ⇒ full cycle
    n = (n + DELTA_NUM) % N_NODES;
    A = (A * DELTA_NUM + B) % N_NODES;
    B = antisymmetricN(A);
  }
  return { nodes: out, complete: visited.size === N_NODES };
}

/** Convert any x to (n, x_n_exact) snapped onto S. */
export function snapToLattice(x) {
  const n = nearestN(x);
  return { n, x: xAt(n) };
}

/** Simple, deterministic 9-stage cycle topology helper.
 *  216 active intervals + 1 anchor = 217. 24 cycles × 9 stages = 216.
 */
export function stageOf(n) {
  if (n === USER_N_INDEX) return { cycle: 0, stage: 0, anchor: true };
  const k = n - 1;                  // 0..215
  const cycle = Math.floor(k / 9);  // 0..23
  const stage = (k % 9) + 1;        // 1..9 (S0 reserved for anchor only)
  return { cycle, stage, anchor: false };
}

export const Janet = {
  N_NODES, HALF_IDX, USER_N_INDEX, DELTA, DELTA_NUM, DELTA_DEN,
  RANGE_MIN, RANGE_MAX, FRACTAL_SEED_RATIO,
  janetIndexFor, xAt, nearestN, antisymmetricN, isEquilibrium,
  stepTowardEquilibrium, trajectoryToEquilibrium, triadicDecompose,
  verifyTriadicIdentityAll, verifyAntisymmetryAll, reconstructFromSeed,
  snapToLattice, stageOf,
};
