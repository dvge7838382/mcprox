const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// THIS SECTION SENDS THE HTML FILE TO YOUR BROWSER
const server = http.createServer((req, res) => {
    // If the user visits the main page or index.html
    if (req.url === '/' || req.url === '/index.html') {
        const filePath = path.join(__dirname, 'index.html');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500);
                return res.end("Error loading index.html - Make sure the file is in the same folder as server.js");
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end("Not Found");
    }
});

// ... (The rest of your WebSocket / wss code goes here) ...

server.listen(process.env.PORT || 10000, () => {
    console.log("Server is running and serving index.html");
});