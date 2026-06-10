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

export const REL_TYPE_LABELS = Object.freeze(
  Object.fromEntries(
    REL_TYPE_LIST.map(({ id, label }) => [id, label])
  )
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

export const ENTITY_TYPES = Object.freeze({
  PERSON: 'PERSON',
  HOUSEHOLD: 'HOUSEHOLD',
  LINEAGE: 'LINEAGE',
  ORG: 'ORG',
  COMMUNITY: 'COMMUNITY',
  INSTITUTION: 'INSTITUTION',
});

const RELATIONSHIP_INVERSES = {
  1: 8,   // ADOPTIVE_CHILD ↔ ADOPTIVE_PARENT
  2: 11,  // PARENT ↔ CHILD
  3: 12,  // GRANDPARENT ↔ GRANDCHILD
  4: 13,  // GREAT_GRANDPARENT ↔ GREAT_GRANDCHILD
  5: 14,  // GREAT2_GRANDPARENT ↔ GREAT2_GRANDCHILD
  6: 15,  // GREAT3_GRANDPARENT ↔ GREAT3_GRANDCHILD
  7: 16,  // STEP_PARENT ↔ STEP_CHILD
  8: 1,   // ADOPTIVE_PARENT ↔ ADOPTIVE_CHILD
  9: 17,  // FOSTER_PARENT ↔ FOSTER_CHILD
  10: 18, // GUARDIAN ↔ WARD
  11: 2,
  12: 3,
  13: 4,
  14: 5,
  15: 6,
  16: 7,
  17: 9,
  18: 10,
  19: 20, // GODCHILD ↔ GODPARENT
  20: 19,
  21: 21, // SIBLING ↔ SIBLING
  22: 22, // HALF_SIBLING ↔ HALF_SIBLING
  23: 23, // STEP_SIBLING ↔ STEP_SIBLING
  24: 24, // COUSIN_FIRST ↔ COUSIN_FIRST
  25: 25, // COUSIN_SECOND ↔ COUSIN_SECOND
  26: 26, // COUSIN_REMOVED ↔ COUSIN_REMOVED
  27: 28, // AUNT_UNCLE ↔ NIECE_NEPHEW
  28: 27,
  29: 29, // GRAND_NIECE_NEPHEW ↔ GRAND_NIECE_NEPHEW
  30: 31, // PARENT_IN_LAW ↔ SIBLING_IN_LAW (simplified)
  31: 30,
};

const COMPOSITION_TABLE = Object.freeze({
  2: { // PARENT
    21: 27, // Parent ∘ Sibling = Aunt/Uncle
    11: 3,  // Parent ∘ Child = Grandparent
    24: 26, // Parent ∘ Cousin First = Cousin Removed
  },
  7: { // STEP_PARENT
    21: 23, // Step-parent ∘ Sibling = Step-sibling
  },
  21: { // SIBLING
    11: 28, // Sibling ∘ Child = Niece/Nephew
    7: 23,  // Sibling ∘ Step-parent = Step-sibling
  },
  26: { // COUSIN_FIRST
    11: 29, // Cousin First ∘ Child = Grand Niece/Nephew
  },
});

export const REL_PROPERTIES = Object.freeze(
  Object.fromEntries(
    REL_TYPE_LIST.map(({ id, name, label }) => {
      const property = {
        id,
        name,
        label,
        category: categoryOf(id),
        component: id <= 10 ? 'A' : id <= 20 ? 'B' : 'C',
        inverse: RELATIONSHIP_INVERSES[id] || null,
        inverseLabel: REL_TYPE_LABELS[RELATIONSHIP_INVERSES[id]] || null,
        symmetry: [21, 22, 23, 24, 25, 26, 29, 30, 31].includes(id),
      };
      return [id, property];
    })
  )
);

export function getRelProperties(relType) {
  return REL_PROPERTIES[relType] || null;
}

export function getInverse(relType) {
  if (!isValidRelType(relType)) return null;
  return RELATIONSHIP_INVERSES[relType] || null;
}

export function canCompose(relType1, relType2) {
  return Boolean(
    COMPOSITION_TABLE[relType1] && COMPOSITION_TABLE[relType1][relType2]
  );
}

export function composeRelationships(relType1, relType2) {
  if (!canCompose(relType1, relType2)) return null;
  return COMPOSITION_TABLE[relType1][relType2];
}

export function isCompatible(relType1, relType2) {
  return isValidRelType(relType1) && isValidRelType(relType2);
}
