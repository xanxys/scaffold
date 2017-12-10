import * as fs from 'fs';

/**
 * Models & persists command / ActionSeq execution (by human) history and rating stats.
 */
export class CommandHistory {
    private data: CommandHistoryFile;
    private readonly path = "state/actions.json";

    constructor() {
        this.data = {
            history: [],
            workers: []
        };
        fs.readFile(this.path, "utf8", (err, data) => {
            this.data = JSON.parse(data);
        });
    }

    getFor(wtype: string): Array<any> {
        return this.data.history.filter(entry => entry.wtype === wtype);
    }

    notifyUsed(wtype: string, seq: string) {
        const existing = this.data.history.filter(entry => entry.wtype === wtype && entry.seq === seq);
        if (existing.length > 0) {
            existing[0].used += 1;
        } else {
            this.data.history.push({
                wtype: wtype,
                seq: seq,
                memo: "",
                used: 1,
                good: 0,
                bad: 0,
            });
        }
        fs.writeFile(this.path, JSON.stringify(this.data, null, 2));
    }
}

interface CommandHistoryFile {
    history: Array<HistoryEntry>;
    workers: Array<WorkerEntry>;
}

interface HistoryEntry {
    wtype: string;
    seq: string;
    memo: string;
    used: number;
    good: number;
    bad: number;
}

interface WorkerEntry {
    wtype: string;
    addr: number;
}
