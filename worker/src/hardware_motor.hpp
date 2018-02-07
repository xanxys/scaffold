#pragma once

#include <I2C.h>

class DCMotor {
 private:
  // 7-bit address (common for read & write, MSB is 0)
  const uint8_t i2c_addr7b;

  static constexpr uint8_t REG_CONTROL = 0;

 public:
  DCMotor(uint8_t i2c_addr) : i2c_addr7b(i2c_addr) {}

  void set_velocity(int8_t speed) {
    uint8_t abs_speed = (speed > 0) ? speed : (-speed);
    uint8_t value;
    // 1,2 corresponds to RESERVED VSET value.
    if (abs_speed < 3) {
      value = 3;  // brake
    } else {
      value = (speed > 0) ? 2 : 1;  // fwd : bwd

      // abs_speed: 0sss ssss
      // value: ssss ssXX (XX=direction)
      value |=
          ((abs_speed << 1) & 0xfc);  // adjust scale & throw away lower 2 bits
    }

    sei();  // w/o this, TWI gets stuck after sending start condtion.
    I2c.write(i2c_addr7b, REG_CONTROL, value);
    //   uint8_t res = Wire.endTransmission();
    cli();
    return;
    /*
    if (res != 0) {
      TWELITE_SEVERE(Cause_HW);  // I2C Failed
    }
    */
  }
};
