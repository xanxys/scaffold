
#include "hardware.h"

const int N_SERVOS = 3;
const int CIX_DUMP = 0;
const int CIX_DRIVER = 1;
const int CIX_ORI = 2;

const int N_MOTORS = 2;
const int MV_TRAIN = 0;
const int MV_SCREW_DRIVER = 1;


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
  const static uint8_t SERVO_POS_KEEP = 0xff;
  // 20~100
  uint8_t servo_pos[N_SERVOS];

  // -0x7f~0x7f (max CCW~max CW), 0x80: keep
  const static int8_t MOTOR_VEL_KEEP = 0x80;
  int8_t motor_vel[N_MOTORS];

  // Note this can be 0, but action still has effect.
  uint8_t duration_step;

  Action() : Action(0) {}

  Action(uint16_t duration_ms) :
      duration_step(duration_ms / STEP_MS),
      servo_pos({SERVO_POS_KEEP, SERVO_POS_KEEP, SERVO_POS_KEEP}),
      motor_vel({MOTOR_VEL_KEEP, MOTOR_VEL_KEEP}) {
  }

  void print() {
    for (int i = 0; i < N_SERVOS; i++) {
      uint8_t v = servo_pos[i];
      if (v == SERVO_POS_KEEP) {
        Serial.print("KEEP");
      } else {
        Serial.print(v);
      }
      Serial.print(i == N_SERVOS - 1 ? " | " : ", ");
    }
    for (int i = 0; i < N_MOTORS; i++) {
      int8_t v = motor_vel[i];
      if (v == MOTOR_VEL_KEEP) {
        Serial.print("KEEP");
      } else {
        Serial.print(v);
      }
      if (i != N_MOTORS - 1) {
        Serial.print(", ");
      }
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

  static const uint8_t SERVO_PWM_NUM_PHASE = 200;
  static const uint8_t SERVO_PWM_ON_PHASES = 50;
  uint8_t servo_pwm_phase;
  uint8_t servo_portd_mask_union;
  uint8_t servo_pwm_offset[N_SERVOS];

  // Velocity based control for DC motors. This class is responsible for PWM-ing them,
  // even when no action is being executed.
  // -0x7f~0x7f (7 bit effective)
  // 16 step for each. (omit 3 bit)
  int8_t motor_vel[N_MOTORS];
  DCMotor motors[N_MOTORS];
  uint8_t motor_pwm_phase_max[N_MOTORS];
  uint8_t motor_portb_on_mask[N_MOTORS];

  static const int PWM_NUM_PHASE = 16;
  uint8_t dc_pwm_phase; // 0-15
public:
  ActionExecutorSingleton() :
      servos({
        CalibratedServo(6, 30, 30),
        CalibratedServo(7, 30, 30),
        CalibratedServo(5, 30, 30)
      }),
      motors({
        DCMotor(8, 9, A0),
        DCMotor(10, 11, A1)
      }),
      servo_pos({50, 5, 20}) {
    servo_portd_mask_union = 0;
    for (int i = 0; i < 3; i++) {
      servo_portd_mask_union |= servos[i].portd_mask;
    }

    commit_posvel();
  }

  void loop() {
    if (state.is_running()) {
        state.step(servo_pos, motor_vel);
        commit_posvel();
    } else {
      // Fetch new action.
      Action* new_action = queue.pop();
      state = ActionExecState(new_action, servo_pos);
    }
  }

  // Called every 10us (100kHz)
  void loop_pwm() {
    // Servo motors.
    for (int i = 0; i < N_SERVOS; i++) {
      if (servo_pwm_phase >= servo_pwm_offset[i]) {
        PORTD &= ~servos[i].portd_mask;
      }
    }
    if (servo_pwm_phase == SERVO_PWM_NUM_PHASE - 1) {
      servo_pwm_phase = 0;
      PORTD |= servo_portd_mask_union;
    } else {
      servo_pwm_phase++;
    }

    // DC motors.
    for (int i = 0; i < N_MOTORS; i++) {

      if (dc_pwm_phase <= motor_pwm_phase_max[i]) {
        // NOTE: a bit nuanced.
        // When on mask = 00 (i.e. vel == 0),
        // motor_pwm_phase_max become 0, so this only get called once
        // per cycle. In the 1st cycle PORTB |= 0 has no effect.
        // In the 2nd+ cycles, else branch is executed and they'll get turned off.
        PORTB &= ~ motors[i].portb_mask;
        PORTB |= motor_portb_on_mask[i];
        PORTC |= motors[i].portc_mask_en;
      } else {
        PORTC &= ~motors[i].portc_mask_en;
      }
    }
    dc_pwm_phase = (dc_pwm_phase + 1) % PWM_NUM_PHASE;
  }

  void enqueue(Action& a) {
    queue.enqueue(a);
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
    Serial.println("== executor ==");
    println_output();
    state.println();
    queue.println();
  }
private:
  void commit_posvel() {
    for (int i = 0; i < N_SERVOS; i++) {
      servo_pwm_offset[i] = servo_pos[i] + SERVO_PWM_ON_PHASES;
    }

    for (int i = 0; i < N_MOTORS; i++) {
      motor_pwm_phase_max[i] = vel_to_num_phases(motor_vel[i]);

      if (motor_vel[i] == 0) {
        motor_portb_on_mask[i] = 0; // L
      } else if (motor_vel[i] > 0) {
        motor_portb_on_mask[i] = motors[i].portb_mask_cw;
      } else {
        motor_portb_on_mask[i] = motors[i].portb_mask_ccw;
      }
    }
  }

  void println_output() {
    for (int i = 0; i < N_SERVOS; i++) {
      uint8_t v = servo_pos[i];
      Serial.print(v);
      Serial.print(i == N_SERVOS - 1 ? " | " : ", ");
    }
    for (int i = 0; i < N_MOTORS; i++) {
      int8_t v = motor_vel[i];
      Serial.print(v);
      if (i != N_MOTORS - 1) {
        Serial.print(", ");
      }
    }
    Serial.println("");
  }

  static inline uint8_t vel_to_num_phases(int8_t vel) {
    if (vel < 0) {
      return (-vel) / 8;
    } else {
      return vel / 8;
    }
  }
};
