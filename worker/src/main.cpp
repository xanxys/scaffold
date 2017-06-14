// Scaffold worker v1 firmware

#include <Arduino.h>
#include <TimerOne.h>
#include <MsTimer2.h>
#include <Wire.h>

#include "action.hpp"


ActionExecutorSingleton actions;

class Logger {
private:
  const static int SIZE = 128;
  char buffer[SIZE];
  int index;
public:
  Logger() : index(0) {}

  template<typename T>
  void print(const T& v) {
    String s(v);
    for (int i = 0; i < s.length(); i++) {
      if (index < SIZE) {
        buffer[index] = s.charAt(i);
        index++;
      }
    }
  }

  void newline() {
    if (index < SIZE) {
      buffer[index] = '\n';
      index++;
    }
  }

  template<typename T>
  void println(const T& v) {
    print(v);
    newline();
  }

  void flushToSerial() {
    for(int i = 0; i < index; i++) {
      Serial.write(buffer[i]);
    }
    Serial.flush();
    index = 0;
  }
};

// Request scoped logger.
// Log buffer is created anew for every request.
Logger request_log;

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
  const static uint8_t BUF_SIZE = 64;
  char buffer[BUF_SIZE];
  int r_ix;
  int w_ix;
public:
  CommandProcessorSingleton() : r_ix(0), w_ix(0) {}

  void loop() {
    while (true) {
      read_line_to_buffer();
      flash_indicator_blocking();
      char code = read();
      switch (code) {
        case 'x': exec_cancel_actions(); break;
        case 'p': exec_print_actions(); break;
        case 'e': exec_enqueue(); break;
        case 'r': exec_read_sensor(); break;
        case 'f': exec_find_origin(); break;
        default:
          request_log.println("[WARN] Unknown command");
      }
      request_log.flushToSerial();
      // Delete any command that is probably caused by reflection of log.
      while(Serial.available() > 0) {
        Serial.read();
      }
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

  void flash_indicator_blocking() {
    PORTC |= _BV(PC0);
    delay(50);
    PORTC &= ~_BV(PC0);
  }

  // Read LF-terminated string to buffer (omitting newline).
  void read_line_to_buffer() {
    r_ix = 0;
    w_ix = 0;
    while (true) {
        while (Serial.available() == 0);
        char c = Serial.read();
        if (c == '\n' || w_ix > BUF_SIZE) {
          return;
        }
        buffer[w_ix] = c;
        w_ix++;
    }
  }

  char read() {
    if (r_ix < w_ix) {
      char ret = buffer[r_ix];
      r_ix++;
      return ret;
    } else {
      return 0;
    }
  }

  void unread(char c) {
    if (r_ix > 0) {
      r_ix--;
      //buffer[r_ix] = c;
    } else {
      // NOT SUPPORTED; this means it encountered unparsable string.
      request_log.println("[NEVER_HAPPEN] parse failed: unread failed for:");
      request_log.println(c);
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
    request_log.println("cancelled");
  }

  void exec_print_actions() {
    actions.print();
  }

  void exec_read_sensor() {
    uint16_t val = analogRead(A6);
    request_log.print("reflector: ");
    request_log.println(val);
  }

  void exec_find_origin() {
    bool dir = true;
    uint16_t dur = 250;
    for (int i = 0; i < 5; i++) {
      Action move(dur);
      move.motor_vel[MV_TRAIN] = dir ? 50 : -50;
      actions.enqueue(move);

      Action stop(1);
      stop.motor_vel[MV_TRAIN] = 0;
      actions.enqueue(stop);

      while (!actions.is_idle()) {
        uint16_t sv = analogRead(A6);

        Serial.println(sv);
        if (sv < 100) {
          request_log.println("->found?");
          actions.cancel_all();
          break;
        }
        delay(50);
      }

      dir = !dir;
      dur += 50;
    }
  }

  void exec_enqueue() {

    int16_t dur_ms = parse_int();
    if (dur_ms < 1) {
      dur_ms = 1;
      request_log.println("[WARN] dur extended to 1 ms");
    }
    if (dur_ms > 2000) {
      dur_ms = 2000;
      request_log.println("[WARN] dur truncated to 2000 ms");
    }

    Action action(dur_ms);
    // parse command body.
    while (true) {
      char target = read();
      int16_t value = parse_int();

      if (target == 'd' || target == 'r' || target == 'o') {
        if (value < 0) {
          value = 0;
          request_log.println("[WARN] pos truncated to 0");
        } else if (value > 100) {
          // note: 255 is reserved as SERVO_POS_KEEP.
          value = 100;
          request_log.println("[WARN] pos truncated to 100");
        }
      } else if (target == 't' || target == 's') {
        if (value < -127) {
          value = -127;
          request_log.println("[WARN] vel truncated to -127");
        } else if (value > 127) {
          value = 127;
          request_log.println("[WARN] vel truncated to 127");
        }
      } else {
        request_log.println("[WARN] unknown command ignored");
      }

      switch (target) {
        case 'd': action.servo_pos[CIX_DUMP] = value; break;
        case 'r': action.servo_pos[CIX_DRIVER] = value; break;
        case 'o': action.servo_pos[CIX_ORI] = value; break;
        case 't': action.motor_vel[MV_TRAIN] = value; break;
        case 's': action.motor_vel[MV_SCREW_DRIVER] = value; break;
      }
      break;
    }
    actions.enqueue(action);
    request_log.println("enqueued");
  }
};

CommandProcessorSingleton command_processor;


void action_loop() {
  actions.loop();
}

void actions_loop_pwm() {
  actions.loop_pwm();
}

int main() {
  // Init arduino core things (e.g. Timer0).
  init();

  Serial.begin(2400);

  Timer1.initialize(PWM_STEP_US);
  Timer1.attachInterrupt(actions_loop_pwm);

  MsTimer2::set(STEP_MS, action_loop);
  MsTimer2::start();

  pinMode(A6, INPUT);

  // indicator LED as output.
  DDRC |= _BV(PC0);

  // Initialize servo pos.
  {
    Action action(1 /* dur_ms */);
    action.servo_pos[CIX_DUMP] = 30;
    action.servo_pos[CIX_DRIVER] = 30;
    action.servo_pos[CIX_ORI] = 30;
    actions.enqueue(action);
  }

  command_processor.loop();
}
