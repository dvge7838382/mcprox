const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. Setup the HTTP Server to serve the HTML file
const server = http.createServer((req, res) => {
    // This tells the browser: "The following data is a Website (HTML)"
    if (req.url === '/' || req.url === '/index.html') {
        const filePath = path.join(__dirname, 'index.html');
        
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end("Error: index.html not found in this folder!");
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end("Not Found");
    }
});

const wss = new WebSocketServer({ server });
const rooms = new Map();
const roomVolumes = new Map(); 

wss.on('connection', (ws) => {
    let currentRoom = null;
    let currentIgn = null;

    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);

            // DATA FROM TRACKER APP (PC)
            if (msg.type === 'update_volumes') {
                roomVolumes.set(msg.roomId, msg.volumes);
                return; 
            }

            // PLAYER JOIN LOGIC (WEB)
            if (msg.type === 'join') {
                currentIgn = msg.ign;
                currentRoom = msg.roomId;
                if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Map());
                rooms.get(currentRoom).set(currentIgn, ws);
                broadcastPlayerList(currentRoom);
            }

            // AUDIO RELAY WITH VOLUME MAPPING
            if (msg.type === 'audio' && currentRoom) {
                const players = rooms.get(currentRoom);
                const volumes = roomVolumes.get(currentRoom) || [];

                players.forEach((client, targetIgn) => {
                    if (targetIgn !== currentIgn && client.readyState === 1) {
                        const link = volumes.find(v => 
                            (v.p1 === currentIgn && v.p2 === targetIgn) || 
                            (v.p1 === targetIgn && v.p2 === currentIgn)
                        );

                        const volLevel = link ? link.vol : 0;
                        if (volLevel > 0) {
                            client.send(JSON.stringify({
                                type: 'audio',
                                data: msg.data,
                                volume: volLevel 
                            }));
                        }
                    }
                });
            }
        } catch (e) { console.error(e); }
    });

    ws.on('close', () => {
        if (currentRoom && rooms.has(currentRoom)) {
            rooms.get(currentRoom).delete(currentIgn);
            broadcastPlayerList(currentRoom);
        }
    });
});

function broadcastPlayerList(roomId) {
    if (!rooms.has(roomId)) return;
    const playersInRoom = Array.from(rooms.get(roomId).keys());
    rooms.get(roomId).forEach((client) => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'players', players: playersInRoom }));
        }
    });
}

// Start on Port 10000 for consistency with Render
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`\x1b[32mWebsite live at: http://localhost:${PORT}\x1b[0m`);
});