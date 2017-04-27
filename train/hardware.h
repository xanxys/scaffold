#pragma once

/* Hardware usage

* Timer0: system clock
* Timer1: Servo
* Timer2: <custom, action executor / PWM>

*/


// GWServo PICO
// 10-150: active range
// +: CW (top view), -: CCW


void setup_hw() {
  Serial.begin(9600);

  dump_arm.attach(6);
  train_ori.attach(5);
  driver_arm.attach(7);

  pinMode(8, OUTPUT);
  pinMode(9, OUTPUT);
  digitalWrite(8, false);
  digitalWrite(9, false);
}

class CalibratedServo {
private:
  Servo servo;
  // Initial angle for assembly.
  // There will be a hardware marker, rotation error will be corrected by offset.
  int rot_assy;

  // Initial angle after reset in normal operation.
  int rot_init;

  // Actual output to add. Will be saved, reset to 0 upon entering (re-)calibration.
  int offset;
public:
  void set(uint8_t targ) {
    servo.write(static_cast<int>(targ) + offset);
  }
};

class DCMotor {
private:
  uint8_t pin0;
  uint8_t pin1;
public:
  DCMotor(int pin0, int pin1) : pin0(pin0), pin1(pin1) {
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
