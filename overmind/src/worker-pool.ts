import * as Identicon from 'identicon.js';
import * as md5 from 'md5';
import { Packet } from './comm';
import { ActionSeq } from './action';
import { WorkerAddr, WorkerBridge } from './comm';
import * as fs from 'fs';
import * as builder_pb from './builder_pb';
import * as THREE from 'three';

interface Worker {
    addr: number;
    wtype?: string;
    identicon: Identicon;
    messages: Array<any>;
    out: Array<any>;
    power: any;
    readings: Array<any>;

    //
    status_time: Date;
    status_cont: any;

    io_status_time: Date;
    io_status_cont: any;

    i2c_scan_result_time: Date;
    i2c_scan_result_cont: any;
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

    hackWorldView: any;

    private readonly actionsPath = "state/workers.json";
    private readonly workerTypeMapping: Map<number, string> = new Map();

    constructor(private bridge: WorkerBridge) {
        this.workers = [];
        this.lastUninit = null;

        this.workerTypeMapping[builder_pb.WorkerType.BUILDER] = "TB";

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
        if (packet.data === null || packet.ty === undefined) {
            console.error("Corrupt packet", packet);
            let message: any = {
                status: 'corrupt',
                head: 'CORRUPT',
                desc: String.fromCharCode.apply(String, packet.datagram),
                timestamp: packet.srcTs / 1e3,
            };
            worker.messages.unshift(message);
            return;
        }

        const data = packet.data;
        if (packet.ty === builder_pb.PacketType.STATUS) {
            worker.wtype = this.workerTypeMapping[data.workerType];

            worker.status_time = new Date();
            worker.status_cont = data;
        } else if (packet.ty === builder_pb.PacketType.I2C_SCAN_RESULT) {
            worker.i2c_scan_result_time = new Date();
            worker.i2c_scan_result_cont = data;
        } else if (packet.ty === builder_pb.PacketType.IO_STATUS) {
            worker.io_status_time = new Date();
            worker.io_status_cont = data;

            const gVector = new THREE.Vector3(data.sensor.accXMg, data.sensor.accYMg, data.sensor.accZMg).multiplyScalar(1e-3);
            console.log('acc', gVector);
            gVector.multiplyScalar(0.03);
            gVector.z += 0.1;
            this.hackWorldView.accVector.position.copy(gVector);
        } else if (packet.ty === builder_pb.PacketType.CHECKPOINT) {
            let critName = '?';
            new Map(Object.entries(builder_pb.Criticality)).forEach((enumValue: number, enumName: string) => {
                console.log(enumName, enumValue);
                if (enumValue === data.criticality) {
                    critName = enumName;
                }
            });
            let message: any = {
                status: 'known',
                head: 'Checkpoint(' + critName + ')',
                desc: JSON.stringify(data, null, 2),
                timestamp: packet.srcTs / 1e3,
            };
            worker.messages.unshift(message);
        } else {
            console.error("Unhandled packet type", packet.ty);
        }
    }
}
