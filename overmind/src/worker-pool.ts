import Identicon from 'identicon.js';
import md5 from 'md5';

export default class WorkerPool {
    workers: Array<any>;
    last_uninit: any;

    constructor() {
        this.workers = [];
        this.last_uninit = null;
    }

    handle_datagram(packet) {
        if (packet.src === 0) {
            this.last_uninit = new Date();
            return;
        }

        let worker = this.workers.find(w => w.addr === packet.src);
        if (worker !== undefined) {
            this.handle_datagram_in_worker(worker, packet);
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
            this.handle_datagram_in_worker(worker, packet);
            this.workers.push(worker);
        }
    }

    handle_datagram_in_worker(worker, packet) {
        console.log(packet);
        let message: any = {
            status: 'known', // known, unknown, corrupt
            timestamp: packet.src_ts / 1e3,
        };
        if (packet.data === null) {
            message.status = 'corrupt';
            message.head = 'CORRUPT JSON';
            message.desc = packet.datagram;
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
