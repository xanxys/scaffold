
#include "hardware.h"

// ms / step
const static int SUBSTEP_MS = 1;

// interpolation steps.
const static int SUBSTEPS = 16;

// Max duration = (256*NUM_SUB_ACTIONS) ms

// Safely calculate va + (vb - va) * (ix / num)
uint8_t interp(uint8_t va, uint8_t vb, uint8_t ix, uint8_t num) {
  uint8_t delta = (vb > va) ? vb - va : va - vb;
  uint8_t dv = (static_cast<uint16_t>(delta) * ix) / num;
  return (vb > va) ? va + dv : va - dv;
}

class Action {
public:
  const static uint8_t SERVO_POS_KEEP = 0xff;
  uint8_t servo_pos[3];

  // -0x7f~0x7f (max CCW~max CW), 0x80: keep
  const static int8_t MOTOR_VEL_KEEP = 0x80;
  int8_t motor_vel[2];

  uint8_t duration_step;

  Action() {}

  Action(uint16_t duration_ms) : duration_step(duration_ms / (SUBSTEP_MS * SUBSTEPS)) {
  }
};

// ActionExecState = Zero | Executing
class ActionExecState {
private:
  // Nullable current action being executed.
  Action* action;
  // elapsed time since starting exec of current action.
  // Don't care when action is null.
  uint8_t elapsed_step;

  uint8_t servo_pos_pre[3];
public:
  ActionExecState() : action(NULL) {}

  ActionExecState(Action* action, const uint8_t* servo_pos) : elapsed_step(0), action(action) {
    for (int i = 0; i < 3; i++) {
      servo_pos_pre[i] = servo_pos[i];
    }
  }

  // Somehow heavy because of u16/u8 3 divisions.
  void step(uint8_t* servo_pos_out, int8_t* motor_vel_out) {
    if (action == NULL) {
      return;
    }

    for (int i = 0; i < 3; i++) {
      uint8_t targ_pos = action->servo_pos[i];
      if (targ_pos != Action::SERVO_POS_KEEP) {
        servo_pos_out[i] = interp(servo_pos_pre[i], targ_pos, elapsed_step, action->duration_step);
      }
    }
    for (int i = 0; i < 2; i++) {
      int8_t targ_vel = action->motor_vel[i];
      if (targ_vel != Action::MOTOR_VEL_KEEP) {
        motor_vel_out[i] = targ_vel;
      }
    }

    elapsed_step++;
  }

  bool is_running() {
    return action != NULL && (elapsed_step < action->duration_step);
  }
};

class ActionQueue {
private:
  const static int SIZE = 4;
  Action queue[SIZE];
  int ix = 0;
  int n = 0;
public:
  Action& add() {
    Action& act = queue[(ix + n) % SIZE];
    n += 1;
    return act;
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
};

// Must be instantiated at most only after reset.
class ActionExecutorSingleton {
public:
  ActionQueue queue;
  ActionExecState state;

  // Position based control. Set position will be maintained automatically (using Timer1)
  // in Calibrated Servo.
  static const int CIX_DUMP = 0;
  static const int CIX_DRIVER = 1;
  static const int CIX_ORI = 2;

  uint8_t servo_pos[3];
  CalibratedServo servos[3];

  // Velocity based control for DC motors. This class is responsible for PWM-ing them,
  // even when no action is being executed.
  // -0x7f~0x7f (7 bit effective)
  // 16 step for each. (omit 3 bit)
  int8_t motor_vel[2];
  DCMotor motors[2];
  static const int PWM_NUM_PHASE = 16;
  uint8_t pwm_phase; // 0-15
  static const int MV_TRAIN = 0;
  static const int MV_SCREW_DRIVER = 1;

  uint8_t subaction_ix = 0;

public:
  ActionExecutorSingleton() :
      servos({
        CalibratedServo(6, 30, 30),
        CalibratedServo(7, 30, 30),
        CalibratedServo(5, 30, 30)
      }),
      motors({
        DCMotor(8, 9),
        DCMotor(10, 11)
      }) {
  }

  // Must be called periodically with ACTION_RES_MS.
  void loop() {
    // Update values. Apply servo values.
    if (state.is_running()) {
      // Update values using state.
      if (subaction_ix == 0) {
        state.step(servo_pos, motor_vel);
      }
      subaction_ix = (subaction_ix + 1) % SUBSTEPS;
    } else {
      // Fetch new action.
      Action* new_action = queue.pop();
      state = ActionExecState(new_action, servo_pos);
    }

    // Apply servo.
    for (int i = 0; i < 3; i++) {
      servos[i].set(servo_pos[i]);
    }

    // Do DC motor PWM.
    for (int i = 0; i < 2; i++) {
      if (motor_vel[i] == 0) {
        motors[i].stop();
      } else {
        bool cw = motor_vel[i] > 0;
        uint8_t phase_max = vel_to_num_phases(motor_vel[i]);
        if (pwm_phase <= phase_max) {
          motors[i].move(cw);
        } else {
          // TODO
          // Do we need to free-wheel instead of stopping?
          // Then we need additional enable signal.
          motors[i].stop();
        }
      }
    }
    pwm_phase = (pwm_phase + 1) % PWM_NUM_PHASE;
  }

  void clear() {
    queue.clear();
  }
private:
  static inline uint8_t vel_to_num_phases(int8_t vel) {
    if (vel < 0) {
      return (-vel) / 8;
    } else {
      return vel / 8;
    }
  }
};
