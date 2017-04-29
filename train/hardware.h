
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
public:
  const uint8_t portb_mask;
  const uint8_t portb_mask_cw;
  const uint8_t portb_mask_ccw;
private:
  uint8_t pin0;
  uint8_t pin1;
public:
  DCMotor(int pin0, int pin1) : pin0(pin0), pin1(pin1),
      portb_mask_cw(1 << (pin0 - 8)),
      portb_mask_ccw(1 << (pin1 - 8)),
      portb_mask((1 << (pin0 - 8)) | (1 << (pin0 - 8))) {
    pinMode(pin0, OUTPUT);
    pinMode(pin1, OUTPUT);
    digitalWrite(pin0, false);
    digitalWrite(pin1, false);
  }

  void stop() {
    digitalWrite(pin0, false);
    digitalWrite(pin1, false);
  }

  void move(bool cw) {
    digitalWrite(pin0, cw);
    digitalWrite(pin1, !cw);
  }
};
