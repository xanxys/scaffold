
/* Hardware usage

* Timer0: system clock
* Timer1: Servo
* Timer2: <custom, action executor / PWM>

*/


// GWServo PICO
// 10-150: active range
// +: CW (top view), -: CCW

class CalibratedServo {
public:
  const uint8_t portd_mask;
private:
  int pin;

  // Initial angle for assembly.
  // There will be a hardware marker, rotation error will be corrected by offset.
  int rot_assy;

  // Initial angle after reset in normal operation.
  int rot_init;

  // Actual output to add. Will be saved, reset to 0 upon entering (re-)calibration.
  int offset;
public:
  // pin must be in [0, 8) (i.e. PORTD).
  CalibratedServo(int pin, int rot_assy, int rot_init) :
    portd_mask(1 << pin), pin(pin), rot_assy(rot_assy), rot_init(rot_init), offset(0) {
    pinMode(pin, OUTPUT);
  }

  void raw_set(bool bit) {

    digitalWrite(pin, bit);
  }
};

class DCMotor {
private:
  // 7-bit address (common for read & write, MSB is 0)
  const uint8_t i2c_addr7b;
public:
  DCMotor(uint8_t i2c_addr) : i2c_addr7b(i2c_addr >> 1) {
  }

  void set_velocity(int8_t speed) {
    uint8_t abs_speed = (speed > 0) ? speed : (-speed);
    uint8_t value;
    if (abs_speed < 3) {  // 1,2 corresponds to RESERVED VSET value.
      value = 3;  // brake
    } else {
      value = (speed > 0) ? 2 : 1;  // fwd : bwd

      // abs_speed: 0sss ssss
      // value: ssss ssXX (XX=direction)
      value |= ((abs_speed << 1) & 0xfc);  // adjust scale & throw away lower 2 bits
    }

    sei();  // w/o this, TWI gets stuck after sending start condtion.
    Wire.beginTransmission(i2c_addr7b);
    Wire.write(0);  // CONTROL register
    Wire.write((byte)value);
    uint8_t res = Wire.endTransmission();
    cli();

    if (res != 0) {
      Serial.print("[ERR] I2C failed:");
      Serial.println((int)res);
    }
  }
};
