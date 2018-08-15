# flexchain
Flexible blockchain

## Running

We use ts-node.

* Start a node:

```
HTTP_PORT=3001 P2P_PORT=6001 ts-node main.ts
```

* Start another node:

```
HTTP_PORT=3002 P2P_PORT=6002 PEERS=ws://localhost:6001 ts-node main.ts
```

## Operations

* View current blocks

```
curl http://localhost:3001/blocks
```

* Insert a block

```
curl -H "Content-type:application/json" --data '{"data" : "Block A"}' http://localhost:3001/mineBlock
```

* Query for peers

```
curl http://localhost:3001/peers
```
