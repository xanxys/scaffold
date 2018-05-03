#pragma once

// Perodically measure fixed number of ADC inputs & controls sensor
// multiplexing. Each phase is 2ms.
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
  MultiplexedSensor() : current_phase(PHASE_SEN_T), phase_index(0) {}

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
  uint8_t get_sensor0() const { return value_cache[PHASE_SEN_T] >> 2; }

  uint8_t get_sensor1() const { return value_cache[PHASE_SEN_O] >> 2; }

  uint8_t get_sensor2() const { return value_cache[PHASE_SEN_X] >> 2; }

  // DEPRECATED
  uint8_t get_sensor_t() const { return value_cache[PHASE_SEN_T] >> 2; }

  uint8_t get_sensor_o() const { return value_cache[PHASE_SEN_O] >> 2; }

  uint8_t get_sensor_x() const { return value_cache[PHASE_SEN_X] >> 2; }

  uint8_t get_sensor_v() const { return value_cache[PHASE_SEN_T] >> 2; }

  uint16_t get_bat_mv() const {
    // Vref = Vcc
    // Vadc = Vbat / 2 (halved by the resistors)
    uint32_t t = value_cache[PHASE_BAT] * (get_vcc_mv() * 2L);
    t /= 1024L;
    return t;
  }

  uint16_t get_vcc_mv() const {
    uint32_t result = value_cache[PHASE_AVCC];
    result = (1024L * 1100L) / result;  // Back-calculate AVcc in mV
    return result;
  }

  uint8_t get_rate_ms() const { return NUM_PHASES * phase_length; }

  bool is_start() const { return phase_index == 0 && current_phase == 0; }

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
