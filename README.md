# scaffold

* PRD: https://docs.google.com/document/d/1AyhhH3LTPeGcEkzU2smBuM1e6MzfZJXZTJ8Jl38s1jc/edit
* Designs
  * Hardware: Autodesk Fusion360 cloud
  * Firmware:
    * Arduino Prototype: train/
    * scaffold-worker-v1 PCB (non-arduino AVR): worker/
  * Softawre: TBD
* Experiments
  * TBD

## Requirements

Re-creating

* Cheap FDM 3D printing: up mini
* Decent (SLA) 3D printing: DMM.make 3D
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

* A4 (PC4): SDA (w/ internal pull-up)
* A5 (PC5): SCL (w/ internal pull-up)
* A6 (PC6): reflector input
* D4 (PD4): servo (dump)
* D5 (PD5): servo (ori)
* D6 (PD6): servo (arm)

### I2C bus
DRV8830 (1/2)

* OUT: train motor * 2
* Addr[3:0]: 0100 (A0: open, A1: open)


DRV8830 (2/2)

* OUT: driver motor
* Addr[3:0]: 0011 (A0: L, A1: open)
