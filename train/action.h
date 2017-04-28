
#include "hardware.h"

const int N_SERVOS = 3;
const int CIX_DUMP = 0;
const int CIX_DRIVER = 1;
const int CIX_ORI = 2;

const int N_MOTORS = 2;
const int MV_TRAIN = 0;
const int MV_SCREW_DRIVER = 1;


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
  // 20~100
  uint8_t servo_pos[3];

  // -0x7f~0x7f (max CCW~max CW), 0x80: keep
  const static int8_t MOTOR_VEL_KEEP = 0x80;
  int8_t motor_vel[2];

  uint8_t duration_step;

  Action() : Action(1) {}

  Action(uint16_t duration_ms) :
      duration_step(duration_ms / (SUBSTEP_MS * SUBSTEPS)),
      servo_pos({SERVO_POS_KEEP, SERVO_POS_KEEP, SERVO_POS_KEEP}),
      motor_vel({MOTOR_VEL_KEEP, MOTOR_VEL_KEEP}) {
    if (duration_step == 0) {
      duration_step = 1; // ensure action is executed at least once.
    }
  }

  void print() {
    for (int i = 0; i < N_SERVOS; i++) {
      Serial.print(servo_pos[i]);
      Serial.print(i == N_SERVOS - 1 ? " | " : ", ");
    }
    for (int i = 0; i < N_MOTORS; i++) {
      Serial.print(motor_vel[i]);
      Serial.print(", ");
    }
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

  ActionExecState(const Action* action, const uint8_t* servo_pos) : elapsed_step(0), action(action) {
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
        servo_pos_out[i] = interp(servo_pos_pre[i], targ_pos, elapsed_step, action->duration_step);
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
    return action != NULL && (elapsed_step < action->duration_step);
  }

  void println() {
    if (is_running()) {
      Serial.print("run:");
      Serial.print(elapsed_step);
      Serial.print("/");
      Serial.println(action->duration_step);
    } else if (action != NULL) {
      Serial.println("done");
    } else {
      Serial.println("idle");
    }
  }
};

class ActionQueue {
public:
  const static int SIZE = 4;
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

  void println() {
    Serial.println("-- actions --");
    for (int i = 0; i < n; i++) {
      queue[(ix + i) % SIZE].print();
      Serial.println("");
    }
    Serial.print("free: ");
    Serial.println(SIZE - n);
    Serial.println("-------------");
  }
};

// Must be instantiated at most only after reset.
class ActionExecutorSingleton {
public:
  ActionQueue queue;
  ActionExecState state;

  // Position based control. Set position will be maintained automatically (using Timer1)
  // in Calibrated Servo.
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
    for (int i = 0; i < N_SERVOS; i++) {
      servos[i].set(servo_pos[i]);
    }

    // Do DC motor PWM.
    for (int i = 0; i < N_MOTORS; i++) {
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

  void enqueue(Action& a) {
    queue.enqueue(a);
  }

  void cancel_all() {
    state = ActionExecState();
    queue.clear();
    for (int i = 0; N_MOTORS; i++) {
      motor_vel[i] = 0;
    }
  }

  void print() {
    Serial.println("== executor ==");
    state.println();
    queue.println();
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
