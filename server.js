const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    const filePath = path.resolve(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("index.html not found");
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
            if (m.type === 'sync_rules') {
                syncs.set(m.roomId, m.rules);
                rooms.get(m.roomId)?.forEach(c => c.send(JSON.stringify({ type: 'vol_update', rules: m.rules })));
            }
            if (m.type === 'join') {
                myRoom = m.roomId; myName = m.ign;
                if (!rooms.has(myRoom)) rooms.set(myRoom, new Map());
                rooms.get(myRoom).set(myName, ws);
                const names = Array.from(rooms.get(myRoom).keys());
                rooms.get(myRoom).forEach(c => c.send(JSON.stringify({ type: 'players', players: names })));
            }
            if (m.type === 'audio' && myRoom) {
                const rules = syncs.get(myRoom) || [];
                rooms.get(myRoom).forEach((client, name) => {
                    if (name === myName) return;
                    const rule = rules.find(r => (r.a === myName && r.b === name) || (r.a === name && r.b === currName));
                    if (rule && rule.v > 0.01) {
                        client.send(JSON.stringify({ type: 'audio', data: m.data, volume: rule.v, from: myName }));
                    }
                });
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        if (myRoom && rooms.has(myRoom)) {
            rooms.get(myRoom).delete(myName);
            const names = Array.from(rooms.get(myRoom).keys());
            rooms.get(myRoom).forEach(c => c.send(JSON.stringify({ type: 'players', players: names })));
        }
    });
});

server.listen(process.env.PORT || 10000);