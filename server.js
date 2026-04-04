const { WebSocketServer } = require('ws');
const http = require('http');

const server = http.createServer((req, res) => { res.writeHead(200); res.end("Server Active"); });
const wss = new WebSocketServer({ server });

const roomSync = new Map(); // Stores the Volume Map per RoomCode
const roomClients = new Map(); // Stores Websockets per RoomCode

wss.on('connection', (ws) => {
    let myRoom = null;
    let myName = null;

    ws.on('message', (data) => {
        const msg = JSON.parse(data);

        // 1. Tracker App sends the Volume Rules
        if (msg.type === 'sync_room') {
            roomSync.set(msg.roomId, msg.volumes);
            return;
        }

        // 2. Website Player Joins
        if (msg.type === 'join') {
            myRoom = msg.roomId;
            myName = msg.ign;
            if (!roomClients.has(myRoom)) roomClients.set(myRoom, new Map());
            roomClients.get(myRoom).set(myName, ws);
            console.log(`${myName} joined ${myRoom}`);
        }

        // 3. Audio Regulation Logic
        if (msg.type === 'audio' && myRoom && roomClients.has(myRoom)) {
            const currentVolumes = roomSync.get(myRoom) || [];
            const neighbors = roomClients.get(myRoom);

            neighbors.forEach((client, targetName) => {
                if (targetName === myName) return;

                // Find if these two players are close enough based on Tracker data
                const link = currentVolumes.find(l => 
                    (l.a === myName && l.b === targetName) || 
                    (l.a === targetName && l.b === myName)
                );

                if (link && link.v > 0 && client.readyState === 1) {
                    client.send(JSON.stringify({
                        type: 'audio',
                        from: myName,
                        data: msg.data,
                        volume: link.v
                    }));
                }
            });
        }
    });

    ws.on('close', () => {
        if (myRoom && roomClients.has(myRoom)) {
            roomClients.get(myRoom).delete(myName);
        }
    });
});

server.listen(process.env.PORT || 10000);