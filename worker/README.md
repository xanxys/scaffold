# Worker (Builder 2.0: S60C-TB, Feeder 1.0: S60C-FD-x)

Builder 2.0
* PCB DD & Eratta: https://docs.google.com/document/d/1Juym4ehH7gGHqDHJOSv_l-aBb0Xs5iWDp3gg6BylRzI/edit
* Designs
  * Hardware: Autodesk Fusion360 cloud
  * PCB: Eagle
    * 2.0: https://drive.google.com/file/d/0B6zCoyeuDn-pWUhYQTVqWkgwS1E/view?usp=sharing

Feeder 1.0

## Error Handling Policy

* Discrete data (command type): Ignore & warn
* Analog data (duration, pos, vel): Clip & warn


## Builder Pin assigment / connections (V2)
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

### Extension head

A(right): screw rack

B(left): dump


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


## Feeder Pin assigment / connections (1.x)
ATmega328P
