// ... (Standard Server setup) ...

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        const msg = JSON.parse(data);

        if (msg.type === 'sync_rules') {
            roomSync.set(msg.roomId, msg.rules); // Store rules from Tracker
            return;
        }

        if (msg.type === 'audio' && myRoom) {
            const rules = roomSync.get(myRoom) || [];
            const neighbors = roomClients.get(myRoom);

            neighbors.forEach((client, targetName) => {
                if (targetName === myName) return;

                // FIND THE RULE: Does a rule exist for (Me + Target)?
                const rule = rules.find(r => 
                    (r.p1 === myName && r.p2 === targetName) || 
                    (r.p1 === targetName && r.p2 === myName)
                );

                // Forward audio ONLY if a rule exists and volume > 0
                if (rule && rule.v > 0 && client.readyState === 1) {
                    client.send(JSON.stringify({ 
                        type: 'audio', 
                        data: msg.data, 
                        volume: rule.v 
                    }));
                }
            });
        }
    });
});