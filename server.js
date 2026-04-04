const { WebSocketServer } = require('ws');
const http = require('http');

const server = http.createServer((req, res) => { res.writeHead(200); res.end("Server Online"); });
const wss = new WebSocketServer({ server });

const roomSync = new Map(); 
const roomClients = new Map(); 

wss.on('connection', (ws) => {
    let myRoom = null, myName = null;

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);

            if (msg.type === 'sync_rules') {
                roomSync.set(msg.roomId, msg.rules);
                return;
            }

            if (msg.type === 'join') {
                myRoom = msg.roomId; myName = msg.ign;
                if (!roomClients.has(myRoom)) roomClients.set(myRoom, new Map());
                roomClients.get(myRoom).set(myName, ws);
                broadcast(myRoom);
            }

            if (msg.type === 'audio' && myRoom) {
                const rules = roomSync.get(myRoom) || [];
                roomClients.get(myRoom).forEach((client, target) => {
                    if (target === myName) return;
                    const rule = rules.find(r => 
                        (r.a.toLowerCase() === myName.toLowerCase() && r.b.toLowerCase() === target.toLowerCase()) || 
                        (r.a.toLowerCase() === target.toLowerCase() && r.b.toLowerCase() === myName.toLowerCase())
                    );
                    if (rule && rule.v > 0) {
                        client.send(JSON.stringify({ type: 'audio', data: msg.data, volume: rule.v, from: myName }));
                    }
                });
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        if (myRoom && roomClients.has(myRoom)) {
            roomClients.get(myRoom).delete(myName);
            broadcast(myRoom);
        }
    });
});

function broadcast(roomId) {
    const names = Array.from(roomClients.get(roomId).keys());
    roomClients.get(roomId).forEach(c => c.send(JSON.stringify({ type: 'players', players: names })));
}

server.listen(process.env.PORT || 10000);