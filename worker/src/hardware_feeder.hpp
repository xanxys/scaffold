#pragma once
/* Hardware usage
* Timer0: system clock
* Timer1: action loop
* Timer2: Servo PWM
*/

#include <stdint.h>

enum ServoIx : uint8_t {
  CIX_GR_ROT,
  CIX_GR_CLOSE,
  CIX_LOCK,
  N_SERVOS
};

enum MotorIx : uint8_t {
  MV_VERT,
  N_MOTORS
};
