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
  constexpr static uint8_t addr =
      20;  // designed to be 0x0c, but somehow ended up being 20.

  // Commands
  constexpr static uint8_t WRITE_REGISTER = 0x60;

  constexpr static uint8_t STATUS_BURST_MODE = _BV(7);
  constexpr static uint8_t STATUS_ERROR = _BV(4);

  struct __attribute__((__packed__)) U16Be {
    uint8_t h;
    uint8_t l;
  };

  struct __attribute__((__packed__)) ReadMeasurementResult {
    uint8_t status;
    U16Be x, y, z;
  };

 public:
  bool init_success = false;
  int16_t vx = 0;
  int16_t vy = 0;

  void init() {
    // Reset command.
    // I2c.write(addr, (uint8_t)0xf0);
    // delay(10);

    // Set RES{x,y,z} = 2, OSR=0, DIG_FILT=0
    write_reg(2, 0b101010 << 5);

    // COMM_MODE=I2C (0b11), BURST_DATE_RATE=1
    write_reg(1, (0b11 << 13) | 1);

    // GAIN=5, HALL_PLATE=0xc (default)
    write_reg(0, 0x5c);

    // Enter "Burst Mode", with measurement in all magnetic channels (Z, Y, X).
    //  I2c.write(addr, (uint8_t)0x1e);
    init_success = true;
    return;

    uint8_t status;
    uint8_t code = I2c.read(addr, 0x1e, (uint8_t)1, &status);
    vx = status + 1000;

    if ((status & STATUS_BURST_MODE) && !(status & STATUS_ERROR)) {
      init_success = true;
    }
  }

  void poll() {
    if (!init_success) {
      return;
    }
    uint8_t status;
    uint8_t code = I2c.read(addr, 0x3e, (uint8_t)1, &status);
    if (code != 0) {
      vx = 1000 + code;
      return;
    }
    if (status & STATUS_ERROR) {
      vx = 2000 + status;
      return;
    }
    delay(100);

    // Read measurement command
    I2c.write(addr, (uint8_t)0x4e);

    ReadMeasurementResult result;
    code = I2c.read(addr, 7, reinterpret_cast<uint8_t*>(&result));
    if (code != 0) {
      vx = 3000 + code;
      return;
    }
    if (result.status & STATUS_ERROR) {
      vx = 4000 + result.status;
      return;
    }
    // Expecting 6B data. -> must be 2 (2x2 + 2 = 6)
    if (result.status & 3 != 2) {
      vx = 5001;
      return;
    }
    vx = decode_value(result.x);
    vy = decode_value(result.y);
  }

 private:
  void write_reg(uint8_t mem_addr, uint16_t val) {
    uint8_t command[3];
    command[0] = val >> 8;
    command[1] = val & 0xff;
    command[2] = mem_addr << 2;
    I2c.write(addr, WRITE_REGISTER, command, (uint8_t)sizeof(command));

    uint8_t status;
    I2c.read(addr, 1, &status);
  }

  int16_t decode_value(const U16Be& v) {
    uint16_t temp = (((uint16_t)v.h) << 8) + v.l;
    if (temp > 0x8000) {
      return temp - 0x8000;
    } else {
      return -(0x8000 - temp);
    }
  }
};
