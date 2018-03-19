#pragma once

#include <I2C.h>

/**
 * Driver for MLX90393 magnetic sensor, which is coupled to measure main axis
 * gear rotation. ds:
 * https://cdn.sparkfun.com/assets/learn_tutorials/5/7/7/MLX90393-Datasheet-Melexis.PDF
 *
 * sample code:
 * https://github.com/ControlEverythingCommunity/MLX90393/blob/master/Arduino/MLX90393.ino
 */
class Odometry {
 private:
  constexpr static uint8_t addr = 0x0c;

  struct ReadMeasurementResult {
    uint8_t status;

    uint8_t xh;
    uint8_t xl;

    uint8_t yh;
    uint8_t yl;

    uint8_t zh;
    uint8_t zl;
  };

 public:
  void init() {
    // Enter "Burst Mode", with measurement in all magnetic channels (Z, Y, X).
    I2c.write(addr, (uint8_t) 0x1e);
  }

  uint16_t read() {
    ReadMeasurementResult result;
    I2c.read(addr, 7, reinterpret_cast<uint8_t*>(&result));

    return result.xh * 256 + result.xl;
  }
};
