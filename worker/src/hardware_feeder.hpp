#pragma once
/* Hardware usage
* Timer0: system clock
* Timer1: action loop
* Timer2: Servo PWM
*/

#include <stdint.h>

#include "hardware_twelite.hpp"

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


// Perodically measure fixed number of ADC inputs & controls sensor multiplexing.
// Each phase is 2ms.
//
class MultiplexedSensor {
private:
  // Sensor channels.
  static const uint8_t I_BAT = 2;
  static const uint8_t I_SEN_T = 1;
  static const uint8_t I_SEN_O = 6;
  static const uint8_t I_SEN_X = 7;
  static const uint8_t I_INTERNAL_1V1REF = _BV(MUX3) | _BV(MUX2) | _BV(MUX1);

  // Phase definitions.
  const static uint8_t PHASE_SEN_T = 0;
  const static uint8_t PHASE_SEN_O = 1;
  const static uint8_t PHASE_SEN_X = 2;
  const static uint8_t PHASE_AVCC = 3;
  const static uint8_t PHASE_BAT = 4;
  const static uint8_t NUM_PHASES = 5;

  uint8_t current_phase;
  uint8_t phase_index;
  const static uint8_t phase_length = 2;

  uint16_t value_cache[NUM_PHASES];
public:
  MultiplexedSensor() : current_phase(PHASE_SEN_T), phase_index(0) {
  }

  void loop1ms() {
    phase_index++;
    if (phase_index == 1) {
      on_phase_middle();
    } else if (phase_index >= phase_length) {
      on_phase_end();

      phase_index = 0;
      current_phase = (current_phase + 1) % NUM_PHASES;
      on_phase_begin();
    }
  }

  // 0: 0V, 255: 5V ("max")
  uint8_t get_sensor_t() const {
    return value_cache[PHASE_SEN_T] >> 2;
  }

  uint8_t get_sensor_o() const {
    return value_cache[PHASE_SEN_O] >> 2;
  }

  uint8_t get_sensor_x() const {
    return value_cache[PHASE_SEN_X] >> 2;
  }

  uint16_t get_bat_mv() const {
    uint32_t t = value_cache[PHASE_BAT] * 5000L;
    t /= 1024L;
    return t;
  }

  uint16_t get_vcc_mv() const {
    uint32_t result = value_cache[PHASE_AVCC];
    result = (1024L * 1100L) / result; // Back-calculate AVcc in mV
    return result;
  }

  uint8_t get_rate_ms() const {
    return NUM_PHASES * phase_length;
  }

  bool is_start() const {
    return phase_index == 0 && current_phase == 0;
  }
private:
  void on_phase_begin() {
    // Connect AVcc to Vref.
    ADMUX = _BV(REFS0);

    switch (current_phase) {
      case PHASE_SEN_T:
        ADMUX |= I_SEN_T;
        break;
      case PHASE_SEN_O:
        ADMUX |= I_SEN_O;
        break;
      case PHASE_SEN_X:
        ADMUX |= I_SEN_X;
        break;
      case PHASE_AVCC:
        ADMUX |= I_INTERNAL_1V1REF;
      case PHASE_BAT:
        ADMUX |= I_BAT;
        break;
    }
  }

  void on_phase_middle() {
    // Start AD conversion.
    ADCSRA |= _BV(ADSC);
  }

  void on_phase_end() {
    if (!bit_is_set(ADCSRA, ADSC)) {
      // ADCL needs to be read first to ensure consistency.
      value_cache[current_phase] = ADCL;
      value_cache[current_phase] |= ADCH << 8;
    }
  }
};

class DCMotor {
private:
  // 7-bit address (common for read & write, MSB is 0)
  const uint8_t i2c_addr7b;
public:
  DCMotor(uint8_t i2c_addr) : i2c_addr7b(i2c_addr >> 1) {
  }

  void set_velocity(int8_t speed) {
    uint8_t abs_speed = (speed > 0) ? speed : (-speed);
    uint8_t value;
    if (abs_speed < 3) {  // 1,2 corresponds to RESERVED VSET value.
      value = 3;  // brake
    } else {
      value = (speed > 0) ? 2 : 1;  // fwd : bwd

      // abs_speed: 0sss ssss
      // value: ssss ssXX (XX=direction)
      value |= ((abs_speed << 1) & 0xfc);  // adjust scale & throw away lower 2 bits
    }

    sei();  // w/o this, TWI gets stuck after sending start condtion.
    Wire.beginTransmission(i2c_addr7b);
    Wire.write(0);  // CONTROL register
    Wire.write((byte)value);
    uint8_t res = Wire.endTransmission();
    cli();

    if (res != 0) {
      twelite.warn("I2C failed");
    }
  }
};
