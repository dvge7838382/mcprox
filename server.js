const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    const filePath = path.resolve(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404).end(); return; }
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
        // High-speed check: Is this a JSON command or Binary audio?
        if (typeof raw !== 'string' && !(raw instanceof String)) {
            // This is RAW BINARY AUDIO - Route it as fast as possible
            if (!myRoom) return;
            const rules = syncs.get(myRoom) || [];
            rooms.get(myRoom).forEach((client, name) => {
                if (name === myName) return;
                const rule = rules.find(r => 
                    (r.a.toLowerCase() === myName.toLowerCase() && r.b.toLowerCase() === name.toLowerCase()) || 
                    (r.a.toLowerCase() === name.toLowerCase() && r.b.toLowerCase() === myName.toLowerCase())
                );
                // Attach volume metadata to the binary header (first 4 bytes)
                if (rule && rule.v > 0.01) {
                    const header = Buffer.alloc(4);
                    header.writeFloatLE(rule.v, 0);
                    client.send(Buffer.concat([header, Buffer.from(myName), Buffer.from(":"), raw]));
                }
            });
            return;
        }

        try {
            const m = JSON.parse(raw);
            if (m.type === 'sync_rules') {
                syncs.set(m.roomId, m.rules);
                rooms.get(m.roomId)?.forEach(c => c.send(raw));
            }
            if (m.type === 'join') {
                myRoom = m.roomId; myName = m.ign;
                if (!rooms.has(myRoom)) rooms.set(myRoom, new Map());
                rooms.get(myRoom).set(myName, ws);
                const names = Array.from(rooms.get(myRoom).keys());
                rooms.get(myRoom).forEach(c => c.send(JSON.stringify({ type: 'players', players: names })));
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        rooms.get(myRoom)?.delete(myName);
    });
});

server.listen(process.env.PORT || 10000);