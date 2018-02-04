#pragma once

#include <I2C.h>

/**
 * Driver for STMicro LSM6DS3 Inertial Measurement Unit.
 */
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

  static constexpr uint8_t OUTX_L_G = 0x22;  // ~0x27(OUTZ_H_G)
  static constexpr uint8_t OUTX_L_XL = 0x28;

 public:
  // 8.75mdps / LSB
  int16_t gyro[3];

  // 0.061mg / LSB
  int16_t acc[3];

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
      I2c.read(i2c_addr7b, OUTX_L_G, (uint8_t)6);
      for (uint8_t axis = 0; axis < 3; axis++) {
        uint16_t val = I2c.receive();
        val |= static_cast<uint16_t>(I2c.receive()) << 8;
        gyro[axis] = val;
      }
    }

    if (status & XLDA) {
      I2c.read(i2c_addr7b, OUTX_L_XL, (uint8_t)6);
      for (uint8_t axis = 0; axis < 3; axis++) {
        uint16_t val = I2c.receive();
        val |= static_cast<uint16_t>(I2c.receive()) << 8;
        acc[axis] = val;
      }
    }
  }

  int16_t read_ang_x() { return gyro[0]; }
};
