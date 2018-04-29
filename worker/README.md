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


## Coordinate System

![S60-TB](https://i.gyazo.com/acf5a1336afa0637301c8abcf6b6cee1.jpg)

|Canonical | IMU |
|--------|-------|
| X      | -Y    |
| Y      | X     |
| Z      | Z     |


## Sensor Commands & Pins

|New name|ADC pin| Legacy Name | TB               | FDW-RS           | TB legacy commands          | FDW-RS legacy commands     |
|--------|-------|-------------|------------------|------------------|-----------------------------|----------------------------|
| S0     | 1     |  T          | rail center (+)  | port stops (-)   | Tx: if S0>=x, stop MV0      | Sx: if S0<x, stop MV0       |
| S1     | 6     |  O          | unused           | origin (+)       |                             | Ox: if S1>x, stop MV0      |
| S2     | 7     |  X          | unused           | unused           |                             |                            |

polarities

* + (value is big when condition is true)
* - (value is smaller whencondition is true)

In the new scheme, polarity is baked as FW and value is negated (x := 255-x) in the worker.
Thus, only S(n)>x: stop MV(0) cutoff condition is necessary.

This command is written as "/S0>12", "/S1>200" etc in human-readable command format.
Zero or one condition can exist in an Action.

## Action human & binary format

Human readable action format:

```
Command = 'e' Action (',' Action)*

Action = (dur:Integer[1,5000]) (Target Value)+ CutoffCondition?

Target
  = 'a' | 'b'  # BT SRV
  | 't' | 'o' | 's'  # BT MV
  | 'v'  # FDW-RS MV

CutoffCondition = '/' 'S' (sensor_index:Integer[0,2]) '>' (sensor_value:Value)

Value = Integer[0, 255]
```

Binary action format:

```
Command = 'e' (num_actions: Uint8) Action+

Action = (dur:Uint16be) (numTVs:Uint7) (numCutoff:Uint1) (Target:Uint8 value:Uint8)+ CutoffCondition?

CutoffCondition = (sensor_index:Uint8) (sensor_value:Uint8)
```


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
|PC4| I2C-SDA  |
|PC5| I2C-SCL  |
|PC6| #RESET  |
|PC7| -  |
|   |  |
|   |  |
|ADC6| SEN-O (rail marker)  |
|ADC7| Rail Sensor  |
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
