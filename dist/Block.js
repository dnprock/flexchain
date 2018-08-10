"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Block = /** @class */ (function () {
    function Block(index, previousHash, timestamp, data, hash) {
        this.index = index;
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash.toString();
    }
    return Block;
}());
exports.default = Block;
