import * as Identicon from 'identicon.js';
import * as md5 from 'md5';
import { Packet } from './comm';

interface Worker {
    addr: number;
    wtype?: string;
    identicon: Identicon;
    messages: Array<any>;
    out: Array<any>;
    power: any;
    readings: Array<any>;
}

export default class WorkerPool {
    workers: Array<Worker>;
    lastUninit?: Date;

    constructor() {
        this.workers = [];
        this.lastUninit = null;
    }

    handleDatagram(packet: Packet) {
        if (packet.src === 0) {
            this.lastUninit = new Date();
            return;
        }

        let worker = this.workers.find(w => w.addr === packet.src);
        if (worker !== undefined) {
            this.handleDatagramInWorker(worker, packet);
        } else {
            let worker = {
                addr: packet.src,
                wtype: null,
                identicon: new Identicon(md5(packet.src), {
                    saturation: 0.5,
                    background: [200, 200, 200, 255],
                    size: 50
                }),
                messages: [],
                out: [],
                power: {},
                readings: [],
            };
            this.handleDatagramInWorker(worker, packet);
            this.workers.push(worker);
        }
    }

    handleDatagramInWorker(worker: Worker, packet: Packet) {
        console.log(packet);
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
