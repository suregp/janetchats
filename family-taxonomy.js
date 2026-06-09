/**
 * family-taxonomy.js
 * ------------------
 * The canonical 31 relationship types and 4 preset filter categories.
 *
 *   31 types × 6 occupied degree bands = 186 family slots.
 *   Reserved band 186..216 (31 indices) is for cross-circle/cross-domain bridge pointers.
 *   7 × 31 = 217 total nodes (the canonical factorisation).
 *
 * NOTE: Per the project mandate, USER_N_INDEX = 0 is the *self-anchor* and is asserted
 * to map to (degree=4, ADOPTIVE_CHILD). This is a self-referential convention: the user
 * is the "adoptive child" of the lattice itself at the equilibrium image.
 */

export const RelationshipType = Object.freeze({
  // --- Ancestry (1..10) ---
  ADOPTIVE_CHILD:        1,   // canonical self-anchor type
  PARENT:                2,
  GRANDPARENT:           3,
  GREAT_GRANDPARENT:     4,
  GREAT2_GRANDPARENT:    5,
  GREAT3_GRANDPARENT:    6,
  STEP_PARENT:           7,
  ADOPTIVE_PARENT:       8,
  FOSTER_PARENT:         9,
  GUARDIAN:             10,
  // --- Descent (11..20) ---
  CHILD:                11,
  GRANDCHILD:           12,
  GREAT_GRANDCHILD:     13,
  GREAT2_GRANDCHILD:    14,
  GREAT3_GRANDCHILD:    15,
  STEP_CHILD:           16,
  FOSTER_CHILD:         17,
  WARD:                 18,
  GODCHILD:             19,
  GODPARENT:            20,
  // --- Lateral (21..29) ---
  SIBLING:              21,
  HALF_SIBLING:         22,
  STEP_SIBLING:         23,
  COUSIN_FIRST:         24,
  COUSIN_SECOND:        25,
  COUSIN_REMOVED:       26,
  AUNT_UNCLE:           27,
  NIECE_NEPHEW:         28,
  GRAND_NIECE_NEPHEW:   29,
  // --- Affinal (30..31) ---
  PARENT_IN_LAW:        30,
  SIBLING_IN_LAW:       31,
});

export const REL_TYPE_NAMES = Object.freeze(Object.fromEntries(
  Object.entries(RelationshipType).map(([k, v]) => [v, k])
));

export const REL_TYPE_LIST = Object.freeze(
  Object.entries(RelationshipType)
    .sort((a, b) => a[1] - b[1])
    .map(([name, id]) => ({ id, name, label: humanize(name) }))
);

function humanize(token) {
  return token.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Categories used by the relationship-filter UI in chat group creation. */
export const REL_CATEGORIES = Object.freeze({
  ancestors:   { label: 'Parents & Ancestors',     range: [1, 10] },
  descendants: { label: 'Children & Descendants',  range: [11, 20] },
  lateral:     { label: 'Siblings & Lateral',      range: [21, 29] },
  inlaws:      { label: 'In-Laws',                 range: [30, 31] },
});

export function categoryOf(relTypeId) {
  for (const [k, c] of Object.entries(REL_CATEGORIES)) {
    if (relTypeId >= c.range[0] && relTypeId <= c.range[1]) return k;
  }
  return null;
}

/** Returns ids in a category. */
export function typesInCategory(cat) {
  const c = REL_CATEGORIES[cat];
  if (!c) return [];
  const ids = [];
  for (let i = c.range[0]; i <= c.range[1]; i++) ids.push(i);
  return ids;
}

export function isValidRelType(id) {
  return Number.isInteger(id) && id >= 1 && id <= 31;
}

export function relTypeName(id) { return REL_TYPE_NAMES[id] || null; }
export function relTypeLabel(id) {
  const n = relTypeName(id);
  return n ? humanize(n) : null;
}
