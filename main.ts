import * as CryptoJS from 'crypto-js';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as WebSocket from 'ws';
import Block from './Block';
import { IncomingMessage } from 'http';

let http_port = process.env.HTTP_PORT || 3001;
let p2p_port = (process.env.P2P_PORT ? +process.env.P2P_PORT : 6001);
let initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

let sockets: WebSocket[] = [];
let MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};

const getGenesisBlock = () => {
    return new Block(0, "0", (new Date()), "flexchain genesis block!!", "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7");
};

let blockchain = [getGenesisBlock()];

let initHttpServer = () => {
  let app = express();
  app.use(bodyParser.json());

  app.get('/blocks', (req, res) => res.send(JSON.stringify(blockchain)));
  app.post('/mineBlock', (req, res) => {
      let newBlock = generateNextBlock(req.body.data);
      addBlock(newBlock);
      broadcast(JSON.stringify(responseLatestMsg()));
      console.log('block added: ' + JSON.stringify(newBlock));
      res.send();
  });
  app.get('/peers', (req, res) => {
      res.send(sockets.map(s => s.protocol));
  });
  app.post('/addPeer', (req, res) => {
      connectToPeers([req.body.peer]);
      res.send();
  });
  app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};

const initP2PServer = () => {
  console.log(p2p_port);
  let server = new WebSocket.Server({port: p2p_port});
  server.on('connection', (socket: WebSocket) => initConnection(socket));
  console.log('listening websocket p2p port on: ' + p2p_port);
};

const initConnection = (socket: WebSocket) => {
  console.log('initConnection ' + socket);
  sockets.push(socket);
  initMessageHandler(socket);
  initErrorHandler(socket);
  write(socket, JSON.stringify(queryChainLengthMsg()));
};

const initMessageHandler = (ws: WebSocket) => {
  interface MessageData {
      type: number;
      data?: string;
  }
  ws.on('message', (data: string) => {
      console.log(data);
      let messageData: MessageData = JSON.parse(data);

      console.log('Received message ' + messageData);
      console.log(typeof(messageData));
      console.log(messageData.type);
      switch (messageData.type) {
          case MessageType.QUERY_LATEST:
              write(ws, JSON.stringify(responseLatestMsg()));
              break;
          case MessageType.QUERY_ALL:
              write(ws, JSON.stringify(responseChainMsg()));
              break;
          case MessageType.RESPONSE_BLOCKCHAIN:
              handleBlockchainResponse(JSON.stringify(messageData));
              break;
      }
  });
};

const initErrorHandler = (ws: WebSocket) => {
  let closeConnection = (ws: WebSocket) => {
      console.log('connection failed to peer: ' + ws.url);
      sockets.splice(sockets.indexOf(ws), 1);
  };
  ws.on('close', () => closeConnection(ws));
  ws.on('error', () => closeConnection(ws));
};


const generateNextBlock = (blockData: string) => {
  let previousBlock = getLatestBlock();
  let nextIndex = previousBlock.index + 1;
  let nextTimestamp = new Date();
  let nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
  return new Block(nextIndex, previousBlock.hash, nextTimestamp, blockData, nextHash);
};


const calculateHashForBlock = (block: Block) => {
  return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
};

const calculateHash = (index: number, previousHash: string, timestamp: Date, data: string) => {
  return CryptoJS.SHA256(index + previousHash + timestamp.getTime() + data).toString();
};

const addBlock = (newBlock: Block) => {
  if (isValidNewBlock(newBlock, getLatestBlock())) {
      blockchain.push(newBlock);
  }
};

const isValidNewBlock = (newBlock: Block, previousBlock: Block) => {
  if (previousBlock.index + 1 !== newBlock.index) {
      console.log('invalid index');
      return false;
  } else if (previousBlock.hash !== newBlock.previousHash) {
      console.log('invalid previoushash');
      return false;
  } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
      console.log(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
      console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
      return false;
  }
  return true;
};

const connectToPeers = (newPeers: string[]) => {
  newPeers.forEach((peer) => {
      let ws = new WebSocket(peer);
      ws.on('open', () => initConnection(ws));
      ws.on('error', () => {
          console.log('connection failed')
      });
  });
};

const handleBlockchainResponse = (message: string) => {
  let receivedBlocks = JSON.parse(message).data.sort((b1: Block, b2: Block) => (b1.index - b2.index));
  let latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
  let latestBlockHeld = getLatestBlock();
  if (latestBlockReceived.index > latestBlockHeld.index) {
      console.log('blockchain possibly behind. We got: ' + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
      if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
          console.log("We can append the received block to our chain");
          blockchain.push(latestBlockReceived);
          broadcast(JSON.stringify(responseLatestMsg()));
      } else if (receivedBlocks.length === 1) {
          console.log("We have to query the chain from our peer");
          broadcast(JSON.stringify(queryAllMsg()));
      } else {
          console.log("Received blockchain is longer than current blockchain");
          replaceChain(receivedBlocks);
      }
  } else {
      console.log('received blockchain is not longer than current blockchain. Do nothing');
  }
};

const replaceChain = (newBlocks: Block[]) => {
  if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
      console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
      blockchain = newBlocks;
      broadcast(JSON.stringify(responseLatestMsg()));
  } else {
      console.log('Received blockchain invalid');
  }
};

const isValidChain = (blockchainToValidate: Block[]) => {
  if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
      return false;
  }
  let tempBlocks = [blockchainToValidate[0]];
  for (let i = 1; i < blockchainToValidate.length; i++) {
      if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
          tempBlocks.push(blockchainToValidate[i]);
      } else {
          return false;
      }
  }
  return true;
};

const getLatestBlock = () => blockchain[blockchain.length - 1];
const queryChainLengthMsg = () => ({type: MessageType.QUERY_LATEST});
const queryAllMsg = () => ({type: MessageType.QUERY_ALL});
const responseChainMsg = () =>({
  type: MessageType.RESPONSE_BLOCKCHAIN, data: JSON.stringify(blockchain)
});
const responseLatestMsg = () => ({
  type: MessageType.RESPONSE_BLOCKCHAIN,
  data: JSON.stringify([getLatestBlock()])
});

const write = (ws: WebSocket, message: string) => ws.send(JSON.stringify(message));
const broadcast = (message: string) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();