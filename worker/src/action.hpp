#pragma once

#include "hardware.hpp"

const int N_SERVOS = 2;
const int CIX_A = 0;
const int CIX_B = 1;

const int N_MOTORS = 3;
const int MV_TRAIN = 0;
const int MV_ORI = 1;
const int MV_SCREW_DRIVER = 2;


const static int PWM_STEP_US = 20;
const static int STEP_MS = 16;

// Max duration = (256*NUM_SUB_ACTIONS) ms

// Safely calculate va + (vb - va) * (ix / num)
uint8_t interp(uint8_t va, uint8_t vb, uint8_t ix, uint8_t num) {
  uint8_t delta = (vb > va) ? vb - va : va - vb;
  uint8_t dv = (static_cast<uint16_t>(delta) * ix) / num;
  return (vb > va) ? va + dv : va - dv;
}

class Action {
public:
  // Note this can be 0, but action still has effect.
  uint8_t duration_step;

  const static uint8_t SERVO_POS_KEEP = 0xff;
  // 20~100
  uint8_t servo_pos[N_SERVOS];

  // -0x7f~0x7f (max CCW~max CW), 0x80: keep
  const static int8_t MOTOR_VEL_KEEP = 0x80;
  int8_t motor_vel[N_MOTORS];

  Action() : Action(0) {}

  Action(uint16_t duration_ms) :
      duration_step(duration_ms / STEP_MS),
      servo_pos{SERVO_POS_KEEP, SERVO_POS_KEEP},
      motor_vel{MOTOR_VEL_KEEP, MOTOR_VEL_KEEP, MOTOR_VEL_KEEP} {
  }

  void print_json() {
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
  uint8_t elapsed_step;

  uint8_t servo_pos_pre[N_SERVOS];
public:
  ActionExecState() : action(NULL) {}

  ActionExecState(const Action* action, const uint8_t* servo_pos) : action(action), elapsed_step(0) {
    for (int i = 0; i < N_SERVOS; i++) {
      servo_pos_pre[i] = servo_pos[i];
    }
  }

  // Somehow heavy because of u16/u8 3 divisions.
  void step(uint8_t* servo_pos_out, int8_t* motor_vel_out) {
    if (action == NULL) {
      return;
    }

    for (int i = 0; i < N_SERVOS; i++) {
      const uint8_t targ_pos = action->servo_pos[i];
      if (targ_pos != Action::SERVO_POS_KEEP) {
        servo_pos_out[i] = interp(servo_pos_pre[i], targ_pos, elapsed_step + 1, action->duration_step + 1);
      }
    }
    for (int i = 0; i < N_MOTORS; i++) {
      const int8_t targ_vel = action->motor_vel[i];
      if (targ_vel != Action::MOTOR_VEL_KEEP) {
        motor_vel_out[i] = targ_vel;
      }
    }
    elapsed_step++;
  }

  bool is_running() {
    return action != NULL && (elapsed_step <= action->duration_step);
  }

  void print_json() {
    request_log.print('{');

    request_log.print_dict_key("type");
    if (is_running()) {
      request_log.print_str("run");
      request_log.print(',');

      request_log.print_dict_key("elapsed/step");
      request_log.print(elapsed_step);
      request_log.print(',');

      request_log.print_dict_key("duration/step");
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
  const static int SIZE = 6;
private:
  Action queue[SIZE];
  int ix = 0;
  int n = 0;
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

  uint8_t count() {
    return n;
  }

  void print_json() {
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

  // This is very important cnstant.
  // In GWS PICO+ F BB, if you make it 200 (2ms, for example)
  // they randomly vibrate when set to some pulse width.
  // Apparently this needs to be longer than that.
  static const uint8_t SERVO_PWM_NUM_PHASE = 250;
  static const uint8_t SERVO_PWM_ON_PHASES = 20;
  uint8_t servo_pwm_phase;
  uint8_t servo_portd_mask_union;
  uint8_t servo_pwm_offset[N_SERVOS];

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
public:
  ActionExecutorSingleton() :
      servo_pos{50, 5},
      motors{
        // train
        DCMotor(0xc0),
        // ori
        DCMotor(0xc2),
        // screw
        DCMotor(0xc4)
      } {
    // Init servo PWM (freq_pwm=61.0Hz, dur=16.4 ms)
    TCCR2A = TCCR2A_FAST_PWM | TCCR2A_A_NON_INVERT | TCCR2A_B_NON_INVERT;
    TCCR2B = TCCR2B_PRESCALER_1024;

    // Set PWM ports as output.
    DDRB |= _BV(3); // PWMA
    DDRD |= _BV(3); // PWMB

    // Init I2C bus for DC PWM motors.
    Wire.begin();
    // TWBR = 255;  // about 30kHz. (default 100kHz is too fast w/ internal pullups)

    commit_posvel();
  }

  void loop1ms() {
    sensor.loop1ms();

    if (state.is_running()) {
        state.step(servo_pos, motor_vel);
        commit_posvel();
    } else {
      // Fetch new action.
      Action* new_action = queue.pop();
      state = ActionExecState(new_action, servo_pos);
    }
  }

  void enqueue(Action& a) {
    queue.enqueue(a);
  }

  bool is_idle() {
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

  void print() {
    request_log.print('{');

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
  void print_system_status() {
    request_log.print('{');

    request_log.print_dict_key("pwr/mV");
    request_log.print((uint16_t) sensor.get_vcc_mv());
    request_log.print(',');

    request_log.print_dict_key("uptime/s");
    uint32_t uptime_sec = millis() / 1000;
    request_log.print(uptime_sec);

    request_log.print('}');
  }

  void print_sensor_status() {
    request_log.print('{');

    request_log.print_dict_key("L");
    request_log.print(sensor.get_sensor_l());
    request_log.print(',');

    request_log.print_dict_key("R");
    request_log.print(sensor.get_sensor_r());

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

  void print_output_json() {
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
