import * as PouchDB from 'pouchdb';
import Block from './Block';

class Store {
  private db: PouchDB.Database;
  constructor() {
    this.db = new PouchDB('./db/');
  }

  public write(block: Block): void {
    
    block._id = block.hash;
    this.db.put(block)
        .then(() => {
        })
        .catch((err) => {
          console.log(err);
        });
  }

  public getBlocks(): Block[] {
    const blocks: Block[] = [];
    this.db.allDocs({
          include_docs: true,
          attachments: true
        })
        .then((value: PouchDB.Core.AllDocsResponse<{}>) => {
          console.log("Result...");
          console.log(value);
        })
        .catch((err) => {
          console.log(err);
        });
    return blocks;
  }
}

export default Store;