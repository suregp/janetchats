// JANET 217-node lattice: 7 bands × 31 relationship types = 217
// record_index = (band - 1) * 31 + (rel_type - 1), range 0..216
// JANET_n = (record_index + 108) mod 217
// x = -100 + JANET_n * (25/27)

const LATTICE_SIZE = 217;
const BANDS = 7;
const TYPES_PER_BAND = 31;
const OCCUPIED_BANDS = 6;
const OCCUPIED_SLOTS = OCCUPIED_BANDS * TYPES_PER_BAND; // 186
const RESERVED_BAND = 7; // bridge pointers only
const PHASE_SHIFT = 108;
const DELTA = 25 / 27;

// User anchor: record_index=0 → JANET_n=108 → x=0.0 (equilibrium)
const USER_RECORD_INDEX = 0;
const USER_JANET_N = (USER_RECORD_INDEX + PHASE_SHIFT) % LATTICE_SIZE; // 108
const USER_X = -100 + USER_JANET_N * DELTA; // exactly 0.0

// 31 canonical relationship types
const REL_TYPES = {
  // Ancestry (A-component, Ingress) — types 1..10
  PARENT:                  1,
  GRANDPARENT:             2,
  GREAT_GRANDPARENT:       3,
  GREAT_GREAT_GRANDPARENT: 4,
  AUNT_UNCLE:              5,
  GREAT_AUNT_UNCLE:        6,
  STEP_PARENT:             7,
  FOSTER_PARENT:           8,
  GUARDIAN:                9,
  ANCESTOR:               10,
  // Descent (B-component, Egress) — types 11..20
  CHILD:                  11,
  GRANDCHILD:             12,
  GREAT_GRANDCHILD:       13,
  GREAT_GREAT_GRANDCHILD: 14,
  NIECE_NEPHEW:           15,
  ADOPTIVE_CHILD:         16,
  STEP_CHILD:             17,
  FOSTER_CHILD:           18,
  WARD:                   19,
  DESCENDANT:             20,
  // Lateral + Affinal (C-component, Equilibrium) — types 21..31
  SIBLING:                21,
  HALF_SIBLING:           22,
  STEP_SIBLING:           23,
  COUSIN:                 24,
  SECOND_COUSIN:          25,
  SPOUSE:                 26,
  EX_SPOUSE:              27,
  DOMESTIC_PARTNER:       28,
  COMPANION:              29,
  PARENT_IN_LAW:          30,
  SIBLING_IN_LAW:         31,
};

const REL_TYPE_NAMES = Object.fromEntries(
  Object.entries(REL_TYPES).map(([name, id]) => [id, name])
);

const REL_TYPE_LABELS = {
  1:  'Parent',
  2:  'Grandparent',
  3:  'Great-grandparent',
  4:  'Great-great-grandparent',
  5:  'Aunt / Uncle',
  6:  'Great-aunt / Uncle',
  7:  'Step-parent',
  8:  'Foster parent',
  9:  'Guardian',
  10: 'Ancestor',
  11: 'Child',
  12: 'Grandchild',
  13: 'Great-grandchild',
  14: 'Great-great-grandchild',
  15: 'Niece / Nephew',
  16: 'Adoptive child',
  17: 'Step-child',
  18: 'Foster child',
  19: 'Ward',
  20: 'Descendant',
  21: 'Sibling',
  22: 'Half-sibling',
  23: 'Step-sibling',
  24: 'Cousin',
  25: 'Second cousin',
  26: 'Spouse',
  27: 'Ex-spouse',
  28: 'Domestic partner',
  29: 'Companion',
  30: 'Parent-in-law',
  31: 'Sibling-in-law',
};

const REL_GROUPS = {
  ANCESTRY: { label: 'Ancestry', types: [1,2,3,4,5,6,7,8,9,10], component: 'A' },
  DESCENT:  { label: 'Descent',  types: [11,12,13,14,15,16,17,18,19,20], component: 'B' },
  LATERAL:  { label: 'Lateral & Affinal', types: [21,22,23,24,25,26,27,28,29,30,31], component: 'C' },
};

// Reciprocity operator ℛ(k): ℛ²(k) = k for all k
function reciprocal(k) {
  if (k >= 1  && k <= 10) return k + 10;
  if (k >= 11 && k <= 20) return k - 10;
  if (k >= 21 && k <= 29) return k;
  if (k === 30) return 31;
  if (k === 31) return 30;
  throw new Error(`Invalid rel_type: ${k}`);
}

// Verify reciprocity: inviter rel_type and invitee rel_type must satisfy ℛ
function isReciprocal(inviterType, inviteeType) {
  return reciprocal(inviterType) === inviteeType;
}

// Compute lattice coordinate from band and rel_type
function recordIndex(band, relType) {
  if (band < 1 || band > BANDS) throw new Error(`band out of range: ${band}`);
  if (relType < 1 || relType > TYPES_PER_BAND) throw new Error(`rel_type out of range: ${relType}`);
  return (band - 1) * TYPES_PER_BAND + (relType - 1);
}

function janetN(band, relType) {
  return (recordIndex(band, relType) + PHASE_SHIFT) % LATTICE_SIZE;
}

function latticeX(band, relType) {
  return parseFloat((-100 + janetN(band, relType) * DELTA).toFixed(10));
}

// Degree-band tier classification
function bandTier(band) {
  if (band <= 2) return 'hot';   // instant sync, 0 vouches
  if (band <= 4) return 'warm';  // 1 vouch required
  return 'cold';                  // 2 vouches required
}

function vouchesRequired(band) {
  if (band <= 2) return 0;
  if (band <= 4) return 1;
  return 2;
}

// Validate a connection coordinate
function validateCoordinate(band, relType) {
  if (band < 1 || band > OCCUPIED_BANDS)
    return { valid: false, reason: `Band ${band} is out of occupied range (1–${OCCUPIED_BANDS})` };
  if (relType < 1 || relType > TYPES_PER_BAND)
    return { valid: false, reason: `rel_type ${relType} is out of range (1–31)` };
  return { valid: true, index: recordIndex(band, relType) };
}

// Full node descriptor
function describeNode(band, relType) {
  const v = validateCoordinate(band, relType);
  if (!v.valid) return null;
  return {
    band,
    relType,
    label: REL_TYPE_LABELS[relType],
    name: REL_TYPE_NAMES[relType],
    reciprocalType: reciprocal(relType),
    reciprocalLabel: REL_TYPE_LABELS[reciprocal(relType)],
    recordIndex: recordIndex(band, relType),
    janetN: janetN(band, relType),
    x: latticeX(band, relType),
    tier: bandTier(band),
    vouchesRequired: vouchesRequired(band),
    group: relType <= 10 ? 'ANCESTRY' : relType <= 20 ? 'DESCENT' : 'LATERAL',
    component: relType <= 10 ? 'A' : relType <= 20 ? 'B' : 'C',
  };
}

// Get all nodes in the occupied lattice (186 slots)
function allNodes() {
  const nodes = [];
  for (let band = 1; band <= OCCUPIED_BANDS; band++) {
    for (let relType = 1; relType <= TYPES_PER_BAND; relType++) {
      nodes.push(describeNode(band, relType));
    }
  }
  return nodes;
}
