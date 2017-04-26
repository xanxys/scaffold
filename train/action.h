
const static int ACTION_RES_MS = 10;

class Action {
public:
  const static uint8_t SERVO_POS_KEEP = 0xff;
  uint8_t servo_pos[3];

  // -0x7f~0x7f (max CCW~max CW), 0x80: keep
  const static int8_t MOTOR_VEL_KEEP = 0x80;
  int8_t motor_vel[2];

  uint16_t duration_ms;
};

class ActionExecState {
private:
  uint16_t elapsed_ms;
  Action* action;
public:
  ActionExecState(Action* action) : elapsed_ms(0), action(action) {
  }

  void step() {
    // TODO
    // PWM motors
    // linear interp servos

    elapsed_ms += ACTION_RES_MS;
  }
};

class ActionQueue {
private:
  const static int size = 4;
  Action queue[size];
  int ix = 0;
  int n = 0;
public:
  Action& add() {
    Action& act = queue[(ix + n) % size];
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
      ix = (ix + 1) % size;
      n -= 1;
      return ptr;
    }
  }

  void clear() {
    n = 0;
  }
};

// Must be instantiated at most only after reset.
class ActionExecutor {
public:
  ActionQueue queue;
  ActionExecState state;
public:
  ActionExecutor() {
  }

  // Must be called periodically with ACTION_RES_MS.
  void loop() {
  }

  void clear() {
    queue.clear();
  }
};
