#include "shared_state.h"

Indicator indicator;
TweliteInterface twelite;
IMU imu;
DCMotor motor_screw(98);
MultiplexedSensor sensor;

volatile bool g_twelite_packet_recv_done = false;
volatile bool g_async_message_avail = false;

void set_5v_power(bool enabled) {
  const uint8_t EN5V = _BV(0);

  if (enabled) {
    PORTB |= EN5V;
  } else {
    PORTB &= ~EN5V;
  }
}

Indicator::Indicator() { DDRC |= _BV(PC0); }

void Indicator::flash_blocking() {
  PORTC |= _BV(PC0);
  delay(50);
  PORTC &= ~_BV(PC0);
  apply_error();
}

void Indicator::enter_error() {
  error = true;
  apply_error();
}

void Indicator::apply_error() {
  if (error) {
    PORTC |= _BV(PC0);
  } else {
    PORTC &= ~_BV(PC0);
  }
}
