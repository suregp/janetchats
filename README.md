# janetchats
A Chat Agent for Distributed Family Tier Processing Based on the 217 Framework

## What's Done
- Implemented core chat backend: `chat.js` (message handling and agent logic).
- Server and API entrypoint: `server.js` (use `npm start` or `./start.sh`).
- Encryption utilities: `crypto.js`.
- Frontend: `index.html` and `style.css` for a minimal UI.
- Lattice algorithm and helpers: `lattice.js`.
- Simple persistent store/sample data: `database.json`.
- Convenience start script: `start.sh`.
- Documentation: see `ARCHITECTURE.md` and `IMPLEMENTATION_SUMMARY.md` for design details.
- License: MIT (see `LICENSE`).

## How to run
1. Install dependencies:

	```bash
	npm install
	```

2. Start the server:

	```bash
	npm start
	# or
	./start.sh
	```

3. Open your browser to http://localhost:8080

## Tests & Validation

- Run the integration test which exercises gap-detection, minting and halting:

```bash
npm test
```

This will start the server, post presence and a gap-detection payload, print the JSON response and the updated `database.json` showing the `latticeVerification` and wallet changes.

## New API Endpoints

- `POST /api/gap-detection` — checks reciprocity gaps; if gaps are found the server mints a token to the reporting user and marks the chat as halted.
- `POST /api/wallet/mint` — mint tokens (existing).
- `GET  /api/wallet/:chatKey/:userName` — fetch wallet balance (existing).
- `POST /api/training/trigger` — run adaptive training immediately.
- `GET  /api/training/status` — fetch latest adaptive model.

## Notes
- This project is experimental; consult `IMPLEMENTATION_SUMMARY.md` for context and limitations.
- For development, `npm run dev` starts the server similarly to `start`.
