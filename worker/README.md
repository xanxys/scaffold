## Error Handling Policy

* Discrete data (command type): Ignore & warn
* Analog data (duration, pos, vel): Clip & warn


## Size Shrink Tips
```
scons; and avr-size build/fw.elf
```
