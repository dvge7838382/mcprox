const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. CREATE THE HTTP SERVER TO SERVE THE HTML FILE
const server = http.createServer((req, res) => {
    // This tells the server: if someone visits the URL, give them index.html
    let filePath = path.join(__dirname, 'index.html');

    fs.readFile(filePath, (err, content) => {
        if (err) {
            // If the file is missing, show this error
            res.writeHead(500);
            res.end(`Error: index.html not found in ${__dirname}`);
            console.error("File Read Error:", err);
            return;
        }
        // Success: Send the HTML file
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content, 'utf-8');
    });
});

// 2. SETUP WEBSOCKETS ON THE SAME SERVER
const wss = new WebSocketServer({ server });

const roomSync = new Map(); 
const roomClients = new Map(); 

wss.on('connection', (ws) => {
    let myRoom = null;
    let myName = null;

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);

            // Tracker sends volume rules
            if (msg.type === 'sync_rules') {
                roomSync.set(msg.roomId, msg.rules);
                return;
            }

            // User joins from website
            if (msg.type === 'join') {
                myRoom = msg.roomId;
                myName = msg.ign;
                if (!roomClients.has(myRoom)) roomClients.set(myRoom, new Map());
                roomClients.get(myRoom).set(myName, ws);
                broadcastPlayers(myRoom);
            }

            // Audio routing logic
            if (msg.type === 'audio' && myRoom) {
                const rules = roomSync.get(myRoom) || [];
                const neighbors = roomClients.get(myRoom);

                neighbors.forEach((client, targetName) => {
                    if (targetName === myName) return;

                    // Match names (Case-Insensitive)
                    const rule = rules.find(r => 
                        (r.a.toLowerCase() === myName.toLowerCase() && r.b.toLowerCase() === targetName.toLowerCase()) || 
                        (r.a.toLowerCase() === targetName.toLowerCase() && r.b.toLowerCase() === myName.toLowerCase())
                    );

                    if (rule && rule.v > 0 && client.readyState === 1) {
                        client.send(JSON.stringify({ 
                            type: 'audio', 
                            data: msg.data, 
                            volume: rule.v, 
                            from: myName 
                        }));
                    }
                });
            }
        } catch (e) { console.error("Socket Error:", e); }
    });

    ws.on('close', () => {
        if (myRoom && roomClients.has(myRoom)) {
            roomClients.get(myRoom).delete(myName);
            broadcastPlayers(myRoom);
        }
    });
});

function broadcastPlayers(roomId) {
    if (!roomClients.has(roomId)) return;
    const names = Array.from(roomClients.get(roomId).keys());
    roomClients.get(roomId).forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'players', players: names }));
        }
    });
}

// 3. START SERVER
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
