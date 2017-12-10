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
            this.data.history.sort(comparing(e => -e.used));
        });
    }

    getFor(wtype: string): Array<any> {
        return this.data.history.filter(entry => entry.wtype === wtype);
    }

    sort(wtype: string) {
        const these = this.data.history.filter(entry => entry.wtype === wtype);
        const others = this.data.history.filter(entry => entry.wtype !== wtype);

        these.sort(comparing(e => -e.used));
        this.data.history = these.concat(others);
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
            });
        }
        this.syncToFile();
    }

    thumbDown(wtype: string, seq: string) {
        this.data.history = this.data.history.filter(entry => !(entry.wtype === wtype && entry.seq === seq));
        this.syncToFile();
    }

    syncToFile() {
        fs.writeFile(this.path, JSON.stringify(this.data, null, 2));
    }
}

function comparing<V, K>(fn: (val: V) => K): (val1: V, val2: V) => number {
    return (v1, v2) => {
        if (fn(v1) < fn(v2)) {
            return -1;
        } else if (fn(v1) > fn(v2)) {
            return 1;
        }
        return 0;
    };
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
}

interface WorkerEntry {
    wtype: string;
    addr: number;
}
