# scaffold

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

To run overmind,
```
cd ./overmind
npm start
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
scons write
```

Just compile:
```
scons
```


## Worker (Builder) Commands

approach and unscrew
```
e1000s-100t100/e1000t0/e1s0
```

* R: 0 (up), 50~60 (ortho)
* O: 30 (center)
* D: ?
