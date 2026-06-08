let chatKey = "";
let secretKey = "";
let userName = "";
let userNodeData = null;
let lastMessageTimestamp = 0;
let pollInterval;
let isMatrixLocked = false;

const MINT_INCREMENT = 0.9259;
let activeConflictDetected = false;

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

    userNodeData = describeNode(selectedBand, selectedRelType);
    if (!userNodeData) {
        alert("Invalid Lattice Coordinate configuration selected.");
        return;
    }

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
}

function executeTokenMint(reasonMessage) {
    const walletKey = `chat_${chatKey}_wallet_${userName}`;
    let balance = parseFloat(localStorage.getItem(walletKey)) || 0.0;
    balance = parseFloat((balance + MINT_INCREMENT).toFixed(4));
    localStorage.setItem(walletKey, balance.toString());
    
    refreshWalletDisplay();

    const mintLog = document.getElementById('mint-notification-log');
    mintLog.innerHTML = `💎 <strong>MINT OPERATION SUCCESSFUL:</strong> +${MINT_INCREMENT} Units generated.<br><small>${reasonMessage}</small>`;
    mintLog.classList.remove('hidden');
    
    setTimeout(() => { mintLog.classList.add('hidden'); }, 6000);
}

function refreshWalletDisplay() {
    const walletKey = `chat_${chatKey}_wallet_${userName}`;
    const balance = parseFloat(localStorage.getItem(walletKey)) || 0.0;
    document.getElementById('wallet-balance').innerText = balance.toFixed(4);
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
    const presenceKey = `chat_${chatKey}_presence`;
    let presenceTable = JSON.parse(localStorage.getItem(presenceKey)) || {};
    
    presenceTable[userName] = {
        relType: userNodeData.relType,
        label: userNodeData.label,
        timestamp: Date.now()
    };
    localStorage.setItem(presenceKey, JSON.stringify(presenceTable));
}

function leaveRoom() {
    const presenceKey = `chat_${chatKey}_presence`;
    let presenceTable = JSON.parse(localStorage.getItem(presenceKey)) || {};
    delete presenceTable[userName];
    localStorage.setItem(presenceKey, JSON.stringify(presenceTable));
}

function verifyMatrixReciprocity() {
    const presenceKey = `chat_${chatKey}_presence`;
    const presenceTable = JSON.parse(localStorage.getItem(presenceKey)) || {};
    const conflictBanner = document.getElementById('matrix-conflict-banner');
    const msgInput = document.getElementById('msg-input');
    const sendBtn = document.getElementById('send-btn');
    
    const now = Date.now();
    const activePeers = Object.entries(presenceTable).filter(([name, data]) => {
        return name !== userName && (now - data.timestamp < 5000);
    });

    if (activePeers.length === 0) {
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
    activePeers.forEach(([peerName, peerData]) => {
        if (!isReciprocal(userNodeData.relType, peerData.relType)) {
            dynamicConflicts.push(
                `Lattice Conflict with <strong>${peerName}</strong>! You: [${userNodeData.label}], Peer: [${peerData.label}]. broken ℛ reciprocity rule! Expected match: [${userNodeData.reciprocalLabel}].`
            );
        }
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
    } else {
        isMatrixLocked = false;
        conflictBanner.classList.add('hidden');
        msgInput.disabled = false;
        sendBtn.disabled = false;
        activeConflictDetected = false;
        if (msgInput.placeholder === "Chat locked until conflict is resolved...") {
            msgInput.placeholder = "Type a message...";
        }
    }
}

function sendMsg() {
    if (isMatrixLocked) return;
    const input = document.getElementById('msg-input');
    const msgText = input.value.trim();
    if (!msgText) return;

    const fullMessage = `${userName}: ${msgText}`;
    const encryptedMessage = encryptDecrypt(fullMessage, secretKey);
    
    const messageObj = {
        sender: userName,
        text: encryptedMessage,
        timestamp: Date.now(),
        lattice: { band: userNodeData.band, relType: userNodeData.relType }
    };

    const storageKey = `chat_${chatKey}`;
    let chatLog = JSON.parse(localStorage.getItem(storageKey)) || [];
    chatLog.push(messageObj);
    localStorage.setItem(storageKey, JSON.stringify(chatLog));

    input.value = '';
    fetchMessages();
}

function fetchMessages() {
    const storageKey = `chat_${chatKey}`;
    const chatLog = JSON.parse(localStorage.getItem(storageKey)) || [];
    const messagesDiv = document.getElementById('messages');
    
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
