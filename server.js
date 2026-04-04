const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    // FIX: This ensures the server finds index.html even if paths are weird
    const file = path.join(process.cwd(), 'index.html');
    if (fs.existsSync(file)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(file).pipe(res);
    } else {
        res.writeHead(404);
        res.end("index.html not found in " + process.cwd());
    }
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // RoomID -> Map(Name -> Socket)
const syncs = new Map(); // RoomID -> Rules

wss.on('connection', (ws) => {
    let currRoom = null;
    let currName = null;

    ws.on('message', (data) => {
        try {
            const m = JSON.parse(data);

            // 1. TRACKER SYNC
            if (m.type === 'sync_rules') {
                syncs.set(m.roomId, m.rules);
                const clients = rooms.get(m.roomId);
                if (clients) {
                    clients.forEach(c => c.send(JSON.stringify({ type: 'vol_update', rules: m.rules })));
                }
            }

            // 2. WEBSITE JOIN
            if (m.type === 'join') {
                currRoom = m.roomId;
                currName = m.ign;
                if (!rooms.has(currRoom)) rooms.set(currRoom, new Map());
                rooms.get(currRoom).set(currName, ws);
                
                // Tell everyone in the room to refresh their list
                const names = Array.from(rooms.get(currRoom).keys());
                rooms.get(currRoom).forEach(c => c.send(JSON.stringify({ type: 'players', players: names })));
            }

            // 3. AUDIO ROUTING
            if (m.type === 'audio' && currRoom) {
                const rules = syncs.get(currRoom) || [];
                const clients = rooms.get(currRoom);
                clients.forEach((client, name) => {
                    if (name === currName) return;
                    const rule = rules.find(r => 
                        (r.a === currName && r.b === name) || (r.a === name && r.b === currName)
                    );
                    if (rule && rule.v > 0) {
                        client.send(JSON.stringify({ type: 'audio', data: m.data, volume: rule.v, from: currName }));
                    }
                });
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        if (currRoom && rooms.has(currRoom)) {
            rooms.get(currRoom).delete(currName);
            const names = Array.from(rooms.get(currRoom).keys());
            rooms.get(currRoom).forEach(c => c.send(JSON.stringify({ type: 'players', players: names })));
        }
    });
});

server.listen(process.env.PORT || 10000);