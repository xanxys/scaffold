# scaffold

* PRD: https://docs.google.com/document/d/1AyhhH3LTPeGcEkzU2smBuM1e6MzfZJXZTJ8Jl38s1jc/edit
* Designs
  * Hardware: Autodesk Fusion360 cloud
  * Firmware:
    * scaffold-worker-v1 PCB (non-arduino AVR): worker/
  * Softawre: overmind/
* Experiments
  * TBD
* Documents: https://drive.google.com/drive/folders/0B6zCoyeuDn-pVGp6S2Y4Tmo1dEE

## Components

* base: legacy arduino optical bridge between worker and arduino IDE
* worker: AVR firmware for worker PCB
* overmind: controls everything, via TWELITE monostick. Written in electron (desktop webapp platform).

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

## Firmware writing

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


## Commands

approach and unscrew
```
e1000s-100t100/e1000t0/e1s0
```

* R: 0 (up), 50~60 (ortho)
* O: 30 (center)
* D: ?

## Pin assigment / connections
ATmega328P

16MHz (ceralock) / 1:1 clock division / No watchdog

|pin|usage|
|---|---|
|PB0| - |
|PB1| - |
|PB2| - |
|PB3| ISP MOSI  |
|PB4| ISP MISO  |
|PB5| ISP SCK  |
|PB6| XTAL1  |
|PB7| XTAL2  |
|   |  |
|   |  |
|PC0| red indicator LED  |
|PC1| -  |
|PC2| -  |
|PC3| -  |
|PC4| -  |
|PC5| -  |
|PC6| #RESET  |
|PC7| -  |
|   |  |
|   |  |
|ADC6|: SEN1 - rail marker detector  |
|ADC7|: SEN2 - RESERVED  |
|   |  |
|   |  |
|PD0| OPT-RX  |
|PD1| OPT-TX  |
|PD2| -  |
|PD3| SEN-LIGHT-R  |
|PD4| SRV1 - placer arm (r)  |
|PD5| SRV2 - orientor (o)  |
|PD6| SRV3 - driver arm (d)  |
|PD7| SEN-LIGHT-L  |

### I2C bus
DRV8830 (1/2)

* OUT: train motor * 2
* Addr[3:0]: 0100 (A0: open, A1: open)


DRV8830 (2/2)

* OUT: driver motor
* Addr[3:0]: 0011 (A0: L, A1: open)
