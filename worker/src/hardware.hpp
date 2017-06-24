#pragma once
/* Hardware usage

* Timer0: system clock
* Timer1: Servo
* Timer2: <custom, action executor / PWM>

*/


// GWServo PICO
// 10-150: active range
// +: CW (top view), -: CCW

#include <stdint.h>

void enable_error_indicator() {

}

class Indicator {
public:
  Indicator() {
    PORTC |= _BV(PC0);
  }

  void flash_blocking() {
    PORTC |= _BV(PC0);
    delay(50);
    PORTC &= ~_BV(PC0);
  }
};

// Perodically measure fixed number of ADC inputs & controls sensor multiplexing.
// Currently:
// 1. Sensor-R
// 2. Sensor-L
// 3. AVcc
// Each phase is 2ms.
//
class MultiplexedSensor {
private:
  // Sensor illuminators.
  static const uint8_t I_SEN_LIGHT_L = 3;
  static const uint8_t I_SEN_LIGHT_R = 7;

  // Sensor channels.
  static const uint8_t I_SEN_ADC = 6;
  static const uint8_t I_INTERNAL_1V1REF = _BV(MUX3) | _BV(MUX2) | _BV(MUX1);

  // Phase definitions.
  const static uint8_t PHASE_SEN_R = 0;
  const static uint8_t PHASE_SEN_L = 1;
  const static uint8_t PHASE_AVCC = 2;
  const static uint8_t NUM_PHASES = 3;

  uint8_t current_phase;
  uint8_t phase_index;
  const static uint8_t phase_length = 2;

  uint16_t value_cache[NUM_PHASES];
public:
  MultiplexedSensor() : current_phase(PHASE_SEN_R), phase_index(0) {
    // Init sensor illuminator.
    DDRD |= _BV(I_SEN_LIGHT_R) | _BV(I_SEN_LIGHT_L);

    // Bogus result that reads as 123 | 45 when unitialized.
    value_cache[PHASE_SEN_L] = 123 << 2;
    value_cache[PHASE_SEN_R] = 45 << 2;
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
  uint8_t get_sensor_r() {
    return value_cache[PHASE_SEN_R] >> 2;
  }

  uint8_t get_sensor_l() {
    return value_cache[PHASE_SEN_L] >> 2;
  }

  uint16_t get_vcc_mv() {
    uint32_t result = value_cache[PHASE_AVCC];
    result = (1024L * 1100L) / result; // Back-calculate AVcc in mV
    return result;
  }
private:
  void on_phase_begin() {
    // Connect AVcc to Vref.
    ADMUX = _BV(REFS0);

    switch (current_phase) {
      case PHASE_SEN_R:
        ADMUX |= I_SEN_ADC;
        PORTD |= _BV(I_SEN_LIGHT_R);
        break;
      case PHASE_SEN_L:
        ADMUX |= I_SEN_ADC;
        PORTD |= _BV(I_SEN_LIGHT_L);
        break;
      case PHASE_AVCC:
        ADMUX |= I_INTERNAL_1V1REF;
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

    switch (current_phase) {
      case PHASE_SEN_R:
        PORTD &= ~_BV(I_SEN_LIGHT_R);
        break;
      case PHASE_SEN_L:
        PORTD &= ~_BV(I_SEN_LIGHT_L);
        break;
      default:
        break;
    }
  }
};

class CalibratedServo {
public:
  const uint8_t portd_mask;
private:
  int pin;
public:
  // pin must be in [0, 8) (i.e. PORTD).
  CalibratedServo(int pin) :
    portd_mask(1 << pin), pin(pin) {
    pinMode(pin, OUTPUT);
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
      enable_error_indicator();
      /*
      Serial.print("[ERR] I2C failed:");
      Serial.println((int)res);
      */
    }
  }
};
