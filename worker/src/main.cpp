// Scaffold worker v1 firmware

#include <Arduino.h>
#include <TimerOne.h>
#include <MsTimer2.h>
#include <Wire.h>

#include "logger.hpp"
#include "action.hpp"

ActionExecutorSingleton actions;

// Command format:
// To ensure enqueue correctness,
// Command = CommandCode[a-zA-Z] CommandBody[^/]* ("\n" | "/")
//
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
      r_ix = 0;
      w_ix = twelite.get_datagram(reinterpret_cast<uint8_t*>(buffer), BUF_SIZE);
      indicator.flash_blocking();
      request_log.clear();

      char code = read();
      switch (code) {
        case 'x': exec_cancel_actions(); break;
        case 'p': exec_print_actions(); break;
        case 'e': exec_enqueue(); break;
        default:
          twelite.warn("unknown command");
          continue;
      }
      twelite.send_datagram(request_log.buffer, request_log.index);
    }
  }

private:
  // Consume next byte if it matches target (return true).
  // If it doesn't match, doesn't consume anything (return false).
  bool consume(char target) {
    if (!available()) {
      return false;
    }

    char ch = read();
    if (ch == target) {
      return true;
    }
    unread(ch);
    return false;
  }

  char peek() {
    if (available()) {
      return buffer[r_ix];
    } else {
      return 0;
    }
  }

  bool available() {
    return r_ix < w_ix;
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
    }
  }

  int16_t parse_int() {
    bool positive = !consume('-');
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

  void exec_enqueue() {
    while (true) {
      enqueue_single_action();
      if (!consume(',')) {
        break;
      }
    }
    request_log.print('{');

    request_log.print_dict_key("t/ms");
    request_log.print(millis());
    request_log.print(',');

    request_log.print_dict_key("queue");
    actions.queue.print_json();

    request_log.print('}');
  }

  void enqueue_single_action() {
    int16_t dur_ms = parse_int();
    if (dur_ms < 1) {
      dur_ms = 1;
      twelite.warn("dur capped to 1ms");
    } else if (dur_ms > 3000) {
      dur_ms = 3000;
      twelite.warn("dur capped to 3s");
    }
    Action action(dur_ms);

    while (true) {
      char target = read();
      switch (target) {
        case '!': action.report = true; break;
        case 'a': action.servo_pos[CIX_A] = safe_read_pos(); break;
        case 'b': action.servo_pos[CIX_B] = safe_read_pos(); break;
        case 't': action.motor_vel[MV_TRAIN] = safe_read_vel(); break;
        case 'o': action.motor_vel[MV_ORI] = safe_read_vel(); break;
        case 's': action.motor_vel[MV_SCREW_DRIVER] = safe_read_vel(); break;
        case 'T': action.train_cutoff_thresh = safe_read_thresh(); break;
        default:
          twelite.warn("unknown action target");
      }

      char next = peek();
      if (next == 0 || next == ',') {
        break;
      }
    }
    actions.enqueue(action);
  }

  uint8_t safe_read_thresh() {
    int16_t value = parse_int();
    if (value < 0) {
      value = 0;
      twelite.warn("thresh capped to 0");
    } else if (value > 255) {
      value = 255;
      twelite.warn("thresh capped to 25");
    }
    return value;
  }

  uint8_t safe_read_pos() {
    int16_t value = parse_int();
    if (value < 10) {
      value = 10;
      twelite.warn("pos capped to 10");
    } else if (value > 33) {
      // note: 255 is reserved as SERVO_POS_KEEP.
      value = 33;
      twelite.warn("pos capped to 33");
    }
    return value;
  }

  int8_t safe_read_vel() {
    int16_t value = parse_int();
    if (value < -127) {
      value = -127;
      twelite.warn("vel capped to -127");
    } else if (value > 127) {
      value = 127;
      twelite.warn("vel capped to 127");
    }
    return value;
  }
};

CommandProcessorSingleton command_processor;


void actions_loop1ms() {
  actions.loop1ms();
}

int main() {
  // Init arduino core things (e.g. Timer0).
  init();

  Serial.begin(38400);
  indicator.flash_blocking();
  twelite.info("init1");

  Timer1.initialize(1000L /* usec */);
  Timer1.attachInterrupt(actions_loop1ms);

  // Initialize servo pos to safe (i.e. not colliding with rail) position.
  {
    Action action(1 /* dur_ms */);
    action.servo_pos[CIX_A] = 13;
    action.servo_pos[CIX_B] = 11;
    actions.enqueue(action);
  }

  indicator.flash_blocking();
  twelite.info("worker:init2");
  command_processor.loop();
}
