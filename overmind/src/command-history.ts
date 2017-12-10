import * as fs from 'fs';

/**
 * Models & persists command / ActionSeq execution (by human) history and rating stats.
 */
export class CommandHistory {
    private data: Promise<any>;

    constructor() {
        this.data = new Promise(resolve => {
            fs.readFile("state/actions.json", "utf8", (err, data) => resolve(JSON.parse(data)));
        });
    }

    getFor(wtype: string): Promise<Array<any>> {
        return this.data.then(d => d.history.filter(entry => entry.wtype === wtype));
    }
}
