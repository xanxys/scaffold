#pragma once

#include "hardware_builder.hpp"

#include <I2C.h>

// Safely calculate va + (vb - va) * (ix / num)
uint8_t interp(uint8_t va, uint8_t vb, uint8_t ix, uint8_t num) {
  uint8_t delta = (vb > va) ? vb - va : va - vb;
  uint8_t dv = (static_cast<uint16_t>(delta) * ix) / num;
  return (vb > va) ? va + dv : va - dv;
}

class Action {
 public:
  // At the beginning of this action, report sensor cache.
  // Note that reporting can cause some jankiness (astate few ms) in command
  // execution.
  bool report;

#ifdef WORKER_TYPE_BUILDER
  // Set train=0 when sensor reading > this value.
  // 255 means disable this functionality.
  uint8_t train_cutoff_thresh = 255;
#endif

  // Note this can be 0, but action still has effect.
  uint16_t duration_step;

  const static uint8_t SERVO_POS_KEEP = 0xff;
  // 20~100
  uint8_t servo_pos[N_SERVOS];

  // -0x7f~0x7f (max CCW~max CW), 0x80: keep
  const static int8_t MOTOR_VEL_KEEP = 0x80;
  int8_t motor_vel[N_MOTORS];

  Action() : Action(0) {}

  Action(uint16_t duration_ms) : report(false), duration_step(duration_ms) {
    for (int i = 0; i < N_SERVOS; i++) {
      servo_pos[i] = SERVO_POS_KEEP;
    }
    for (int i = 0; i < N_MOTORS; i++) {
      motor_vel[i] = MOTOR_VEL_KEEP;
    }
  }

  void print_json(JsonElement e) const {
    JsonArray arr = e.as_array();

    JsonArray sv = arr.add().as_array();
    for (int i = 0; i < N_SERVOS; i++) {
      uint8_t v = servo_pos[i];
      if (v == SERVO_POS_KEEP) {
        sv.add().set("KEEP");
      } else {
        sv.add().set(v);
      }
    }
    sv.end();

    JsonArray mot = arr.add().as_array();
    for (int i = 0; i < N_MOTORS; i++) {
      int8_t v = motor_vel[i];
      if (v == MOTOR_VEL_KEEP) {
        mot.add().set("KEEP");
      } else {
        mot.add().set(v);
      }
    }
    mot.end();

    arr.end();
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

  ActionExecState(const Action* action, const uint8_t* servo_pos)
      : action(action), elapsed_step(0) {
    for (int i = 0; i < N_SERVOS; i++) {
      servo_pos_pre[i] = servo_pos[i];
    }
  }

  void step(const MultiplexedSensor& sensor, uint8_t* servo_pos_out,
            int8_t* motor_vel_out) {
    if (action == NULL) {
      return;
    }

    for (int8_t i = 0; i < N_SERVOS; i++) {
      const uint8_t targ_pos = action->servo_pos[i];
      if (targ_pos != Action::SERVO_POS_KEEP) {
        servo_pos_out[i] =
            interp(servo_pos_pre[i], targ_pos, (elapsed_step >> 5) + 1,
                   (action->duration_step >> 5) + 1);
      }
    }
    for (int8_t i = 0; i < N_MOTORS; i++) {
      const int8_t targ_vel = action->motor_vel[i];
      if (targ_vel != Action::MOTOR_VEL_KEEP) {
        motor_vel_out[i] = targ_vel;
      }
    }
#ifdef WORKER_TYPE_BUILDER
    if (sensor.get_sensor_t() > action->train_cutoff_thresh) {
      motor_vel_out[MV_TRAIN] = 0;
    }
#endif
#ifdef WORKER_TYPE_FEEDER
    if (sensor.get_sensor0() < action->stop_cutoff_thresh) {
      motor_vel_out[MV_VERT] = 0;
    }
    if (sensor.get_sensor1() > action->origin_cutoff_thresh) {
      motor_vel_out[MV_VERT] = 0;
    }
#endif
    elapsed_step++;
  }

  bool is_running() const {
    return action != NULL && (elapsed_step <= action->duration_step);
  }

  void print_json(JsonElement e) const {
    JsonDict astate = e.as_dict();

    if (is_running()) {
      astate.insert("type").set("run");
      astate.insert("elapsed/ms").set(elapsed_step);
      astate.insert("duration/ms").set(action->duration_step);
    } else if (action != NULL) {
      astate.insert("type").set("done");
    } else {
      astate.insert("type").set("idle");
    }

    astate.end();
  }
};

class ActionQueue {
 public:
  const static uint8_t SIZE = 8;

 private:
  Action queue[SIZE];
  uint8_t ix = 0;
  uint8_t n = 0;

 public:
  void enqueue(const Action& astate) {
    queue[(ix + n) % SIZE] = astate;
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

  void clear() { n = 0; }

  uint8_t count() const { return n; }

  void print_json(JsonElement e) const {
    JsonDict status = e.as_dict();

    JsonArray actions = status.insert("actions").as_array();
    for (int i = 0; i < n; i++) {
      queue[(ix + i) % SIZE].print_json(actions.add());
    }
    actions.end();

    status.insert("free").set(SIZE - n);

    status.end();
  }
};

// Must be instantiated at most only after reset.
class ActionExecutorSingleton {
 public:
  ActionQueue queue;
  ActionExecState state;

  // Position based control. Set position will be maintained automatically
  // (using Timer1) in Calibrated Servo.
  uint8_t servo_pos[N_SERVOS];

  // Velocity based control for DC motors. This class is responsible for PWM-ing
  // them, even when no action is being executed. -0x7f~0x7f (7 bit effective)
  DCMotor motors[N_MOTORS];
  int8_t motor_vel[N_MOTORS];
  int8_t motor_vel_prev[N_MOTORS];

  uint8_t gv = 0;

  static const uint8_t TCCR1A_FAST_PWM_8 = _BV(WGM10);
  static const uint8_t TCCR1B_FAST_PWM_8 = _BV(WGM12);
  static const uint8_t TCCR1A_A_NON_INVERT = _BV(COM1A1);
  static const uint8_t TCCR1A_B_NON_INVERT = _BV(COM1B1);
  static const uint8_t TCCR1B_PRESCALER_1024 = _BV(CS12) | _BV(CS10);

  static const uint8_t TCCR2A_FAST_PWM = _BV(WGM21) | _BV(WGM20);
  static const uint8_t TCCR2A_A_NON_INVERT = _BV(COM2A1);
  static const uint8_t TCCR2A_B_NON_INVERT = _BV(COM2B1);
  static const uint8_t TCCR2B_PRESCALER_1024 =
      _BV(CS22) | _BV(CS21) | _BV(CS20);

  static const uint8_t T_SEN_CACHE_SIZE = 100;
  uint8_t tr_sensor_cache[T_SEN_CACHE_SIZE];
  uint8_t tr_sensor_cache_ix;

 public:
  ActionExecutorSingleton()
      :
#ifdef WORKER_TYPE_BUILDER
        servo_pos{50, 5},
        motors {
    // train
    DCMotor(0xc0),
        // ori
        DCMotor(0xc2),
        // screw
        DCMotor(0xc4)
  }
#endif
  {}

  void init() {
    // Init servo PWM (freq_pwm=61.0Hz, dur=16.4 ms)
    TCCR2A = TCCR2A_FAST_PWM | TCCR2A_A_NON_INVERT | TCCR2A_B_NON_INVERT;
    TCCR2B = TCCR2B_PRESCALER_1024;

    // Set PWM ports as output.
    DDRB |= _BV(3);  // PWMA
    DDRD |= _BV(3);  // PWMB
    commit_posvel();
  }

  void loop1ms() {
    sensor.loop1ms();

    if (state.is_running()) {
      state.step(sensor, servo_pos, motor_vel);
      if (sensor.is_start()) {
        if (tr_sensor_cache_ix < T_SEN_CACHE_SIZE) {
#ifdef WORKER_TYPE_BUILDER
          tr_sensor_cache[tr_sensor_cache_ix] = sensor.get_sensor_t();
#endif
#ifdef WORKER_TYPE_FEEDER
          tr_sensor_cache[tr_sensor_cache_ix] = sensor.get_sensor_v();
#endif
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

  void enqueue(Action& astate) { queue.enqueue(astate); }

  bool is_idle() const { return queue.count() == 0 && !state.is_running(); }

  void cancel_all() {
    state = ActionExecState();
    queue.clear();
    for (int i = 0; i < N_MOTORS; i++) {
      motor_vel[i] = 0;
    }
    commit_posvel();
  }

  void print_scan(JsonDict& response) const {
    response.insert("ty").set("SCAN");

    JsonArray devs = response.insert("dev").as_array();
    bool error = false;
    for (uint8_t addr = 0; addr <= 0x7F; addr++) {
      DeviceCheck st = I2c.check_device(addr);
      if (st == DeviceCheck::FOUND) {
        devs.add().set(addr);
      } else if (st == DeviceCheck::ERR_TIMEOUT) {
        error = true;
        break;
      }
    }
    devs.end();

    response.insert("aborted_by_error").set(error);
  }

  void print(JsonDict& response) const {
    response.insert("ty").set("STATUS");

    JsonElement e = response.insert("wtype");
#ifdef WORKER_TYPE_BUILDER
    e.set("TB");
#else
    e.set_null();
#endif

    print_output_json(response.insert("out"));
    print_system_status(response.insert("system"));
    print_sensor_status(response.insert("sensor"));
    state.print_json(response.insert("state"));
    queue.print_json(response.insert("queue"));
  }

 private:
  void report_cache() const {
    // check send_async_size

    StringWriter writer(async_tx_buffer, sizeof(async_tx_buffer));

    JsonDict response(&writer);

    response.insert("ty").set("SENSOR_CACHE");
    response.insert("rate/ms").set(sensor.get_rate_ms());

    JsonArray values = response.insert("val").as_array();
    for (uint8_t i = 0; i < tr_sensor_cache_ix; i++) {
      values.add().set(tr_sensor_cache[i]);
    }
    values.end();

    response.end();

    twelite.queue_send_async(writer.size_written());
  }

  void print_system_status(JsonElement e) const {
    JsonDict status = e.as_dict();

    status.insert("vcc/mV").set((uint16_t)sensor.get_vcc_mv());
    status.insert("bat/mV").set((uint16_t)sensor.get_bat_mv());
    status.insert("recv/B").set(twelite.get_data_bytes_recv());
    status.insert("sent/B").set(twelite.get_data_bytes_sent());

    status.end();
  }

  void print_sensor_status(JsonElement e) const {
    JsonArray values = e.as_array();

    values.add().set(imu.read_ang_x());
    values.add().set(sensor.get_sensor0());
    values.add().set(sensor.get_sensor1());
    values.add().set(sensor.get_sensor2());

    values.end();
  }

  void commit_posvel() {
// Set PWM
#ifdef WORKER_TYPE_BUILDER
    OCR2A = servo_pos[CIX_A];
    OCR2B = servo_pos[CIX_B];
#endif
#ifdef WORKER_TYPE_FEEDER
    OCR1A = servo_pos[CIX_GR_ROT];
    OCR1B = servo_pos[CIX_GR_CLOSE];
    OCR2B = servo_pos[CIX_LOCK];
#endif

    // I2C takes time, need to conserve time. Otherwise MCU become
    // unresponsive.
    for (int i = 0; i < N_MOTORS; i++) {
      if (motor_vel[i] != motor_vel_prev[i]) {
        motors[i].set_velocity(motor_vel[i]);
        motor_vel_prev[i] = motor_vel[i];
      }
    }
  }

  void print_output_json(JsonElement outp) const {
    JsonArray values = outp.as_array();

    JsonArray servos = values.add().as_array();
    for (int i = 0; i < N_SERVOS; i++) {
      servos.add().set(servo_pos[i]);
    }
    servos.end();

    JsonArray motors = values.add().as_array();
    for (int i = 0; i < N_MOTORS; i++) {
      motors.add().set(motor_vel[i]);
    }
    motors.end();

    values.end();
  }
};
