# scaffold

[![Scaffold: Progression of Rails 2017](https://img.youtube.com/vi/H0F9yggMfn8/0.jpg)](https://www.youtube.com/watch?v=H0F9yggMfn8 "Scaffold: Progression of Rails 2017")

* PRD: https://docs.google.com/document/d/1AyhhH3LTPeGcEkzU2smBuM1e6MzfZJXZTJ8Jl38s1jc/edit
* Designs
  * Mechanical hardware: Autodesk Fusion360 cloud
  * Electronic hardware: Google Drive / Eagle
  * Firmware: This repo
  * Softawre: This repo (`overmind/`)
* Experiments
  * TBD
* Documents: https://drive.google.com/drive/folders/0B6zCoyeuDn-pVGp6S2Y4Tmo1dEE

## Components

* worker: AVR firmware for worker PCB
* feeder: AVR firmware for rail feeder
* overmind: controls everything, via TWELITE monostick. Written in electron (desktop webapp platform).

Model names:

https://docs.google.com/document/d/1zPHIgSu1AZrwIe-akWDu8TK5ug4Fznx-tUY5lZn-zfI/edit?usp=drive_web

## Overmind

First-time only, when you cloned repo, run:
```
cd ./overmind
npm install
```

To develop / run overmind, you need two consoles.

In one, do the following to compile & setup dynamic reloader for
```
cd ./overmind
npm run dev
```

Then, in another, to start the app:
```
cd ./overmind
npm start
```

To run unit tests:
```
npm test
```

## Requirements

Re-creating

* SLA 3d printing: Form2
* PWB manufacturer: Seeed studio
* Electronic parts: All are sourceabe from digikey
* PCB reflow oven
* USBasp

## AVR Firmware writing

First time only:
```
scons writefuse
```

First time & whenever code is changed:
```
scons write-builder
```
or
```
scons write-feeder
```

Just compile and see resulting FW size:
```
scons
```

# Communication Protocol Stack

## Commands

* p: print status
* e: enqueue actions

```
Command
  = "p"
  | "e" Action+
```

```
Action = [Duration ms : 2] ([ActionTarget ASCII: 1] [ActionVal int : 1]*)*
```

e.g.
```
eA123BCD-23
```

## Addressing

Everything is in big endian.

overmind -> worker
```
Packet = [dest addr : 4] Command
```
When addr = 0xffffffff, it means broadcasting.

worker -> overmind
```
Packet = [src addr : 4] [worker timestamp in millisec : 4] [JSON ascii : N]
```
