# scaffold

* PRD: https://docs.google.com/document/d/1AyhhH3LTPeGcEkzU2smBuM1e6MzfZJXZTJ8Jl38s1jc/edit
* Designs
  * Hardware: Autodesk Fusion360 cloud
  * Firmware:
    * scaffold-worker-v2 PCB (non-arduino AVR): worker/
  * Softawre: overmind/
* Experiments
  * TBD
* Documents: https://drive.google.com/drive/folders/0B6zCoyeuDn-pVGp6S2Y4Tmo1dEE

## Components

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

## Pin assigment / connections (V2)
ATmega328P

16MHz (ceralock) / 1:1 clock division / No watchdog

|pin|usage|
|---|---|
|PB0| - |
|PB1| - |
|PB2| - |
|PB3/OC2A| ISP MOSI / PWMA  |
|PB4| ISP MISO  |
|PB5| ISP SCK  |
|PB6| XTAL1  |
|PB7| XTAL2  |
|   |  |
|   |  |
|PC0| red indicator LED  |
|PC1/ADC1| SEN-T  |
|PC2| -  |
|PC3| -  |
|PC4| -  |
|PC5| -  |
|PC6| #RESET  |
|PC7| -  |
|   |  |
|   |  |
|ADC6| SEN-O (rail marker)  |
|ADC7| SEN-X (extension)  |
|   |  |
|   |  |
|PD0| TWELITE-RX  |
|PD1| TWELITE-TX  |
|PD2| -  |
|PD3/OC2B| PWMB  |
|PD4| - |
|PD5| - |
|PD6| - |
|PD7| - |

### I2C bus

DRV8830 (1/3)

* OUT: Train motor
* Addr[3:0]: 0000 (A0: L, A1: L)

DRV8830 (2/3)

* OUT: Orientor motor
* Addr[3:0]: 0001 (A0: open, A1: L)

DRV8830 (3/3)

* OUT: Extension motor (screw)
* Addr[3:0]: 0010 (A0: H, A1: L)
