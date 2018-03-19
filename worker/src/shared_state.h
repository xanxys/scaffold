#pragma once
/* Hardware usage
 * Timer0: system clock
 * Timer1: action loop
 * Timer2: Servo PWM
 */

#include "hardware_imu.hpp"
#include "hardware_motor.hpp"
#include "hardware_sensor.hpp"
#include "hardware_twelite.h"
#include "hardware_odometry.hpp"

enum ServoIx : uint8_t { CIX_A, CIX_B, N_SERVOS };
enum MotorIx : uint8_t { MV_TRAIN, MV_ORI, MV_SCREW_DRIVER, N_MOTORS };

void set_5v_power(bool enabled);

class Indicator {
 private:
  bool error;

 public:
  Indicator();
  void flash_blocking();
  void enter_error();

 private:
  void apply_error();
};

// Shared global hardware objects.
extern Indicator indicator;
extern TweliteInterface twelite;

extern IMU imu;
extern DCMotor motor_screw;
extern MultiplexedSensor sensor;
extern Odometry odometry;

// Worker-wide shared status flags.
extern volatile bool g_twelite_packet_recv_done;
extern volatile bool g_async_message_avail;

extern volatile uint16_t g_async_sensor_ttl_ms;
extern volatile uint16_t g_async_sensor_since_last_sent_ms;
