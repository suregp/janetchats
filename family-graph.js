/**
 * family-graph.js
 * ---------------
 * Maps the 7×31 = 217 lattice into a family addressing scheme.
 *
 *   record_index = (degree - 1) * 31 + (rel_type - 1)   for degree in 1..6
 *   indices 0..185  -> family slots
 *   indices 186..216 -> reserved band (cross-circle bridges only; never key-binding)
 *
 *   USER_N_INDEX = 0 is the *self-anchor*. By the project mandate it asserts as
 *   (degree=4, ADOPTIVE_CHILD). This is treated as a special self-reference: any
 *   record at index 0 represents the device-bound user, not a real relative.
 *
 *   BAT (Block Allocation Tier):
 *     hot  : degrees 1..2  (immediate)        polling = 27 steps
 *     warm : degrees 3..4  (core lateral)     polling = 54 steps
 *     cold : degrees 5..6  (extended kin)     polling = 108 steps
 *
 *   Vouch thresholds for recovery / group join:
 *     hot:  0 vouches   (instant)
 *     warm: 1 vouch
 *     cold: 2 vouches
 */

import { N_NODES, HALF_IDX, USER_N_INDEX } from '../lattice/janet-lattice.js';
import { RelationshipType, isValidRelType } from './family-taxonomy.js';

export const RESERVED_BAND_START = 186;       // 6 * 31
export const RESERVED_BAND_END   = 216;
export const FAMILY_SLOTS        = 186;        // 0..185

export const SELF_ANCHOR = Object.freeze({
  n_index: USER_N_INDEX,            // 0
  janet_n: HALF_IDX,                // 108
  degree:  4,                        // mandated
  rel_type: RelationshipType.ADOPTIVE_CHILD,
});

/**
 * @returns {{degree:number, rel_type:number}|{reserved:true, n_index:number}}
 */
export function degreeAndTypeFor(nIndex) {
  if (!Number.isInteger(nIndex) || nIndex < 0 || nIndex >= N_NODES) {
    throw new RangeError(`n_index out of range: ${nIndex}`);
  }
  // SELF anchor is mandated to (4, ADOPTIVE_CHILD)
  if (nIndex === USER_N_INDEX) {
    return { degree: SELF_ANCHOR.degree, rel_type: SELF_ANCHOR.rel_type, self: true };
  }
  if (nIndex >= RESERVED_BAND_START) {
    return { reserved: true, n_index: nIndex };
  }
  const degree   = Math.floor(nIndex / 31) + 1;            // 1..6
  const rel_type = (nIndex % 31) + 1;                      // 1..31
  return { degree, rel_type };
}

/** Inverse: (degree, rel_type) -> n_index in family band. Throws on invalid input. */
export function nIndexFor(degree, rel_type) {
  if (!Number.isInteger(degree) || degree < 1 || degree > 6) {
    throw new RangeError(`degree must be 1..6: ${degree}`);
  }
  if (!isValidRelType(rel_type)) {
    throw new RangeError(`rel_type must be 1..31: ${rel_type}`);
  }
  return (degree - 1) * 31 + (rel_type - 1);
}

export function isReserved(nIndex) {
  return nIndex >= RESERVED_BAND_START && nIndex <= RESERVED_BAND_END;
}

export function batTierForDegree(degree) {
  if (degree === 1 || degree === 2) return 'hot';
  if (degree === 3 || degree === 4) return 'warm';
  if (degree === 5 || degree === 6) return 'cold';
  throw new RangeError(`degree must be 1..6: ${degree}`);
}

export function pollingStepsForDegree(degree) {
  switch (batTierForDegree(degree)) {
    case 'hot':  return 27;
    case 'warm': return 54;
    case 'cold': return 108;
  }
}

export function vouchThresholdForDegree(degree) {
  switch (batTierForDegree(degree)) {
    case 'hot':  return 0;
    case 'warm': return 1;
    case 'cold': return 2;
  }
}

/** Reserved band slot (186..216) for a cross-circle bridge keyed by an arbitrary id. */
export function reservedBridgeIndex(bridgeKeyHex) {
  // hash bridgeKeyHex into 0..30, offset by RESERVED_BAND_START
  let h = 0;
  for (let i = 0; i < bridgeKeyHex.length; i++) {
    h = (h * 31 + bridgeKeyHex.charCodeAt(i)) >>> 0;
  }
  return RESERVED_BAND_START + (h % (RESERVED_BAND_END - RESERVED_BAND_START + 1));
}

/**
 * Validate a member's relationship binding meets join/access constraints.
 * Throws on invalid input; returns rich descriptor.
 */
export function validateMember({ n_index, rel_type, degree }) {
  if (n_index === USER_N_INDEX) {
    return { ok: true, ...SELF_ANCHOR, tier: batTierForDegree(SELF_ANCHOR.degree),
             polling: pollingStepsForDegree(SELF_ANCHOR.degree),
             vouches: vouchThresholdForDegree(SELF_ANCHOR.degree) };
  }
  const dt = degreeAndTypeFor(n_index);
  if (dt.reserved) return { ok: false, error: 'reserved_band' };
  if (rel_type !== undefined && rel_type !== dt.rel_type) {
    return { ok: false, error: 'rel_type_mismatch', expected: dt.rel_type, got: rel_type };
  }
  if (degree !== undefined && degree !== dt.degree) {
    return { ok: false, error: 'degree_mismatch', expected: dt.degree, got: degree };
  }
  return {
    ok: true,
    n_index,
    degree: dt.degree,
    rel_type: dt.rel_type,
    tier: batTierForDegree(dt.degree),
    polling: pollingStepsForDegree(dt.degree),
    vouches: vouchThresholdForDegree(dt.degree),
  };
}

/** Self-test asserted at module load; throws if mandates are violated. */
export function assertMandates() {
  const sd = degreeAndTypeFor(USER_N_INDEX);
  if (sd.degree !== 4 || sd.rel_type !== RelationshipType.ADOPTIVE_CHILD) {
    throw new Error(`MANDATE FAIL: degree_and_type_for(0) must be (4, ADOPTIVE_CHILD), got (${sd.degree}, ${sd.rel_type})`);
  }
  if (FAMILY_SLOTS + (RESERVED_BAND_END - RESERVED_BAND_START + 1) !== N_NODES) {
    throw new Error('MANDATE FAIL: 7×31=217 factorisation broken');
  }
  if (6 * 31 !== FAMILY_SLOTS) throw new Error('MANDATE FAIL: family slot count mismatch');
}
