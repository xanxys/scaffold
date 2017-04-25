
#include <Servo.h>
#include <MsTimer2.h>


/* Hardware usage

* Timer0: system clock
* Timer1: Servo
* Timer2: <custom, action executor / PWM>

*/

Servo dump_arm;
Servo driver_arm;
Servo train_ori;

// GWServo PICO
// 10-150: active range
// +: CW (top view), -: CCW


class Action {
public:
  const uint8_t SERVO_POS_KEEP = 0xff;
  uint8_t servo_pos[3];

  // -0x7f~0x7f (max CCW~max CW), 0x80: keep
  const int8_t MOTOR_VEL_KEEP = 0x80;
  int8_t motor_vel[2];

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

ActionQueue queue;

class ServoCalib {
public:
  int offset = 20;
  ServoCalib() {
  }

};

const int CIX_DUMP = 0;
const int CIX_DRIVER = 1;
const int CIX_ORI = 2;

ServoCalib calib[3];  //  = {ServoCalib(), ServoCalib(), ServoCalib()};
int curr_index = 0;

int drv_arm_pos = 0;


void action_loop() {

}

void setup()  {
  Serial.begin(9600);

  dump_arm.attach(6);
  train_ori.attach(5);
  driver_arm.attach(7);

  pinMode(8, OUTPUT);
  pinMode(9, OUTPUT);
  digitalWrite(8, false);
  digitalWrite(9, false);

  MsTimer2::set(10 /* ms */, action_loop);
  MsTimer2::start();
}

void print_calib() {
  for (int i = 0; i < 3; i++) {
    ServoCalib& c = calib[i];
    Serial.print(i == curr_index ? '[' : ' ');
    Serial.print(c.offset);
    Serial.print(i == curr_index ? ']' : ' ');
    Serial.print(" ");
  }
  Serial.println("");
}

void loop() {
  if (Serial.available() > 0) {
    char command = Serial.read();
    if (command == 'c') {
      // Enter calibration mode.
      Serial.println("enter:calibration");
    } else if (command == 'w') {
      calib[curr_index].offset += 5;
      print_calib();
    } else if (command == 's') {
      calib[curr_index].offset -= 5;
      print_calib();
    } else if (command == 'a') {
      if (curr_index > 0) {
        curr_index -= 1;
      }
      print_calib();
    } else if (command == 'd') {
      if (curr_index < 2) {
        curr_index += 1;
      }
      print_calib();
    } else if (command == 'r') {
      // fwd
      digitalWrite(8, true);
      digitalWrite(9, false);

    } else if (command == 'f') {
      // stop
      digitalWrite(8, false);
      digitalWrite(9, false);
    } else if (command == 'v') {
      // back
      digitalWrite(8, false);
      digitalWrite(9, true);
    } else if (command == 'u') {
      // CW* tighten
      digitalWrite(10, true);
      digitalWrite(11, false);
    } else if (command == 'j') {
      // stop
      digitalWrite(10, false);
      digitalWrite(11, false);
    } else if (command == 'm') {
      // CCW: unfasten
      digitalWrite(10, false);
      digitalWrite(11, true);
    } else if (command == 't') {
      // attach arm
      drv_arm_pos = 120;
      Action& a = queue.add();
      
    } else if (command == 'y') {
      // detach arm
      drv_arm_pos = 0;
    } else if (command == 'x') {
      queue.clear();
    }
  }

  dump_arm.write(120 + calib[CIX_DUMP].offset);
  driver_arm.write(drv_arm_pos + calib[CIX_DRIVER].offset);
  train_ori.write(120 + calib[CIX_ORI].offset);
}
