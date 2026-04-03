const { WebSocketServer } = require('ws');
const http = require('http');

// Create a basic HTTP server to satisfy browser/hosting requirements
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Voice Server is running");
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

wss.on('connection', (ws) => {
    let currentRoom = null;
    let currentIgn = null;

    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);

            if (msg.type === 'join') {
                currentIgn = msg.ign;
                currentRoom = msg.roomId;

                if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Map());
                rooms.get(currentRoom).set(currentIgn, ws);
                
                console.log(`${currentIgn} joined ${currentRoom}`);
                broadcastPlayerList(currentRoom);
            }

            if (msg.type === 'audio' && currentRoom) {
                const players = rooms.get(currentRoom);
                players.forEach((client, ign) => {
                    // Send to everyone EXCEPT the person speaking
                    if (ign !== currentIgn && client.readyState === 1) {
                        client.send(JSON.stringify({
                            type: 'audio',
                            data: msg.data
                        }));
                    }
                });
            }
        } catch (e) { console.error(e); }
    });

    ws.on('close', () => {
        if (currentRoom && rooms.has(currentRoom)) {
            rooms.get(currentRoom).delete(currentIgn);
            if (rooms.get(currentRoom).size === 0) rooms.delete(currentRoom);
            else broadcastPlayerList(currentRoom);
        }
    });
});

function broadcastPlayerList(roomId) {
    const playersInRoom = Array.from(rooms.get(roomId).keys());
    rooms.get(roomId).forEach((client) => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'players', players: playersInRoom }));
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server live on port ${PORT}`);
});