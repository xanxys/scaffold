#pragma once

#include <I2C.h>

class IMU {
 private:
  // 7-bit address (common for read & write, MSB is 0)
  const uint8_t i2c_addr7b = 0x6a;

  static constexpr uint8_t CTRL1_XL = 0x10;
  static constexpr uint8_t CTRL2_G = 0x11;
  static constexpr uint8_t ODR_52Hz = 0x30;

  static constexpr uint8_t CTRL9_XL = 0x18;
  static constexpr uint8_t CTRL10_C = 0x19;

  static constexpr uint8_t STATUS = 0x1e;
  static constexpr uint8_t XLDA = 0x1;
  static constexpr uint8_t GDA = 0x2;

  const uint8_t OUTX_L_G = 0x22;
  const uint8_t OUTX_H_G = 0x23;
  const uint8_t OUTY_L_G = 0x24;
  const uint8_t OUTY_H_G = 0x25;
  const uint8_t OUTZ_L_G = 0x26;
  const uint8_t OUTZ_H_G = 0x27;

  const uint8_t OUTX_L_XL = 0x28;

  int16_t gx;

 public:
  IMU() {}

  /**
   * Consult AN4650
   */
  void init() {
    // Start both. Should be in High Performance mode (default).
    I2c.write(i2c_addr7b, CTRL9_XL, (uint8_t)0x38);  // enable X,Y,Z
    I2c.write(i2c_addr7b, CTRL1_XL, ODR_52Hz);

    I2c.write(i2c_addr7b, CTRL10_C, (uint8_t)0x38);  // enable X,Y,Z
    I2c.write(i2c_addr7b, CTRL2_G, ODR_52Hz);
  }

  /**
   * Call at least every 19ms to fetch latest sensor readings.
   * If called too infrequently, aliasing can happen.
   */
  void poll() {
    I2c.read(i2c_addr7b, STATUS, (uint8_t)1);
    uint8_t status = I2c.receive();

    if (status & GDA) {
      I2c.read(i2c_addr7b, OUTX_L_G, (uint8_t)2);

      // 8.75mdps / LSB
      uint16_t raw_gx = I2c.receive();
      raw_gx = static_cast<uint16_t>(I2c.receive()) << 8;
      gx = raw_gx;
    }

    // 0.061mg / LSB
  }

  int16_t read_ang_x() { return gx; }
};
