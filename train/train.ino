
#include <Arduino.h>
#include <Servo.h>
#include <MsTimer2.h>

#include "action.h"


ActionExecutorSingleton actions;

void action_loop() {
  actions.loop();
}

void setup()  {
  Serial.begin(9600);

  MsTimer2::set(SUBSTEP_MS, action_loop);
  MsTimer2::start();
}

/*

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
*/

void loop() {
  if (Serial.available() > 0) {
    char command = Serial.read();
    /*
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
  */
    // ActionQueue
    if (command == 'x') {
      actions.clear();
    } else if (command == 'p') {
      actions.print();
    }
  }
}
