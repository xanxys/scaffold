#pragma once

#include <I2C.h>

class IMU {
 private:
  // 7-bit address (common for read & write, MSB is 0)
  const uint8_t i2c_addr7b = 0x6a;

  const uint8_t OUTX_L_G = 0x22;
  const uint8_t OUTX_H_G = 0x23;
  const uint8_t OUTY_L_G = 0x24;
  const uint8_t OUTY_H_G = 0x25;
  const uint8_t OUTZ_L_G = 0x26;
  const uint8_t OUTZ_H_G = 0x27;

  const uint8_t OUTX_L_XL = 0x28;

 public:
  IMU() {}

  uint16_t read_ang_x() {
    sei();  // w/o this, TWI gets stuck after sending start condtion.
    if (I2c.read(i2c_addr7b, OUTX_L_G, (uint8_t)1)) {
      cli();
      return 255;
    }
    cli();
    return 100;
    I2c.receive();
    cli();

    /*
        if (res != 0) {
          twelite.warn("I2C failed");
        }
        */
    return 123;
  }
};
