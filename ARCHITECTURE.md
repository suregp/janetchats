# JANET Chat - Backend Architecture

A decentralized chat application based on the 217-node lattice framework with server-side persistent storage and gap detection.

## 🚀 New Architecture

### Before (Browser-Only)
- All data stored in browser `localStorage`
- Family graph calculations in `lattice.js` (browser)
- Gap detection and minting logic in `chat.js` (browser)
- No persistent storage between sessions

### After (Node.js Backend)
- **Node.js/Express Server** (`server.js`) running on port 8080 by default
- **Persistent File Storage** (`database.json`) for:
  - Chat messages
  - Wallet balances
  - User presence state
  - Family graph mutations
- **Backend API Endpoints** for all critical operations
- **Browser Frontend** now communicates via REST API calls using `fetch()`

## 📁 Project Structure

```
janetchats/
├── server.js                 # Node.js/Express backend (NEW)
├── package.json             # Node.js dependencies (NEW)
├── database.json            # Persistent data file (auto-created)
├── .gitignore              # Ignore node_modules & database.json (NEW)
├── index.html              # Chat UI (unchanged)
├── chat.js                 # Frontend logic (UPDATED - uses API)
├── lattice.js              # Family graph definitions (unchanged)
├── crypto.js               # Encryption utilities (unchanged)
├── style.css               # Styling (unchanged)
└── README.md               # This file
```

## 🔧 Installation & Setup

### Prerequisites
- Node.js 14+ and npm
- A terminal

### Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   ```
   
   Server will run on `http://localhost:8080` by default or use `PORT=XXXX npm start` to override.

3. **Access the App**
   - Open browser to `http://localhost:8080`
   - Fill in chat credentials and lattice coordinates
   - Start chatting!

## 📡 API Endpoints

### Chat Management
- **POST** `/api/chat/start` - Initialize a chat session
- **POST** `/api/chat/message` - Send an encrypted message
- **GET** `/api/chat/messages/:chatKey` - Fetch all messages

### Presence & Reciprocity
- **POST** `/api/presence/update` - Update user presence state
- **GET** `/api/presence/:chatKey` - Get all active users in room
- **POST** `/api/presence/leave` - Remove user from room

### Gap Detection
- **POST** `/api/gap-detection` - Check for lattice reciprocity violations
- Returns detected gaps and active peer count

### Wallet & Token Minting
- **POST** `/api/wallet/mint` - Execute token mint operation
- **GET** `/api/wallet/:chatKey/:userName` - Get wallet balance

### Lattice Mutations
- **POST** `/api/lattice/mutate` - Update user's lattice node coordinate

### Utilities
- **GET** `/api/lattice-config` - Get lattice definitions
- **GET** `/api/health` - Health check endpoint

## 💾 Persistent Storage (database.json)

```json
{
  "chats": {
    "room-123": [
      { "sender": "Alice", "text": "encrypted...", "timestamp": 1623456789, "lattice": {} }
    ]
  },
  "wallets": {
    "room-123_Alice": 2.7777,
    "room-123_Bob": 1.8518
  },
  "presence": {
    "room-123": {
      "Alice": { "relType": 1, "label": "Parent", "band": 1, "timestamp": 1623456789 }
    }
  },
  "familyGraphs": {
    "room-123": {
      "Alice": { "band": 1, "relType": 1, "mutatedAt": 1623456789 }
    }
  }
}
```

## 🔐 Encryption

- Messages are encrypted **client-side** using XOR cipher
- Shared secret is entered by users (not stored on server)
- Server stores encrypted text; only clients can decrypt

## 🔄 Key Changes to Browser Code

### Before (localStorage)
```javascript
localStorage.setItem(walletKey, balance.toString());
```

### After (API)
```javascript
fetch(`${API_BASE}/wallet/mint`, {
  method: 'POST',
  body: JSON.stringify({ chatKey, userName, reasonMessage })
});
```

### Added in chat.js
```javascript
const API_BASE = '/api';
```

## 🌐 Server Logic Moved

### From Browser → Server
- **Family graph lattice calculations** (`describeNode`, `reciprocal`, `validateCoordinate`)
- **Gap detection algorithm** (reciprocity verification)
- **Wallet balance management**
- **Presence state management**
- **Message persistence**

### Remains in Browser
- UI rendering
- Encryption/decryption
- User input handling

## ✅ Testing

1. Open two browser windows to `http://localhost:8080`
2. Use the same invite code and shared secret
3. Choose lattice coordinates that satisfy reciprocity (e.g., Parent & Child)
4. Send messages - they should appear encrypted in both windows
5. Check `database.json` to see persisted data
6. Restart server - data should persist!

## 🔧 Development

To monitor the database in real-time:
```bash
cat database.json | jq '.'  # Pretty-print JSON
```

Or use a file watcher:
```bash
watch 'cat database.json | jq .'
```

## 📝 Notes

- The server currently stores all data in a single `database.json` file
- For production, consider migrating to a real database (MongoDB, PostgreSQL)
- CORS is not configured - server and client must run on same machine or update CORS policy
- API responses are not authenticated - in production, add JWT or session tokens

## 🚀 Future Enhancements

- [ ] Database migration (MongoDB/PostgreSQL)
- [ ] Authentication & authorization
- [ ] CORS configuration for remote clients
- [ ] WebSocket for real-time updates (instead of polling)
- [ ] Data backup & versioning
- [ ] Rate limiting & abuse prevention
- [ ] User account system
- [ ] Admin dashboard for viewing chat statistics

---

**JANET: Joint Antisymmetric Node Equilibrium Trajectory**
