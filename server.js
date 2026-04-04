const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. Create HTTP Server to serve the UI and handle WebSockets
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end("Error loading index.html");
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

const wss = new WebSocketServer({ server });

// Memory storage for Rooms
const roomSync = new Map();   // Stores { roomId: [ {a, b, v}, ... ] }
const roomClients = new Map(); // Stores { roomId: Map(ign => ws) }

wss.on('connection', (ws) => {
    let myRoom = null;
    let myName = null;

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);

            // A. DATA FROM TRACKER APP (.exe)
            if (msg.type === 'sync_room') {
                // Update the volume rules for this specific 12-digit room
                roomSync.set(msg.roomId, msg.volumes);
                return;
            }

            // B. WEBSITE JOIN LOGIC
            if (msg.type === 'join') {
                myRoom = msg.roomId;
                myName = msg.ign;

                if (!roomClients.has(myRoom)) {
                    roomClients.set(myRoom, new Map());
                }
                
                roomClients.get(myRoom).set(myName, ws);
                console.log(`[JOIN] ${myName} entered Room: ${myRoom}`);
                
                broadcastPlayerList(myRoom);
            }

            // C. AUDIO REGULATION LOGIC
            if (msg.type === 'audio' && myRoom && myName) {
                const currentRules = roomSync.get(myRoom) || [];
                const neighbors = roomClients.get(myRoom);

                if (!neighbors) return;

                neighbors.forEach((client, targetName) => {
                    // Don't send my own voice back to me
                    if (targetName === myName) return;

                    // Find if Tracker App says these two are close enough
                    const link = currentRules.find(l => 
                        (l.a === myName && l.b === targetName) || 
                        (l.a === targetName && l.b === myName)
                    );

                    // Only send audio if volume > 0 and client is connected
                    if (link && link.v > 0 && client.readyState === 1) {
                        client.send(JSON.stringify({
                            type: 'audio',
                            from: myName,
                            data: msg.data,
                            volume: link.v // Regulated volume level (0.0 to 1.0)
                        }));
                    }
                });
            }
        } catch (e) {
            console.error("Error processing message:", e);
        }
    });

    ws.on('close', () => {
        if (myRoom && roomClients.has(myRoom)) {
            roomClients.get(myRoom).delete(myName);
            broadcastPlayerList(myRoom);
            console.log(`[LEAVE] ${myName} left Room: ${myRoom}`);
        }
    });
});

function broadcastPlayerList(roomId) {
    const room = roomClients.get(roomId);
    if (!room) return;
    
    const names = Array.from(room.keys());
    room.forEach((client) => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'players', players: names }));
        }
    });
}

// Render's required Port logic
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on Port: ${PORT}`);
});