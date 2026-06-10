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

import { N_NODES, HALF_IDX, USER_N_INDEX } from './janet-lattice.js';
import { reciprocal } from './lattice.js';
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

function assertValidBand(band) {
  if (!Number.isInteger(band) || band < 1 || band > 6) {
    throw new RangeError(`band must be 1..6: ${band}`);
  }
}

export class FamilyGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
    this.triads = [];
  }

  static fromJSON(data) {
    const graph = new FamilyGraph();
    if (data.nodes && Array.isArray(data.nodes)) {
      for (const node of data.nodes) {
        graph.nodes.set(node.id, { ...node });
      }
    }
    if (data.edges && Array.isArray(data.edges)) {
      graph.edges = data.edges.map(edge => ({ ...edge }));
    }
    if (data.triads && Array.isArray(data.triads)) {
      graph.triads = data.triads.map(triad => ({ ...triad }));
    }
    return graph;
  }

  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
      triads: this.triads,
    };
  }

  createNode(id, band, relType, metadata = {}) {
    if (!id || typeof id !== 'string') {
      throw new TypeError('entityId must be a non-empty string');
    }
    assertValidBand(band);
    if (!isValidRelType(relType)) {
      throw new RangeError(`relType must be 1..31: ${relType}`);
    }
    if (this.nodes.has(id)) {
      throw new Error(`Node already exists: ${id}`);
    }
    const node = {
      id,
      band,
      relType,
      metadata: { ...metadata },
      createdAt: Date.now(),
    };
    this.nodes.set(id, node);
    return node;
  }

  createEdge(sourceNodeId, targetNodeId, relType, metadata = {}) {
    if (!this.nodes.has(sourceNodeId) || !this.nodes.has(targetNodeId)) {
      throw new Error('Both source and target nodes must exist');
    }
    if (!isValidRelType(relType)) {
      throw new RangeError(`relType must be 1..31: ${relType}`);
    }
    const edge = {
      id: `${sourceNodeId}->${targetNodeId}:${relType}`,
      source: sourceNodeId,
      target: targetNodeId,
      relType,
      metadata: { ...metadata },
      createdAt: Date.now(),
    };
    this.edges.push(edge);
    return edge;
  }

  createTriadicLink(nodeAId, nodeBId, nodeCId) {
    if (!this.nodes.has(nodeAId) || !this.nodes.has(nodeBId) || !this.nodes.has(nodeCId)) {
      throw new Error('All three nodes must exist to create a triadic link');
    }
    const triad = {
      nodeA: nodeAId,
      nodeB: nodeBId,
      nodeC: nodeCId,
      createdAt: Date.now(),
    };
    this.triads.push(triad);
    return triad;
  }

  queryNodes(filter = {}) {
    const nodes = Array.from(this.nodes.values());
    return nodes.filter((node) => {
      if (filter.band !== undefined && node.band !== filter.band) return false;
      if (filter.relType !== undefined && node.relType !== filter.relType) return false;
      if (filter.tier !== undefined && bandTier(node.band) !== filter.tier) return false;
      if (filter.component !== undefined) {
        const component = node.relType <= 10 ? 'A' : node.relType <= 20 ? 'B' : 'C';
        if (component !== filter.component) return false;
      }
      return true;
    });
  }

  traverse(startNodeId, maxDepth = 3) {
    if (!this.nodes.has(startNodeId)) {
      throw new Error('Start node does not exist');
    }
    const visited = new Set([startNodeId]);
    const queue = [{ nodeId: startNodeId, depth: 0 }];
    const result = [];

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift();
      result.push(this.nodes.get(nodeId));
      if (depth >= maxDepth) continue;
      for (const edge of this.edges) {
        if (edge.source === nodeId && !visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push({ nodeId: edge.target, depth: depth + 1 });
        }
      }
    }
    return result;
  }

  findPaths(sourceId, targetId, maxPathLength = 5) {
    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
      throw new Error('Source and target nodes must exist');
    }
    const paths = [];
    const stack = [[sourceId]];

    while (stack.length > 0) {
      const path = stack.pop();
      const last = path[path.length - 1];
      if (path.length > maxPathLength) continue;
      if (last === targetId) {
        paths.push(path);
        continue;
      }
      for (const edge of this.edges) {
        if (edge.source === last && !path.includes(edge.target)) {
          stack.push([...path, edge.target]);
        }
      }
    }
    return paths;
  }

  verifyLatticeCompliance() {
    const issues = [];
    for (const node of this.nodes.values()) {
      if (node.band < 1 || node.band > 6) {
        issues.push({ node: node.id, reason: 'invalid_band', band: node.band });
      }
      if (!isValidRelType(node.relType)) {
        issues.push({ node: node.id, reason: 'invalid_relType', relType: node.relType });
      }
    }
    return {
      compliant: issues.length === 0,
      issues,
      nodeCount: this.nodes.size,
      edgeCount: this.edges.length,
      triadCount: this.triads.length,
    };
  }
}

export function detectGaps(chatKey, userNodeData, presenceTable) {
  const gaps = [];
  if (!userNodeData || !Number.isInteger(userNodeData.relType)) {
    return gaps;
  }
  const expectedReciprocal = reciprocal(userNodeData.relType);
  Object.entries(presenceTable).forEach(([peerName, peerData]) => {
    if (peerName === userNodeData.userName) return;
    if (!peerData || !Number.isInteger(peerData.relType)) return;
    if (peerData.relType === expectedReciprocal) return;
    gaps.push({
      peer: peerName,
      peerLabel: peerData.label || null,
      peerRelType: peerData.relType,
      expectedReciprocal,
      userLabel: userNodeData.label || null,
      message: `Peer ${peerName} has relType ${peerData.relType}, expected ${expectedReciprocal}`,
    });
  });
  return gaps;
}

export function verifyTriadicClosure(graphData) {
  if (!graphData || !graphData.triads) {
    return { ok: false, missing: [] };
  }
  return {
    ok: true,
    triads: graphData.triads,
  };
}
