import * as Identicon from 'identicon.js';
import * as md5 from 'md5';
import { Packet } from './comm';
import { ActionSeq } from './action';
import { WorkerAddr, WorkerBridge } from './comm';
import * as fs from 'fs';

interface Worker {
    addr: number;
    wtype?: string;
    identicon: Identicon;
    messages: Array<any>;
    out: Array<any>;
    power: any;
    readings: Array<any>;
}

interface WorkerEntry {
    wtype: string;
    addr: number;
}

/**
 * Exposes control interfaces of all workers as abstract entities decoupled from networks.
 */
export class WorkerPool {
    workers: Array<Worker>;
    inactiveWorkers: Array<Worker> = [];
    lastUninit?: Date;

    private readonly actionsPath = "state/workers.json";

    public readonly typeToAddr = new Map([
        ['FDW-RS', 2165185564],
        ['TB', 4278401023]
    ]);

    constructor(private bridge: WorkerBridge) {
        this.workers = [];
        this.lastUninit = null;

        fs.readFile(this.actionsPath, "utf8", (err, data) => {
            const parsedData = <Array<WorkerEntry>>JSON.parse(data).workers;
            this.inactiveWorkers = parsedData.map(e => {
                return {
                    addr: e.addr,
                    wtype: e.wtype,
                    identicon: WorkerPool.createIdenticon(e.addr),
                    messages: [],
                    out: [],
                    power: null,
                    readings: []
                };
            });
        });
    }

    sendActionSeq(asq: ActionSeq, addr: WorkerAddr) {
        this.bridge.sendCommand('e' + asq.getFullDesc(), addr);
    }

    handleDatagram(packet: Packet) {
        if (packet.src === 0) {
            this.lastUninit = new Date();
            return;
        }

        let worker = this.workers.find(w => w.addr === packet.src);
        if (worker !== undefined) {
            this.inactiveWorkers = this.inactiveWorkers.filter(w => w.addr !== packet.src);
            this.handleDatagramInWorker(worker, packet);
        } else {
            let worker = {
                addr: packet.src,
                wtype: null,
                identicon: WorkerPool.createIdenticon(packet.src),
                messages: [],
                out: [],
                power: {},
                readings: [],
            };
            // TODO: Register new workers.
            this.handleDatagramInWorker(worker, packet);
            this.workers.push(worker);
        }
    }

    private static createIdenticon(addr: number): Identicon {
        return new Identicon(md5(addr), {
            saturation: 0.5,
            background: [200, 200, 200, 255],
            size: 50
        });
    }

    handleDatagramInWorker(worker: Worker, packet: Packet) {
        let message: any = {
            status: 'known', // known, unknown, corrupt
            timestamp: packet.srcTs / 1e3,
        };
        if (packet.data === null) {
            message.status = 'corrupt';
            message.head = 'CORRUPT JSON';
            message.desc = String.fromCharCode.apply(String, packet.datagram);
        } else if (packet.data.ty === undefined) {
            message.status = 'corrupt';
            message.head = 'MISSING TYPE';
            message.desc = JSON.stringify(packet, null, 2);
        } else {
            let data = packet.data;
            message.head = data.ty;
            message.desc = JSON.stringify(data, null, 2);

            if (data.ty === 'STATUS') {
                worker.wtype = data.wtype;
                worker.out = data.out;
                let vcc = data.system['vcc/mV'];
                let bat = data.system['bat/mV'];
                if (vcc < bat) {
                    // Known power init failure mode.
                    worker.power.classes = {
                        "bg-danger": true
                    };
                } else if (bat < 3300) {
                    worker.power.classes = {
                        "bg-warning": true
                    };
                } else {
                    worker.power.classes = {
                        "bg-primary": true
                    };
                }
                worker.power.desc = bat + 'mV (Vcc=' + vcc + 'mV)';
            } else if (data.ty === 'SENSOR_CACHE') {
                worker.readings = worker.readings.concat(data.val);
            } else {
                message.status = 'unknown';
                message.head = `?${data.ty}?`;
            }
        }
        worker.messages.unshift(message);
    }
}
