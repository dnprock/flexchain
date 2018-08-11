class Block {
  public index: number;
  public previousHash: string;
  public timestamp: Date;
  public data: string;
  public hash: string;

  constructor(index: number, previousHash: string, timestamp: Date, data: string, hash: string) {
      this.index = index;
      this.previousHash = previousHash.toString();
      this.timestamp = timestamp;
      this.data = data;
      this.hash = hash.toString();
  }
}

export default Block;