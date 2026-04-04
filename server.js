const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    const filePath = path.resolve(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("index.html not found in " + __dirname);
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
    });
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); 
const syncs = new Map(); 

wss.on('connection', (ws) => {
    let myRoom = null, myName = null;

    ws.on('message', (raw) => {
        try {
            const m = JSON.parse(raw);

            // TRACKER SYNC: Update volume rules for the room
            if (m.type === 'sync_rules') {
                syncs.set(m.roomId, m.rules);
                rooms.get(m.roomId)?.forEach(c => {
                    if (c.readyState === 1) c.send(JSON.stringify({ type: 'vol_update', rules: m.rules }));
                });
            }

            // USER JOIN: Add user to the room map
            if (m.type === 'join') {
                myRoom = m.roomId; myName = m.ign;
                if (!rooms.has(myRoom)) rooms.set(myRoom, new Map());
                rooms.get(myRoom).set(myName, ws);
                
                const names = Array.from(rooms.get(myRoom).keys());
                rooms.get(myRoom).forEach(c => {
                    if (c.readyState === 1) c.send(JSON.stringify({ type: 'players', players: names }));
                });
            }

            // AUDIO ROUTING: Only send audio if volume > 0
            if (m.type === 'audio' && myRoom) {
                const rules = syncs.get(myRoom) || [];
                rooms.get(myRoom).forEach((client, name) => {
                    if (name === myName || client.readyState !== 1) return;
                    
                    const rule = rules.find(r => 
                        (r.a.toLowerCase() === myName.toLowerCase() && r.b.toLowerCase() === name.toLowerCase()) || 
                        (r.a.toLowerCase() === name.toLowerCase() && r.b.toLowerCase() === myName.toLowerCase())
                    );
                    
                    if (rule && rule.v > 0.01) {
                        client.send(JSON.stringify({ type: 'audio', data: m.data, volume: rule.v, from: myName }));
                    }
                });
            }
        } catch (e) { console.error("Socket Error:", e); }
    });

    ws.on('close', () => {
        if (myRoom && rooms.has(myRoom)) {
            rooms.get(myRoom).delete(myName);
            const names = Array.from(rooms.get(myRoom).keys());
            rooms.get(myRoom).forEach(c => c.send(JSON.stringify({ type: 'players', players: names })));
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));