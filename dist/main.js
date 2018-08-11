"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var CryptoJS = require("crypto-js");
var express = require("express");
var bodyParser = require("body-parser");
var WebSocket = require("ws");
var Block_1 = require("./Block");
var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = (process.env.P2P_PORT ? +process.env.P2P_PORT : 6001);
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];
var sockets = [];
var requests = [];
var MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};
var getGenesisBlock = function () {
    return new Block_1.default(0, "0", (new Date()), "flexchain genesis block!!", "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7");
};
var blockchain = [getGenesisBlock()];
var initHttpServer = function () {
    var app = express();
    app.use(bodyParser.json());
    app.get('/blocks', function (req, res) { return res.send(JSON.stringify(blockchain)); });
    app.post('/mineBlock', function (req, res) {
        var newBlock = generateNextBlock(req.body.data);
        addBlock(newBlock);
        broadcast(JSON.stringify(responseLatestMsg()));
        console.log('block added: ' + JSON.stringify(newBlock));
        res.send();
    });
    app.get('/peers', function (req, res) {
        res.send(requests.map(function (r) { return r.connection.remoteAddress + ':' + r.connection.remotePort; }));
    });
    app.post('/addPeer', function (req, res) {
        connectToPeers([req.body.peer]);
        res.send();
    });
    app.listen(http_port, function () { return console.log('Listening http on port: ' + http_port); });
};
var initP2PServer = function () {
    var server = new WebSocket.Server({ port: p2p_port });
    server.on('connection', function (socket, request) { return initConnection(socket, request); });
    console.log('listening websocket p2p port on: ' + p2p_port);
};
var initConnection = function (socket, request) {
    sockets.push(socket);
    requests.push(request);
    initMessageHandler(socket);
    initErrorHandler(socket);
    write(socket, JSON.stringify(queryChainLengthMsg()));
};
var initMessageHandler = function (ws) {
    ws.on('message', function (data) {
        var message = JSON.parse(data);
        console.log('Received message' + JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, JSON.stringify(responseLatestMsg()));
                break;
            case MessageType.QUERY_ALL:
                write(ws, JSON.stringify(responseChainMsg()));
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
        }
    });
};
var initErrorHandler = function (ws) {
    var closeConnection = function (ws) {
        console.log('connection failed to peer: ' + ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', function () { return closeConnection(ws); });
    ws.on('error', function () { return closeConnection(ws); });
};
var generateNextBlock = function (blockData) {
    var previousBlock = getLatestBlock();
    var nextIndex = previousBlock.index + 1;
    var nextTimestamp = new Date();
    var nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
    return new Block_1.default(nextIndex, previousBlock.hash, nextTimestamp, blockData, nextHash);
};
var calculateHashForBlock = function (block) {
    return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
};
var calculateHash = function (index, previousHash, timestamp, data) {
    return CryptoJS.SHA256(index + previousHash + timestamp.getTime() + data).toString();
};
var addBlock = function (newBlock) {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
    }
};
var isValidNewBlock = function (newBlock, previousBlock) {
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    }
    else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    }
    else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
        console.log(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
        console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
        return false;
    }
    return true;
};
var connectToPeers = function (newPeers) {
    newPeers.forEach(function (peer) {
        var ws = new WebSocket(peer);
        ws.on('open', function (socket, request) { return initConnection(socket, request); });
        ws.on('error', function () {
            console.log('connection failed');
        });
    });
};
var handleBlockchainResponse = function (message) {
    var receivedBlocks = JSON.parse(message).data.sort(function (b1, b2) { return (b1.index - b2.index); });
    var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    var latestBlockHeld = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('blockchain possibly behind. We got: ' + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            console.log("We can append the received block to our chain");
            blockchain.push(latestBlockReceived);
            broadcast(JSON.stringify(responseLatestMsg()));
        }
        else if (receivedBlocks.length === 1) {
            console.log("We have to query the chain from our peer");
            broadcast(JSON.stringify(queryAllMsg()));
        }
        else {
            console.log("Received blockchain is longer than current blockchain");
            replaceChain(receivedBlocks);
        }
    }
    else {
        console.log('received blockchain is not longer than current blockchain. Do nothing');
    }
};
var replaceChain = function (newBlocks) {
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        broadcast(JSON.stringify(responseLatestMsg()));
    }
    else {
        console.log('Received blockchain invalid');
    }
};
var isValidChain = function (blockchainToValidate) {
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        }
        else {
            return false;
        }
    }
    return true;
};
var getLatestBlock = function () { return blockchain[blockchain.length - 1]; };
var queryChainLengthMsg = function () { return ({ 'type': MessageType.QUERY_LATEST }); };
var queryAllMsg = function () { return ({ 'type': MessageType.QUERY_ALL }); };
var responseChainMsg = function () { return ({
    'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(blockchain)
}); };
var responseLatestMsg = function () { return ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([getLatestBlock()])
}); };
var write = function (ws, message) { return ws.send(JSON.stringify(message)); };
var broadcast = function (message) { return sockets.forEach(function (socket) { return write(socket, message); }); };
connectToPeers(initialPeers);
initHttpServer();
initP2PServer();
//# sourceMappingURL=main.js.map