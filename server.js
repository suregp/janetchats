import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Import family graph and lattice modules
import { FamilyGraph, detectGaps, verifyTriadicClosure } from './family-graph.js';
import { 
  LATTICE_SIZE, BANDS, TYPES_PER_BAND, OCCUPIED_BANDS, PHASE_SHIFT, DELTA,
  REL_TYPES, REL_TYPE_NAMES, REL_TYPE_LABELS, REL_GROUPS,
  reciprocal, isReciprocal, recordIndex, janetN, latticeX, bandTier,
  vouchesRequired, validateCoordinate, describeNode, allNodes
} from './lattice.js';
import { 
  ENTITY_TYPES, REL_PROPERTIES, getRelProperties, canCompose, 
  composeRelationships, isCompatible, getInverse 
} from './family-taxonomy.js';

const PORT = Number.parseInt(process.env.PORT, 10) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = path.join(__dirname, 'database.json');
const MINT_INCREMENT = 0.9259;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// ============================================================================
// DATABASE UTILITIES & PERSISTENCE
// ============================================================================

function loadDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.error('Error reading database:', e);
      return getDefaultDatabase();
    }
  }
  return getDefaultDatabase();
}

function saveDatabase(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getDefaultDatabase() {
  return {
    chats: {},
    wallets: {},
    presence: {},
    familyGraphs: {}, // { chatKey: { graphJSON } }
    triadicLinks: {}, // { chatKey: [ triadic relationships ] }
    latticeVerification: {} // { chatKey: compliance report }
  };
}

// ============================================================================
// FAMILY GRAPH MANAGEMENT (IN-MEMORY CACHE)
// ============================================================================

const graphCache = {}; // { chatKey: FamilyGraph instance }

function getGraph(chatKey) {
  if (!graphCache[chatKey]) {
    const db = loadDatabase();
    if (db.familyGraphs[chatKey]) {
      graphCache[chatKey] = FamilyGraph.fromJSON(db.familyGraphs[chatKey]);
    } else {
      graphCache[chatKey] = new FamilyGraph();
    }
  }
  return graphCache[chatKey];
}

function saveGraph(chatKey) {
  const db = loadDatabase();
  const graph = graphCache[chatKey];
  if (graph) {
    db.familyGraphs[chatKey] = graph.toJSON();
    saveDatabase(db);
  }
}

// ============================================================================
// API ENDPOINTS: CHAT & PRESENCE
// ============================================================================

// POST: Start a chat session
app.post('/api/chat/start', (req, res) => {
  const { chatKey, userName, band, relType } = req.body;

  if (!chatKey || !userName || band === undefined || relType === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const userNodeData = describeNode(band, relType);
  if (!userNodeData) {
    return res.status(400).json({ error: 'Invalid lattice coordinate' });
  }

  const db = loadDatabase();
  if (!db.presence[chatKey]) {
    db.presence[chatKey] = {};
  }

  db.presence[chatKey][userName] = {
    band,
    relType,
    label: userNodeData.label,
    timestamp: Date.now()
  };

  saveDatabase(db);

  // Add user node to family graph
  const graph = getGraph(chatKey);
  try {
    graph.createNode(`user-${userName}`, band, relType, {
      userName,
      nodeType: ENTITY_TYPES.PERSON,
      timestamp: Date.now()
    });
    saveGraph(chatKey);
  } catch (e) {
    console.error('Error adding user to graph:', e.message);
  }

  res.json({
    success: true,
    userNodeData,
    message: 'Chat session started'
  });
});

// POST: Send a message
app.post('/api/chat/message', (req, res) => {
  const { chatKey, sender, encryptedText, band, relType } = req.body;

  if (!chatKey || !sender || !encryptedText) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = loadDatabase();
  if (!db.chats[chatKey]) {
    db.chats[chatKey] = [];
  }

  const messageObj = {
    sender,
    text: encryptedText,
    timestamp: Date.now(),
    lattice: { band, relType }
  };

  db.chats[chatKey].push(messageObj);
  saveDatabase(db);

  res.json({ success: true, message: 'Message sent' });
});

// GET: Fetch all messages for a chat
app.get('/api/chat/messages/:chatKey', (req, res) => {
  const { chatKey } = req.params;
  const db = loadDatabase();
  const messages = db.chats[chatKey] || [];
  res.json({ messages });
});

// POST: Update presence state
app.post('/api/presence/update', (req, res) => {
  const { chatKey, userName, relType, label, band } = req.body;

  if (!chatKey || !userName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = loadDatabase();
  if (!db.presence[chatKey]) {
    db.presence[chatKey] = {};
  }

  db.presence[chatKey][userName] = {
    relType,
    label,
    band,
    timestamp: Date.now()
  };

  saveDatabase(db);
  res.json({ success: true });
});

// GET: Get presence for a chat
app.get('/api/presence/:chatKey', (req, res) => {
  const { chatKey } = req.params;
  const db = loadDatabase();
  const presence = db.presence[chatKey] || {};
  res.json({ presence });
});

// POST: Leave a chat room
app.post('/api/presence/leave', (req, res) => {
  const { chatKey, userName } = req.body;

  if (!chatKey || !userName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = loadDatabase();
  if (db.presence[chatKey]) {
    delete db.presence[chatKey][userName];
  }
  saveDatabase(db);

  res.json({ success: true });
});

// ============================================================================
// API ENDPOINTS: FAMILY GRAPH & LATTICE
// ============================================================================

// POST: Create a node in the family graph
app.post('/api/graph/node', (req, res) => {
  const { chatKey, entityId, band, relType, metadata } = req.body;

  if (!chatKey || !entityId || band === undefined || relType === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const graph = getGraph(chatKey);
  try {
    const node = graph.createNode(entityId, band, relType, metadata || {});
    saveGraph(chatKey);
    res.json({ success: true, node });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST: Create an edge (relationship) in the family graph
app.post('/api/graph/edge', (req, res) => {
  const { chatKey, sourceNodeId, targetNodeId, relType, metadata } = req.body;

  if (!chatKey || !sourceNodeId || !targetNodeId || !relType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const graph = getGraph(chatKey);
  try {
    const edge = graph.createEdge(sourceNodeId, targetNodeId, relType, metadata || {});
    saveGraph(chatKey);
    res.json({ success: true, edge });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST: Create a triadic link (closure)
app.post('/api/graph/triadic', (req, res) => {
  const { chatKey, nodeAId, nodeBId, nodeCId } = req.body;

  if (!chatKey || !nodeAId || !nodeBId || !nodeCId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const graph = getGraph(chatKey);
  try {
    const triad = graph.createTriadicLink(nodeAId, nodeBId, nodeCId);
    saveGraph(chatKey);
    res.json({ success: true, triad });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET: Query nodes in the family graph
app.get('/api/graph/query', (req, res) => {
  const { chatKey, band, relType, tier, component } = req.query;

  if (!chatKey) {
    return res.status(400).json({ error: 'Missing chatKey' });
  }

  const graph = getGraph(chatKey);
  const filter = {};
  if (band) filter.band = parseInt(band);
  if (relType) filter.relType = parseInt(relType);
  if (tier) filter.tier = tier;
  if (component) filter.component = component;

  const nodes = graph.queryNodes(filter);
  res.json({ nodes });
});

// GET: Traverse the family graph from a starting node
app.get('/api/graph/traverse/:chatKey/:nodeId', (req, res) => {
  const { chatKey, nodeId } = req.params;
  const { maxDepth } = req.query;

  const graph = getGraph(chatKey);
  try {
    const visited = graph.traverse(nodeId, maxDepth ? parseInt(maxDepth) : 3);
    res.json({ success: true, visited });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET: Find paths between two nodes
app.get('/api/graph/paths/:chatKey/:sourceId/:targetId', (req, res) => {
  const { chatKey, sourceId, targetId } = req.params;
  const { maxPathLength } = req.query;

  const graph = getGraph(chatKey);
  try {
    const paths = graph.findPaths(sourceId, targetId, maxPathLength ? parseInt(maxPathLength) : 5);
    res.json({ success: true, paths });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET: Verify lattice compliance
app.get('/api/lattice/compliance/:chatKey', (req, res) => {
  const graph = getGraph(req.params.chatKey);
  const report = graph.verifyLatticeCompliance();
  res.json({ ...report });
});

// POST: Detect gaps in family structure
app.post('/api/gap-detection', (req, res) => {
  const { chatKey, userNodeData } = req.body;

  if (!chatKey || !userNodeData) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = loadDatabase();
  const presenceTable = db.presence[chatKey] || {};

  const gaps = detectGaps(chatKey, userNodeData, presenceTable);

  res.json({
    hasGaps: gaps.length > 0,
    gaps,
    activeCount: Object.keys(presenceTable).filter(name => name !== userNodeData.userName).length
  });
});

// ============================================================================
// API ENDPOINTS: WALLET & TOKENS
// ============================================================================

// POST: Execute token mint
app.post('/api/wallet/mint', (req, res) => {
  const { chatKey, userName, reasonMessage } = req.body;

  if (!chatKey || !userName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const walletKey = `${chatKey}_${userName}`;
  const db = loadDatabase();

  if (!db.wallets[walletKey]) {
    db.wallets[walletKey] = 0.0;
  }

  const newBalance = parseFloat((db.wallets[walletKey] + MINT_INCREMENT).toFixed(4));
  db.wallets[walletKey] = newBalance;

  saveDatabase(db);

  res.json({
    success: true,
    newBalance,
    mintedAmount: MINT_INCREMENT,
    reason: reasonMessage
  });
});

// GET: Get wallet balance
app.get('/api/wallet/:chatKey/:userName', (req, res) => {
  const { chatKey, userName } = req.params;
  const walletKey = `${chatKey}_${userName}`;
  const db = loadDatabase();
  const balance = db.wallets[walletKey] || 0.0;

  res.json({ balance });
});

// ============================================================================
// API ENDPOINTS: LATTICE OPERATIONS
// ============================================================================

// GET: Get all lattice nodes
app.get('/api/lattice/nodes', (req, res) => {
  const nodes = allNodes();
  res.json({ count: nodes.length, nodes });
});

// GET: Get a specific lattice node
app.get('/api/lattice/node/:band/:relType', (req, res) => {
  const { band, relType } = req.params;
  const node = describeNode(parseInt(band), parseInt(relType));
  if (!node) {
    return res.status(400).json({ error: 'Invalid lattice coordinate' });
  }
  res.json(node);
});

// GET: Get lattice properties
app.get('/api/lattice/properties', (req, res) => {
  res.json({
    latticeSize: LATTICE_SIZE,
    bands: BANDS,
    occupiedBands: OCCUPIED_BANDS,
    typesPerBand: TYPES_PER_BAND,
    relTypes: REL_TYPES,
    relGroups: REL_GROUPS
  });
});

// POST: Update lattice node (structure mutation)
app.post('/api/lattice/mutate', (req, res) => {
  const { chatKey, userName, newBand, newRelType } = req.body;

  if (!chatKey || !userName || newBand === undefined || newRelType === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const newNode = describeNode(newBand, newRelType);
  if (!newNode) {
    return res.status(400).json({ error: 'Invalid lattice coordinate' });
  }

  const db = loadDatabase();
  if (!db.familyGraphs[chatKey]) {
    db.familyGraphs[chatKey] = {};
  }

  db.familyGraphs[chatKey][userName] = {
    band: newBand,
    relType: newRelType,
    mutatedAt: Date.now()
  };

  saveDatabase(db);

  res.json({
    success: true,
    newNode,
    message: 'Lattice node mutated'
  });
});

// ============================================================================
// API ENDPOINTS: RELATIONSHIP COMPOSITION & TAXONOMY
// ============================================================================

// GET: Get relationship properties
app.get('/api/taxonomy/rel-properties/:relType', (req, res) => {
  const { relType } = req.params;
  const props = getRelProperties(parseInt(relType));
  if (!props) {
    return res.status(404).json({ error: 'Relationship type not found' });
  }
  res.json(props);
});

// POST: Compose two relationships
app.post('/api/taxonomy/compose', (req, res) => {
  const { relType1, relType2 } = req.body;

  if (relType1 === undefined || relType2 === undefined) {
    return res.status(400).json({ error: 'Missing relType fields' });
  }

  if (!canCompose(relType1, relType2)) {
    return res.json({ canCompose: false, result: null });
  }

  const result = composeRelationships(relType1, relType2);
  res.json({
    canCompose: true,
    relType1,
    relType2,
    result,
    resultLabel: result ? REL_TYPE_LABELS[result] : 'undefined'
  });
});

// GET: Get relationship inverse
app.get('/api/taxonomy/inverse/:relType', (req, res) => {
  const { relType } = req.params;
  const inverse = getInverse(parseInt(relType));
  if (inverse === null) {
    return res.status(404).json({ error: 'No inverse found' });
  }
  res.json({
    relType: parseInt(relType),
    label: REL_TYPE_LABELS[parseInt(relType)],
    inverse,
    inverseLabel: REL_TYPE_LABELS[inverse]
  });
});

// ============================================================================
// API ENDPOINTS: HEALTH & INFO
// ============================================================================

// GET: Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// GET: System info
app.get('/api/info', (req, res) => {
  const db = loadDatabase();
  res.json({
    chatRooms: Object.keys(db.chats).length,
    activeUsers: Object.keys(db.presence).reduce((sum, key) => sum + Object.keys(db.presence[key]).length, 0),
    totalMessages: Object.values(db.chats).reduce((sum, msgs) => sum + msgs.length, 0),
    latticeCompliance: {
      latticeSize: LATTICE_SIZE,
      occupiedBands: OCCUPIED_BANDS,
      occupiedSlots: OCCUPIED_BANDS * TYPES_PER_BAND
    }
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, HOST, () => {
  const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`🚀 JANET Chat Server running on http://${displayHost}:${PORT}`);
  if (HOST === '0.0.0.0') {
    console.log(`🌐 Bound to 0.0.0.0 for public/container access on port ${PORT}`);
  }
  console.log(`📁 Database: ${DB_FILE}`);
  console.log(`📊 Lattice: ${LATTICE_SIZE}-node (${OCCUPIED_BANDS} bands × ${TYPES_PER_BAND} types)`);
  console.log(`📚 API Docs: http://${displayHost}:${PORT}/api/info`);
});
