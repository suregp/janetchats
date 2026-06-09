const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = Number.parseInt(process.env.PORT, 10) || 8080;
const DB_FILE = path.join(__dirname, 'database.json');

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// ============================================================================
// DATABASE UTILITIES
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
    familyGraphs: {}
  };
}

// ============================================================================
// LATTICE & GAP DETECTION LOGIC (moved from browser)
// ============================================================================

const LATTICE_SIZE = 217;
const BANDS = 7;
const TYPES_PER_BAND = 31;
const OCCUPIED_BANDS = 6;
const PHASE_SHIFT = 108;
const DELTA = 25 / 27;
const MINT_INCREMENT = 0.9259;

const REL_TYPES = {
  PARENT: 1, GRANDPARENT: 2, GREAT_GRANDPARENT: 3, GREAT_GREAT_GRANDPARENT: 4,
  AUNT_UNCLE: 5, GREAT_AUNT_UNCLE: 6, STEP_PARENT: 7, FOSTER_PARENT: 8,
  GUARDIAN: 9, ANCESTOR: 10,
  CHILD: 11, GRANDCHILD: 12, GREAT_GRANDCHILD: 13, GREAT_GREAT_GRANDCHILD: 14,
  NIECE_NEPHEW: 15, ADOPTIVE_CHILD: 16, STEP_CHILD: 17, FOSTER_CHILD: 18,
  WARD: 19, DESCENDANT: 20,
  SIBLING: 21, HALF_SIBLING: 22, STEP_SIBLING: 23, COUSIN: 24,
  SECOND_COUSIN: 25, SPOUSE: 26, EX_SPOUSE: 27, DOMESTIC_PARTNER: 28,
  COMPANION: 29, PARENT_IN_LAW: 30, SIBLING_IN_LAW: 31,
};

const REL_TYPE_NAMES = Object.fromEntries(
  Object.entries(REL_TYPES).map(([name, id]) => [id, name])
);

const REL_TYPE_LABELS = {
  1: 'Parent', 2: 'Grandparent', 3: 'Great-grandparent', 4: 'Great-great-grandparent',
  5: 'Aunt / Uncle', 6: 'Great-aunt / Uncle', 7: 'Step-parent', 8: 'Foster parent',
  9: 'Guardian', 10: 'Ancestor',
  11: 'Child', 12: 'Grandchild', 13: 'Great-grandchild', 14: 'Great-great-grandchild',
  15: 'Niece / Nephew', 16: 'Adoptive child', 17: 'Step-child', 18: 'Foster child',
  19: 'Ward', 20: 'Descendant',
  21: 'Sibling', 22: 'Half-sibling', 23: 'Step-sibling', 24: 'Cousin',
  25: 'Second cousin', 26: 'Spouse', 27: 'Ex-spouse', 28: 'Domestic partner',
  29: 'Companion', 30: 'Parent-in-law', 31: 'Sibling-in-law',
};

function reciprocal(k) {
  if (k >= 1 && k <= 10) return k + 10;
  if (k >= 11 && k <= 20) return k - 10;
  if (k >= 21 && k <= 29) return k;
  if (k === 30) return 31;
  if (k === 31) return 30;
  throw new Error(`Invalid rel_type: ${k}`);
}

function isReciprocal(inviterType, inviteeType) {
  return reciprocal(inviterType) === inviteeType;
}

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

function bandTier(band) {
  if (band <= 2) return 'hot';
  if (band <= 4) return 'warm';
  return 'cold';
}

function vouchesRequired(band) {
  if (band <= 2) return 0;
  if (band <= 4) return 1;
  return 2;
}

function validateCoordinate(band, relType) {
  if (band < 1 || band > OCCUPIED_BANDS)
    return { valid: false, reason: `Band ${band} is out of occupied range (1–${OCCUPIED_BANDS})` };
  if (relType < 1 || relType > TYPES_PER_BAND)
    return { valid: false, reason: `rel_type ${relType} is out of range (1–31)` };
  return { valid: true, index: recordIndex(band, relType) };
}

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

// ============================================================================
// GAP DETECTION LOGIC
// ============================================================================

function detectGaps(chatKey, userNodeData, presenceTable) {
  const gaps = [];
  const now = Date.now();
  const activePeers = Object.entries(presenceTable).filter(([name, data]) => {
    return name !== userNodeData.userName && (now - data.timestamp < 5000);
  });

  activePeers.forEach(([peerName, peerData]) => {
    if (!isReciprocal(userNodeData.relType, peerData.relType)) {
      gaps.push({
        peer: peerName,
        userLabel: userNodeData.label,
        peerLabel: peerData.label,
        expectedReciprocal: userNodeData.reciprocalLabel,
        severity: 'conflict'
      });
    }
  });

  return gaps;
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

// GET: Serve lattice.js and crypto.js for browser (ensures frontend has all definitions)
app.get('/api/lattice-config', (req, res) => {
  res.json({
    REL_TYPE_LABELS,
    REL_TYPE_NAMES,
    BANDS,
    TYPES_PER_BAND,
    OCCUPIED_BANDS
  });
});

// POST: Start a chat session
app.post('/api/chat/start', (req, res) => {
  const { chatKey, userName, band, relType } = req.body;

  if (!chatKey || !userName || !band || !relType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const userNodeData = describeNode(band, relType);
  if (!userNodeData) {
    return res.status(400).json({ error: 'Invalid lattice coordinate' });
  }

  const db = loadDatabase();
  if (!db.chats[chatKey]) {
    db.chats[chatKey] = [];
  }
  if (!db.presence[chatKey]) {
    db.presence[chatKey] = {};
  }
  if (!db.wallets[`${chatKey}_${userName}`]) {
    db.wallets[`${chatKey}_${userName}`] = 0.0;
  }

  db.presence[chatKey][userName] = {
    relType,
    label: userNodeData.label,
    band,
    timestamp: Date.now()
  };

  saveDatabase(db);

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`🚀 JANET Chat Server running on http://localhost:${PORT}`);
  console.log(`📁 Database: ${DB_FILE}`);
});
