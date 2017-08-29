#pragma once

#include "hardware.hpp"

const int N_SERVOS = 2;
const int CIX_A = 0;
const int CIX_B = 1;

const int N_MOTORS = 3;
const int MV_TRAIN = 0;
const int MV_ORI = 1;
const int MV_SCREW_DRIVER = 2;

// Safely calculate va + (vb - va) * (ix / num)
uint8_t interp(uint8_t va, uint8_t vb, uint8_t ix, uint8_t num) {
  uint8_t delta = (vb > va) ? vb - va : va - vb;
  uint8_t dv = (static_cast<uint16_t>(delta) * ix) / num;
  return (vb > va) ? va + dv : va - dv;
}

class Action {
public:
  // At the beginning of this action, report sensor cache.
  // Note that reporting can cause some jankiness (a few ms) in command execution.
  bool report;

  // Set train=0 when sensor reading > this value.
  // 255 means disable this functionality.
  uint8_t train_cutoff_thresh = 255;

  // Note this can be 0, but action still has effect.
  uint16_t duration_step;

  const static uint8_t SERVO_POS_KEEP = 0xff;
  // 20~100
  uint8_t servo_pos[N_SERVOS];

  // -0x7f~0x7f (max CCW~max CW), 0x80: keep
  const static int8_t MOTOR_VEL_KEEP = 0x80;
  int8_t motor_vel[N_MOTORS];

  Action() : Action(0) {}

  Action(uint16_t duration_ms) :
      report(false),
      duration_step(duration_ms),
      servo_pos{SERVO_POS_KEEP, SERVO_POS_KEEP},
      motor_vel{MOTOR_VEL_KEEP, MOTOR_VEL_KEEP, MOTOR_VEL_KEEP} {
  }

  void print_json() const {
    request_log.print('[');

    request_log.print('[');
    for (int i = 0; i < N_SERVOS; i++) {
      uint8_t v = servo_pos[i];
      if (v == SERVO_POS_KEEP) {
        request_log.print_str("KEEP");
      } else {
        request_log.print(v);
      }
      if (i != N_SERVOS - 1) {
        request_log.print(',');
      }
    }
    request_log.print(']');
    request_log.print(',');

    request_log.print('[');
    for (int i = 0; i < N_MOTORS; i++) {
      int8_t v = motor_vel[i];
      if (v == MOTOR_VEL_KEEP) {
        request_log.print_str("KEEP");
      } else {
        request_log.print(v);
      }
      if (i != N_MOTORS - 1) {
        request_log.print(",");
      }
    }
    request_log.print(']');

    request_log.print(']');
  }
};

// ActionExecState = Zero | Executing
class ActionExecState {
private:
  // Nullable current action being executed.
  const Action* action;
  // elapsed time since starting exec of current action.
  // Don't care when action is null.
  uint16_t elapsed_step;

  uint8_t servo_pos_pre[N_SERVOS];
public:
  ActionExecState() : action(NULL) {}

  ActionExecState(const Action* action, const uint8_t* servo_pos) : action(action), elapsed_step(0) {
    for (int i = 0; i < N_SERVOS; i++) {
      servo_pos_pre[i] = servo_pos[i];
    }
  }

  void step(const MultiplexedSensor& sensor, uint8_t* servo_pos_out, int8_t* motor_vel_out) {
    if (action == NULL) {
      return;
    }

    for (int8_t i = 0; i < N_SERVOS; i++) {
      const uint8_t targ_pos = action->servo_pos[i];
      if (targ_pos != Action::SERVO_POS_KEEP) {
        servo_pos_out[i] = interp(servo_pos_pre[i], targ_pos, (elapsed_step >> 4) + 1, (action->duration_step >> 4) + 1);
      }
    }
    for (int8_t i = 0; i < N_MOTORS; i++) {
      const int8_t targ_vel = action->motor_vel[i];
      if (targ_vel != Action::MOTOR_VEL_KEEP) {
        motor_vel_out[i] = targ_vel;
      }
    }
    if (sensor.get_sensor_t() > action->train_cutoff_thresh) {
      motor_vel_out[MV_TRAIN] = 0;
    }
    elapsed_step++;
  }

  bool is_running() const {
    return action != NULL && (elapsed_step <= action->duration_step);
  }

  void print_json() const {
    request_log.print('{');

    request_log.print_dict_key("type");
    if (is_running()) {
      request_log.print_str("run");
      request_log.print(',');

      request_log.print_dict_key("elapsed/ms");
      request_log.print(elapsed_step);
      request_log.print(',');

      request_log.print_dict_key("duration/ms");
      request_log.print(action->duration_step);
    } else if (action != NULL) {
      request_log.print_str("done");
    } else {
      request_log.print_str("idle");
    }

    request_log.print('}');
  }
};

class ActionQueue {
public:
  const static uint8_t SIZE = 6;
private:
  Action queue[SIZE];
  uint8_t ix = 0;
  uint8_t n = 0;
public:
  void enqueue(const Action& a) {
    queue[(ix + n) % SIZE] = a;
    n += 1;
  }

  Action* peek() {
    if (n == 0) {
      return NULL;
    } else {
      return &queue[ix];
    }
  }

  Action* pop() {
    if (n == 0) {
      return NULL;
    } else {
      Action* ptr = &queue[ix];
      ix = (ix + 1) % SIZE;
      n -= 1;
      return ptr;
    }
  }

  void clear() {
    n = 0;
  }

  uint8_t count() const {
    return n;
  }

  void print_json() const {
    request_log.print('{');

    request_log.print_dict_key("actions");
    request_log.print('[');
    for (int i = 0; i < n; i++) {
      queue[(ix + i) % SIZE].print_json();
      if (i != n -1) {
        request_log.print(',');
      }
    }
    request_log.print(']');
    request_log.print(',');

    request_log.print_dict_key("free");
    request_log.print(SIZE - n);

    request_log.print('}');
  }
};

// Must be instantiated at most only after reset.
class ActionExecutorSingleton {
public:
  ActionQueue queue;
  ActionExecState state;

  // Position based control. Set position will be maintained automatically (using Timer1)
  // in Calibrated Servo.
  uint8_t servo_pos[N_SERVOS];

  // Velocity based control for DC motors. This class is responsible for PWM-ing them,
  // even when no action is being executed.
  // -0x7f~0x7f (7 bit effective)
  DCMotor motors[N_MOTORS];
  int8_t motor_vel[N_MOTORS];
  int8_t motor_vel_prev[N_MOTORS];

  MultiplexedSensor sensor;

  static const uint8_t TCCR2A_FAST_PWM = _BV(WGM21) | _BV(WGM20);
  static const uint8_t TCCR2A_A_NON_INVERT = _BV(COM2A1);
  static const uint8_t TCCR2A_B_NON_INVERT = _BV(COM2B1);
  static const uint8_t TCCR2B_PRESCALER_256 = _BV(CS22) | _BV(CS21);
  static const uint8_t TCCR2B_PRESCALER_1024 = _BV(CS22) | _BV(CS21) | _BV(CS20);

  static const uint8_t T_SEN_CACHE_SIZE = 100;
  uint8_t tr_sensor_cache[T_SEN_CACHE_SIZE];
  uint8_t tr_sensor_cache_ix;
public:
  ActionExecutorSingleton() :
      servo_pos{50, 5},
      motors{
        // train
        DCMotor(0xc0),
        // ori
        DCMotor(0xc2),
        // screw
        DCMotor(0xc8)
      } {
    // Init servo PWM (freq_pwm=61.0Hz, dur=16.4 ms)
    TCCR2A = TCCR2A_FAST_PWM | TCCR2A_A_NON_INVERT | TCCR2A_B_NON_INVERT;
    TCCR2B = TCCR2B_PRESCALER_1024;

    // Set PWM ports as output.
    DDRB |= _BV(3); // PWMA
    DDRD |= _BV(3); // PWMB

    // Init I2C bus for DC PWM motors.
    Wire.begin();

    commit_posvel();
  }

  void loop1ms() {
    sensor.loop1ms();

    if (state.is_running()) {
        state.step(sensor, servo_pos, motor_vel);
        if (sensor.is_start()) {
          if (tr_sensor_cache_ix < T_SEN_CACHE_SIZE) {
            tr_sensor_cache[tr_sensor_cache_ix] = sensor.get_sensor_t();
            tr_sensor_cache_ix++;
          }
        }
        commit_posvel();
    } else {
      // Fetch new action.
      Action* new_action = queue.pop();
      state = ActionExecState(new_action, servo_pos);
      if (new_action != NULL) {
        if (new_action->report) {
          report_cache();
        }
        tr_sensor_cache_ix = 0;
      }
    }
  }

  void enqueue(Action& a) {
    queue.enqueue(a);
  }

  bool is_idle() const {
    return queue.count() == 0 && !state.is_running();
  }

  void cancel_all() {
    state = ActionExecState();
    queue.clear();
    for (int i = 0; i < N_MOTORS; i++) {
      motor_vel[i] = 0;
    }
    commit_posvel();
  }

  void print() const {
    request_log.begin_std_dict("STATUS");

    request_log.print_dict_key("out");
    print_output_json();
    request_log.print(',');

    request_log.print_dict_key("system");
    print_system_status();
    request_log.print(',');

    request_log.print_dict_key("sensor");
    print_sensor_status();
    request_log.print(',');

    request_log.print_dict_key("state");
    state.print_json();
    request_log.print(',');

    request_log.print_dict_key("queue");
    queue.print_json();

    request_log.print('}');
  }
private:
  void report_cache() const {
    request_log.begin_std_dict("SENSOR_CACHE");

    request_log.print_dict_key("rate/ms");
    request_log.print(sensor.get_rate_ms());
    request_log.print(',');

    request_log.print_dict_key("val");
    request_log.print('[');
    for (uint8_t i = 0; i < tr_sensor_cache_ix; i++) {
      request_log.print(tr_sensor_cache[i]);
      if (i != tr_sensor_cache_ix - 1) {
        request_log.print(',');
      }
    }
    request_log.print(']');

    request_log.print('}');

    // We cannot send directly, probably because timer interrupt disables Serial
    // interrupts and get stuck?
    request_log.send_soon();
  }

  void print_system_status() const {
    request_log.print('{');

    request_log.print_dict_key("vcc/mV");
    request_log.print((uint16_t) sensor.get_vcc_mv());
    request_log.print(',');

    request_log.print_dict_key("bat/mV");
    request_log.print((uint16_t) sensor.get_bat_mv());
    request_log.print(',');

    request_log.print_dict_key("data_recv/B");
    request_log.print(twelite.get_data_bytes_recv());
    request_log.print(',');

    request_log.print_dict_key("data_sent/B");
    request_log.print(twelite.get_data_bytes_sent());

    request_log.print('}');
  }

  void print_sensor_status() const {
    request_log.print('{');

    request_log.print_dict_key("T");
    request_log.print(sensor.get_sensor_t());
    request_log.print(',');

    request_log.print_dict_key("O");
    request_log.print(sensor.get_sensor_o());
    request_log.print(',');

    request_log.print_dict_key("X");
    request_log.print(sensor.get_sensor_x());

    request_log.print('}');
  }

  void commit_posvel() {
    // Set PWM
    OCR2A = servo_pos[CIX_A];
    OCR2B = servo_pos[CIX_B];

    // I2C takes time, need to conserve time. Otherwise MCU become
    // unresponsive.
    for (int i = 0; i < N_MOTORS; i++) {
      if (motor_vel[i] != motor_vel_prev[i]) {
        motors[i].set_velocity(motor_vel[i]);
        motor_vel_prev[i] = motor_vel[i];
      }
    }
  }

  void print_output_json() const {
    request_log.print('[');

    request_log.print('[');
    for (int i = 0; i < N_SERVOS; i++) {
      uint8_t v = servo_pos[i];
      request_log.print(v);
      if (i != N_SERVOS - 1) {
        request_log.print(',');
      }
    }
    request_log.print(']');

    request_log.print(',');

    request_log.print('[');
    for (int i = 0; i < N_MOTORS; i++) {
      int8_t v = motor_vel[i];
      request_log.print(v);
      if (i != N_MOTORS - 1) {
        request_log.print(",");
      }
    }
    request_log.print(']');

    request_log.print(']');
  }
};
