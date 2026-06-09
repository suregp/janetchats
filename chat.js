let chatKey = "";
let secretKey = "";
let userName = "";
let userNodeData = null;
let lastMessageTimestamp = 0;
let pollInterval;
let isMatrixLocked = false;

const MINT_INCREMENT = 0.9259;
let activeConflictDetected = false;

const API_BASE = 'http://localhost:3000/api';

document.addEventListener("DOMContentLoaded", () => {
    const relSelect = document.getElementById('lattice-reltype');
    const editRelSelect = document.getElementById('edit-lattice-reltype');
    
    if (typeof REL_TYPE_LABELS !== 'undefined') {
        Object.entries(REL_TYPE_LABELS).forEach(([id, label]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = `${label} (ID: ${id})`;
            
            if (relSelect) relSelect.appendChild(opt.cloneNode(true));
            if (editRelSelect) editRelSelect.appendChild(opt);
        });
    }
});

function uiGenerateSecret() {
    document.getElementById('shared-secret').value = generateRandomSecret(12);
}

function startChat() {
    chatKey = document.getElementById('invite-code').value.trim();
    secretKey = document.getElementById('shared-secret').value.trim();
    userName = document.getElementById('username').value.trim();
    
    const selectedBand = parseInt(document.getElementById('lattice-band').value);
    const selectedRelType = parseInt(document.getElementById('lattice-reltype').value);

    if (!chatKey || !secretKey || !userName) {
        alert("Please fill in all fields!");
        return;
    }

    // Call backend to start chat session
    fetch(`${API_BASE}/chat/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chatKey,
            userName,
            band: selectedBand,
            relType: selectedRelType
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert(`Error: ${data.error}`);
            return;
        }

        userNodeData = data.userNodeData;
        
        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('chat-screen').classList.remove('hidden');
        document.getElementById('room-title').innerText = `Room: ${chatKey} as ${userName}`;

        document.getElementById('edit-lattice-band').value = userNodeData.band;
        document.getElementById('edit-lattice-reltype').value = userNodeData.relType;

        renderNodeMetadataBar();
        refreshWalletDisplay();
        updatePresenceState();

        pollInterval = setInterval(() => {
            fetchMessages();
            verifyMatrixReciprocity();
            updatePresenceState(); 
        }, 500);

        window.addEventListener('beforeunload', leaveRoom);
    })
    .catch(err => {
        console.error('Error starting chat:', err);
        alert('Failed to connect to server. Is it running on port 3000?');
    });
}

function executeTokenMint(reasonMessage) {
    fetch(`${API_BASE}/wallet/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chatKey,
            userName,
            reasonMessage
        })
    })
    .then(res => res.json())
    .then(data => {
        if (!data.error) {
            refreshWalletDisplay();
            const mintLog = document.getElementById('mint-notification-log');
            mintLog.innerHTML = `💎 <strong>MINT OPERATION SUCCESSFUL:</strong> +${MINT_INCREMENT} Units generated.<br><small>${reasonMessage}</small>`;
            mintLog.classList.remove('hidden');
            setTimeout(() => { mintLog.classList.add('hidden'); }, 6000);
        }
    })
    .catch(err => console.error('Error minting token:', err));
}

function refreshWalletDisplay() {
    fetch(`${API_BASE}/wallet/${chatKey}/${userName}`)
        .then(res => res.json())
        .then(data => {
            document.getElementById('wallet-balance').innerText = data.balance.toFixed(4);
        })
        .catch(err => console.error('Error fetching wallet:', err));
}

function mutateFamilyStructure() {
    const nextBand = parseInt(document.getElementById('edit-lattice-band').value);
    const nextRel = parseInt(document.getElementById('edit-lattice-reltype').value);
    
    if (nextBand === userNodeData.band && nextRel === userNodeData.relType) return;

    const updatedNode = describeNode(nextBand, nextRel);
    if (!updatedNode) {
        alert("Invalid coordinate migration path.");
        return;
    }

    const previousLabel = userNodeData.label;
    userNodeData = updatedNode;

    // Persist mutation to backend
    fetch(`${API_BASE}/lattice/mutate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chatKey,
            userName,
            newBand: nextBand,
            newRelType: nextRel
        })
    })
    .catch(err => console.error('Error mutating lattice:', err));

    renderNodeMetadataBar();
    updatePresenceState();
    executeTokenMint(`User mutated structure from [${previousLabel}] to [${userNodeData.label}].`);
}

function renderNodeMetadataBar() {
    const infoBar = document.getElementById('node-info-bar');
    infoBar.className = `tier-${userNodeData.tier}`;
    infoBar.innerHTML = `
        <strong>Lattice Node:</strong> ${userNodeData.label} (${userNodeData.group}/${userNodeData.component})<br>
        <strong>Matrix Address:</strong> Index ${userNodeData.recordIndex} | JANET_n ${userNodeData.janetN} | Coordinate X: ${userNodeData.x}<br>
        <strong>Sync Tier:</strong> ${userNodeData.tier.toUpperCase()} (${userNodeData.vouchesRequired} vouches required) | Expected Reciprocal: ${userNodeData.reciprocalLabel}
    `;
}

function updatePresenceState() {
    if (!chatKey || !userName || !userNodeData) return;
    
    fetch(`${API_BASE}/presence/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chatKey,
            userName,
            relType: userNodeData.relType,
            label: userNodeData.label,
            band: userNodeData.band
        })
    })
    .catch(err => console.error('Error updating presence:', err));
}

function leaveRoom() {
    fetch(`${API_BASE}/presence/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatKey, userName })
    })
    .catch(err => console.error('Error leaving room:', err));
}

function verifyMatrixReciprocity() {
    if (!chatKey || !userNodeData) return;

    fetch(`${API_BASE}/gap-detection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chatKey,
            userNodeData: {
                ...userNodeData,
                userName
            }
        })
    })
    .then(res => res.json())
    .then(data => {
        const conflictBanner = document.getElementById('matrix-conflict-banner');
        const msgInput = document.getElementById('msg-input');
        const sendBtn = document.getElementById('send-btn');

        if (!data.hasGaps) {
            conflictBanner.classList.add('hidden');
            if (isMatrixLocked) {
                isMatrixLocked = false;
                msgInput.disabled = false;
                sendBtn.disabled = false;
                msgInput.placeholder = "Type a message...";
                activeConflictDetected = false;
            }
            return;
        }

        let dynamicConflicts = [];
        data.gaps.forEach(gap => {
            dynamicConflicts.push(
                `Lattice Conflict with <strong>${gap.peer}</strong>! You: [${gap.userLabel}], Peer: [${gap.peerLabel}]. Broken ℛ reciprocity rule! Expected match: [${gap.expectedReciprocal}].`
            );
        });

        if (dynamicConflicts.length > 0) {
            isMatrixLocked = true;
            conflictBanner.innerHTML = dynamicConflicts.join('<br><br>');
            conflictBanner.classList.remove('hidden');
            msgInput.disabled = true;
            sendBtn.disabled = true;
            msgInput.placeholder = "Chat locked until conflict is resolved...";

            if (!activeConflictDetected) {
                activeConflictDetected = true;
                executeTokenMint("Structural reciprocity violation incurred between active network nodes.");
            }
        }
    })
    .catch(err => console.error('Error verifying matrix reciprocity:', err));
}

function sendMsg() {
    if (isMatrixLocked) return;
    const input = document.getElementById('msg-input');
    const msgText = input.value.trim();
    if (!msgText) return;

    const fullMessage = `${userName}: ${msgText}`;
    const encryptedMessage = encryptDecrypt(fullMessage, secretKey);
    
    fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chatKey,
            sender: userName,
            encryptedText: encryptedMessage,
            band: userNodeData.band,
            relType: userNodeData.relType
        })
    })
    .then(res => res.json())
    .then(data => {
        if (!data.error) {
            input.value = '';
            fetchMessages();
        }
    })
    .catch(err => console.error('Error sending message:', err));
}

function fetchMessages() {
    fetch(`${API_BASE}/chat/messages/${chatKey}`)
        .then(res => res.json())
        .then(data => {
            const messagesDiv = document.getElementById('messages');
            const chatLog = data.messages || [];
            
            if (messagesDiv.innerHTML === "") lastMessageTimestamp = 0;
            let hasNew = false;

            chatLog.forEach(msg => {
                if (msg.timestamp > lastMessageTimestamp) {
                    hasNew = true;
                    try {
                        const decrypted = encryptDecrypt(msg.text, secretKey);
                        if (decrypted.startsWith(msg.sender)) {
                            const cleanText = decrypted.substring(msg.sender.length + 2);
                            displayMessage(msg.sender, cleanText, msg.lattice);
                        }
                    } catch (e) { console.error(e); }
                    lastMessageTimestamp = msg.timestamp;
                }
            });
            if (hasNew) { messagesDiv.scrollTop = messagesDiv.scrollHeight; }
        })
        .catch(err => console.error('Error fetching messages:', err));
}

function displayMessage(sender, text, peerLattice) {
    const messagesDiv = document.getElementById('messages');
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    
    let systemTag = peerLattice ? ` [${REL_TYPE_LABELS[peerLattice.relType] || "Unknown"}, B${peerLattice.band}]` : "";

    if (sender === userName) {
        msgDiv.classList.add('sent');
        msgDiv.innerText = `You${systemTag}: ${text}`;
    } else {
        msgDiv.classList.add('received');
        msgDiv.innerText = `${sender}${systemTag}: ${text}`;
    }
    messagesDiv.appendChild(msgDiv);
}
