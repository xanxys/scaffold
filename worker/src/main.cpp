// Scaffold worker v1 firmware

#include <Arduino.h>
#include <TimerOne.h>
#include <MsTimer2.h>
#include <Wire.h>

#include "action.hpp"


Indicator indicator;
ActionExecutorSingleton actions;

class Logger {
private:
  const static uint8_t SIZE = 200;
  char buffer[SIZE];
  uint8_t index;
public:
  Logger() : index(0) {}

  template<typename T>
  void print(const T& v) {
    String s(v);
    for (uint8_t i = 0; i < s.length(); i++) {
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
      indicator.flash_blocking();
      char code = read();
      switch (code) {
        case 'x': exec_cancel_actions(); break;
        case 'p': exec_print_actions(); break;
        case 'e': exec_enqueue(); break;
        case 'z': exec_step_commamd(); break;
        // Move commands.
        case 't': exec_move(false); break;
        case 'T': exec_move(true); break;
        case 'o': exec_find_origin(); break;
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

  // Move slowly for given msec until it reaches R-origin.
  void exec_find_origin() {
    const int8_t mv_train_fwd_slow = -50;
    int16_t dist = parse_int();
    bool forward = dist > 0;
    int16_t dur_ms = dist > 0 ? dist : -dist;

    {
      Action action(1);
      action.motor_vel[MV_TRAIN] = forward ? mv_train_fwd_slow : -mv_train_fwd_slow;
      actions.enqueue(action);
    }

    uint32_t t0 = millis();
    uint32_t tend = t0 + dur_ms;
    request_log.println("ack");

    // NOTE: This will break after 50days of uptime.
    bool found = false;
    while (millis() < tend) {
      if (actions.sensor.get_sensor_r() < 50 && actions.sensor.get_sensor_l() > 100) {
        found = true;
        request_log.print(millis() - t0);
        request_log.println("ms: found");
        break;
      }
    }
    if (!found) {
      request_log.println("not found");
    }

    // stop
    {
      Action action(1);
      action.motor_vel[MV_TRAIN] = 0;
      actions.enqueue(action);
    }
  }

  void exec_move(bool fast) {
    const int8_t mv_train_fwd_fast = -120;
    const int8_t mv_train_fwd_slow = -50;

    int16_t dist = parse_int();
    bool forward = dist > 0;
    int16_t dur_ms = dist > 0 ? dist : -dist;
    if (dur_ms < 1) {
      dur_ms = 1;
      request_log.println("[WARN] dur extended to 1 ms");
    }
    if (dur_ms > 2000) {
      dur_ms = 2000;
      request_log.println("[WARN] dur truncated to 2000 ms");
    }

    {
      Action action(1);
      if (fast) {
        action.motor_vel[MV_TRAIN] = forward ? mv_train_fwd_fast : -mv_train_fwd_fast;
      } else {
        action.motor_vel[MV_TRAIN] = forward ? mv_train_fwd_slow : -mv_train_fwd_slow;
      }
      actions.enqueue(action);
    }
    {
      Action action(dur_ms);
      actions.enqueue(action);
    }
    {
      Action action(1);
      action.motor_vel[MV_TRAIN] = 0;
      actions.enqueue(action);
    }
    request_log.println("ack");
  }

  void exec_step_commamd() {
    // See
    // https://docs.google.com/document/d/1cOG_my0yuHraR4mLnnvdF-L59cT0mOKswFOCROyn79I/edit#
    const uint8_t srv_dump_home = 15;
    const uint8_t srv_dump_down = 50;
    const uint8_t srv_driver_home = 90;
    const uint8_t srv_driver_hole = 26;
    const int8_t mv_train_fwd_max = -120;
    const int8_t mv_train_fwd_normal = -80;
    const int8_t mv_train_fwd_slow = -50;
    const int8_t mv_train_fwd_very_slow = -30;

    char command = read();
    switch (command) {
      // micro move forward
      case '1':
        {
          Action action(1);
          action.motor_vel[MV_TRAIN] = mv_train_fwd_normal;
          actions.enqueue(action);
        }
        {
          Action action(250);
          actions.enqueue(action);
        }
        {
          Action action(1);
          action.motor_vel[MV_TRAIN] = 0;
          actions.enqueue(action);
        }
        break;
      // Prepare screw and start approaching to end.
      // (condition: middle of rail)
      case '2':
        {
          Action action(400);
          action.servo_pos[CIX_DRIVER] = srv_driver_hole;
          actions.enqueue(action);
        }
        {
          Action action(1);
          action.motor_vel[MV_TRAIN] = mv_train_fwd_slow;
          actions.enqueue(action);
        }
        {
          Action action(400);
          actions.enqueue(action);
        }
        {
          Action action(1);
          action.motor_vel[MV_TRAIN] = 0;
          actions.enqueue(action);
        }
        break;
      // Put down rail and fasten screw.
      // (condition screw & driver inserted to rail end succesfully)
      case '3':
        {
          Action action(50);
          action.motor_vel[MV_SCREW_DRIVER] = 50;
          actions.enqueue(action);
        }
        {
          Action action(750);
          action.servo_pos[CIX_DUMP] = srv_dump_down;
          action.motor_vel[MV_TRAIN] = mv_train_fwd_very_slow;
          actions.enqueue(action);
        }
        {
          // NOOP
          // Wait and hope screw fastens.
          Action action(2000);
          actions.enqueue(action);
        }
        {
          Action action(50);
          action.motor_vel[MV_SCREW_DRIVER] = 0;
          action.motor_vel[MV_TRAIN] = 0;
          actions.enqueue(action);
        }
        break;
      // (condition 1: screw fastened correctly after 3) -> pull dump arm
      // (condition 2: screw unfastened correctly) -> pull up rail
      // Disengage rail dump
      case '4':
        {
          Action action(750);
          action.servo_pos[CIX_DUMP] = srv_dump_home;
          actions.enqueue(action);
        }
        break;
      // (condition: dump disengaged, driver inserted to rail end,
      // with or without screw.
      // Disengae screw driver
      case '5':
        {
          Action action(50);
          // Need high torque to remove driver.
          action.motor_vel[MV_TRAIN] = -mv_train_fwd_max;
          actions.enqueue(action);
        }
        // Do this twice to induce shock
        {
          // Wait train to go back slightly until driver is removed from hole.
          Action action(200);
          actions.enqueue(action);
        }
        {
          Action action(50);
          action.motor_vel[MV_TRAIN] = 0;
          actions.enqueue(action);
        }
        {
          // Wait train to go back slightly until driver is removed from hole.
          Action action(200);
          actions.enqueue(action);
        }
        {
          Action action(50);
          action.motor_vel[MV_TRAIN] = 0;
          actions.enqueue(action);
        }
        break;
        // (condition: screw driver inserrted, dump disengaged)
      case '6':
          {
            Action action(500);
            action.servo_pos[CIX_DRIVER] = srv_driver_home;
            actions.enqueue(action);
          }
          break;
      // (condition: screw down, not inserted)
      // Approach end and engage drver.
      case '7':
        {
          Action action(100);
          action.motor_vel[MV_SCREW_DRIVER] = -20;
          action.motor_vel[MV_TRAIN] = mv_train_fwd_normal;
          actions.enqueue(action);
        }
        {
          Action action(1000);
          actions.enqueue(action);
        }
        {
          Action action(5);
          action.motor_vel[MV_TRAIN] = 0;
          action.motor_vel[MV_SCREW_DRIVER] = 0;
        }
        break;
      // (condition: screw inserted)
      // Engage dump arm and unfasten.
      case '8':
        {
          Action action(500);
          action.servo_pos[CIX_DUMP] = srv_dump_down;
          actions.enqueue(action);
        }
        {
          Action action(1);
          action.motor_vel[MV_SCREW_DRIVER] = -100;
          actions.enqueue(action);
        }
        {
          Action action(2000);
          actions.enqueue(action);
        }
        {
          Action action(1);
          action.motor_vel[MV_SCREW_DRIVER] = 0;
          actions.enqueue(action);
        }
        break;
      default:
        request_log.println("[WARN] unknown command");
        return;
    }
    request_log.println("ack");
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
  actions.loop1ms();
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
    action.servo_pos[CIX_DUMP] = 25;
    action.servo_pos[CIX_DRIVER] = 80;
    action.servo_pos[CIX_ORI] = 30;
    actions.enqueue(action);
  }

  indicator.flash_blocking();
  command_processor.loop();
}
