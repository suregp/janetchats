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

## Notes
- This project is experimental; consult `IMPLEMENTATION_SUMMARY.md` for context and limitations.
- For development, `npm run dev` starts the server similarly to `start`.
