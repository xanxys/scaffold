// Need to use window.require: https://github.com/railsware/bozon/issues/40
declare var window: any;
const SerialPort: any = window.require('serialport');
import * as fs from 'fs';

export type WorkerAddr = number;

export interface Packet {
    raw_data: any;

    // Decoded overmind protocol.
    src?: WorkerAddr;
    srcTs?: number;
    datagram?: Uint8Array;

    // Decoded datagram JSON.
    data?: any;
}

export class WorkerBridge {
    private port: any;
    path = '/dev/ttyUSB0';
    isOpen = false;
    latestPacket?: Date;
    private handlePacket?: (packet: Packet) => void;

    constructor(private fakePath?: string) {
    }

    open(handleUpdate: (br: WorkerBridge) => void, handlePacket: (packet: Packet) => void): void {
        this.handlePacket = handlePacket;
        this.port = new SerialPort(this.path, {
            baudRate: 115200
        }, err => {
            if (err === null) {
                console.info('serial port ok');
                this.isOpen = true;
            } else {
                console.error('serial port error', err);
                if (this.fakePath) {
                    console.log('will inject recorded fake packets from', this.fakePath);
                    fs.readFile(this.fakePath, "utf8", (err, data) => {
                        const fakePackets = JSON.parse(data);
                        console.log("Fake packets", fakePackets);
                        fakePackets.packets.forEach(worker => worker.packets.forEach(p => this.onData(p)));
                    });
                }
            }
            handleUpdate(this);
        });

        const parser = new SerialPort.parsers.Readline();
        this.port.pipe(parser);
        parser.on('data', data => this.onData(data));
    }

    private onData(tweliteData: string) {
        const data = tweliteData.trim();

        let packet: Packet = {
            raw_data: data,
            // Decoded overmind protocol.
            src: null,
            srcTs: null,
            datagram: null,
            // Decoded datagram JSON.
            data: null,
        };

        if (data.startsWith(':7801')) {
            let ovm_packet = decodeHex(data.slice(':7801'.length, -2 /* csum */));

            packet.src = new DataView(ovm_packet).getUint32(0);
            packet.srcTs = new DataView(ovm_packet).getUint32(4);
            packet.datagram = new Uint8Array(ovm_packet, 8);
            try {
                packet.data = JSON.parse(String.fromCharCode.apply(String, packet.datagram));
            } catch (e) { }
        }

        this.latestPacket = new Date();
        this.handlePacket(packet);
    }

    sendCommand(command: string, addr = 0xffffffff): void {
        let buffer = new ArrayBuffer(2 + 4 + command.length);
        let header = new DataView(buffer);
        header.setUint8(0, 0x78); // TWELITE addr: default child
        header.setUint8(1, 0x01); // TWELITE command: Serial
        header.setUint32(2, addr); // OVM addr
        let body = new Uint8Array(buffer, 2 + 4);
        body.set(Array.from(command).map(ch => ch.charCodeAt(0)));

        let final_command = ':' + encodeHex(buffer) + 'X\r\n';
        console.log('send', final_command);
        this.port.write(final_command);
    }

    /** @returns human-readable short text describing mode */
    getMode(): string {
        if (this.isOpen) {
            return 'connected';
        } else if (this.fakePath) {
            return 'fake replay'
        } else {
            return 'disconnected';
        }
    }
}

function decodeHex(hex: string): ArrayBuffer {
    let buffer = new ArrayBuffer(hex.length / 2);
    let view = new Uint8Array(buffer);
    for (let ix = 0; ix < hex.length; ix += 2) {
        view[ix / 2] = parseInt(hex.substr(ix, 2), 16);
    }
    return buffer;
}

function encodeHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer)).map(b => (b >> 4).toString(16) + (b & 0xf).toString(16)).join('').toUpperCase();
}
