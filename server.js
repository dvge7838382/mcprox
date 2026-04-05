const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    const file = path.resolve(__dirname, 'index.html');
    fs.readFile(file, (err, data) => {
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

    ws.on('message', (data, isBinary) => {
        // If it's binary, it's RAW AUDIO. Route it instantly.
        if (isBinary && myRoom) {
            const rules = syncs.get(myRoom) || [];
            rooms.get(myRoom).forEach((client, name) => {
                if (name === myName) return;
                const rule = rules.find(r => 
                    (r.a.toLowerCase() === myName.toLowerCase() && r.b.toLowerCase() === name.toLowerCase()) || 
                    (r.a.toLowerCase() === name.toLowerCase() && r.b.toLowerCase() === myName.toLowerCase())
                );
                if (rule && rule.v > 0.01) {
                    // Prepend the volume (4 bytes) and sender name length (1 byte)
                    const volBuf = Buffer.alloc(4);
                    volBuf.writeFloatLE(rule.v, 0);
                    client.send(Buffer.concat([volBuf, data]), { binary: true });
                }
            });
            return;
        }

        try {
            const m = JSON.parse(data);
            if (m.type === 'sync_rules') syncs.set(m.roomId, m.rules);
            if (m.type === 'join') {
                myRoom = m.roomId; myName = m.ign;
                if (!rooms.has(myRoom)) rooms.set(myRoom, new Map());
                rooms.get(myRoom).set(myName, ws);
                const names = Array.from(rooms.get(myRoom).keys());
                rooms.get(myRoom).forEach(c => c.send(JSON.stringify({ type: 'players', players: names })));
            }
        } catch (e) {}
    });

    ws.on('close', () => { rooms.get(myRoom)?.delete(myName); });
});

server.listen(process.env.PORT || 10000);