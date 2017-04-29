
#include <Arduino.h>
#include <TimerOne.h>
#include <MsTimer2.h>

#include "action.h"


ActionExecutorSingleton actions;

// Command format:
// To ease interactive debugging from serial monitor,
// Command = CommandCode[a-zA-Z] CommandBody[^/]* ("\n" | "/")
// This is useful especially for qneueuing.
// Single action run:
// e100d80 + Enter
// Move & stop (2 enqueue)
// e100t127/e16t0 + Enter
// this is exactly same as typing e100t127+ Enter, and then e16t0 + Enter,
// but more copy-paste friendly.
//
// Set terminal to send LF only.
class CommandProcessorSingleton {
private:
  // if 0, unavailable.
  char buffer;
public:
  CommandProcessorSingleton() : buffer(0) {}

  void loop() {
    while (true) {
      while (!available()) {
      }

      char code = read();
      switch (code) {
        case 'x': exec_cancel_actions(); break;
        case 'p': exec_print_actions(); break;
        case 'e': exec_enqueue(); break;
        case 'f': exec_move_train(true); break;
        case 'b': exec_move_train(false); break;
        default:
          Serial.println("[WARN] Unknown command");
      }
      consume_terminator();
    }
  }

private:
  static bool is_terminator(char c) {
    return c == '/' || c == '\n';
  }

  bool consume_terminator() {
    char ch = read();
    if (is_terminator(ch)) {
      return true;
    } else {
      unread(ch);
      return false;
    }
  }

  bool available() {
    return (buffer != 0) || (Serial.available() > 0);
  }

  char read() {
    if (buffer != 0) {
      char ret = buffer;
      buffer = 0;
      return ret;
    } else {
      while(Serial.available() == 0);
      return Serial.read();
    }
  }

  void unread(char c) {
    if (buffer == 0) {
      buffer = c;
    } else {
      // NOT SUPPORTED; this means it encountered unparsable string.
      Serial.println("[NEVER_HAPPEN] parse failed: unread failed for:");
      Serial.println(c);
    }
  }

  int16_t parse_int() {
    bool positive = true;
    char maybe_sign = read();
    if (maybe_sign == '-') {
      positive = false;
    } else {
      unread(maybe_sign);
    }

    int16_t v = 0;
    while (true) {
      char c = read();
      if ('0' <= c && c <= '9') {
        v = v * 10 + (c - '0');
      } else {
        unread(c);
        break;
      }
    }
    return positive ? v : -v;
  }
private: // Command Handler
  void exec_cancel_actions() {
    actions.cancel_all();
    Serial.println("cancelled");
  }

  void exec_print_actions() {
    actions.print();
  }

  void exec_move_train(bool forward) {
    Action move(250);
    move.motor_vel[MV_TRAIN] = forward ? 100 : -100;
    actions.enqueue(move);

    Action stop(1);
    stop.motor_vel[MV_TRAIN] = 0;
    actions.enqueue(stop);
  }

  void exec_enqueue() {
    int16_t dur_ms = parse_int();
    if (dur_ms < 1) {
      dur_ms = 1;
      Serial.println("[WARN] dur extended to 1 ms");
    }
    if (dur_ms > 2000) {
      dur_ms = 2000;
      Serial.println("[WARN] dur truncated to 2000 ms");
    }

    Action action(dur_ms);
    // parse command body.
    while (true) {
      if (consume_terminator()) {
        break;
      }
      char target = read();
      int16_t value = parse_int();

      if (target == 'd' || target == 'r' || target == 'o') {
        if (value < 0) {
          value = 0;
          Serial.println("[WARN] pos truncated to 0");
        } else if (value > 100) {
          // note: 255 is reserved as SERVO_POS_KEEP.
          value = 100;
          Serial.println("[WARN] pos truncated to 100");
        }
      } else if (target == 't' || target == 's') {
        if (value < -127) {
          value = -127;
          Serial.println("[WARN] vel truncated to -127");
        } else if (value > 127) {
          value = 127;
          Serial.println("[WARN] vel truncated to 127");
        }
      } else {
        Serial.println("[WARN] unknown command ignored");
      }

      switch (target) {
        case 'd': action.servo_pos[CIX_DUMP] = value; break;
        case 'r': action.servo_pos[CIX_DRIVER] = value; break;
        case 'o': action.servo_pos[CIX_ORI] = value; break;
        case 't': action.motor_vel[MV_TRAIN] = value; break;
        case 's': action.motor_vel[MV_SCREW_DRIVER] = value; break;
      }
    }
    actions.enqueue(action);
    Serial.println("enqueued");
  }
};

CommandProcessorSingleton command_processor;


void action_loop() {
  actions.loop();
}

void actions_loop_pwm() {
  actions.loop_pwm();
}

void setup()  {
  Serial.begin(9600);

  Timer1.initialize(PWM_STEP_US);
  Timer1.attachInterrupt(actions_loop_pwm);

  MsTimer2::set(STEP_MS, action_loop);
  MsTimer2::start();

  command_processor.loop();
}

void loop() {}
