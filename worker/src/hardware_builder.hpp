#pragma once
/* Hardware usage
 * Timer0: system clock
 * Timer1: action loop
 * Timer2: Servo PWM
 */

#include <stdint.h>

#include "hardware_twelite.hpp"
#include "hardware_imu.hpp"
#include "hardware_motor.hpp"
#include "hardware_sensor.hpp"

enum ServoIx : uint8_t { CIX_A, CIX_B, N_SERVOS };

enum MotorIx : uint8_t { MV_TRAIN, MV_ORI, MV_SCREW_DRIVER, N_MOTORS };

void set_5v_power(bool enabled) {
  const uint8_t EN5V = _BV(0);

  if (enabled) {
    PORTB |= EN5V;
  } else {
    PORTB &= ~EN5V;
  }
}

class Indicator {
 private:
  bool error;

 public:
  Indicator() { DDRC |= _BV(PC0); }

  void flash_blocking() {
    PORTC |= _BV(PC0);
    delay(50);
    PORTC &= ~_BV(PC0);
    apply_error();
  }

  void enter_error() {
    error = true;
    apply_error();
  }

 private:
  void apply_error() {
    if (error) {
      PORTC |= _BV(PC0);
    } else {
      PORTC &= ~_BV(PC0);
    }
  }
};


Indicator indicator;
TweliteInterface twelite;

IMU imu;
DCMotor motor_screw(98);
MultiplexedSensor sensor;

// Non-realtime tasks to do when idle. Higher priority first.
bool process_overmind_command;
bool send_async_message;
