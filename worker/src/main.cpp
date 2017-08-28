// Scaffold worker v1 firmware

#include <Arduino.h>
#include <TimerOne.h>
#include <MsTimer2.h>
#include <Wire.h>

#include "logger.hpp"
#include "action.hpp"

ActionExecutorSingleton actions;

// Parse ":..." ASCII messages from standard TWELITE MWAPP.
class TweliteInterface {
private:
  // Command without ":" or newlines.
  const static uint8_t BUF_SIZE = 64;
  char buffer[BUF_SIZE];
  uint8_t size;
public:
  uint8_t get_datagram(uint8_t* data_ptr, uint8_t data_size) {
    while (true) {
      receive_command();

      // Filter / validate.
      // 6 = target(2) + command(2) + data(N) + checksum(2)
      if (size < 6 || size % 2 != 0) {
        Logger::warn("too small packet");
        continue;
      }
      if (memcmp(buffer, "0001", 4) != 0) {
        // There are so many noisy packets (e.g. auto-local echo), we shouldn't
        // treat them as warning.
        continue;
      }
      break;
    }

    uint8_t data_ix = 0;
    for (int i = 4; i < size - 2; i += 2) {
      if (data_ix < data_size) {
        data_ptr[data_ix] =
          (decode_nibble(buffer[i]) << 4) | decode_nibble(buffer[i+1]);
        data_ix++;
      }
    }
    return data_ix;
  }

  // Send current log as normal priority data. Total size must be <=800 bytes.
  // Ideally <=80 bytes to fit in one packet.
  void send_normal(Logger& log) {
    // Parent, Send
    Serial.write(":0001");
    // Data in hex.
    for(int i = 0; i < log.index; i++) {
      send_byte(log.buffer[i]);
    }
    // csum (omitted) + CRLF
    Serial.write("X\r\n");
    Serial.flush();
    log.index = 0;
  }
private:
  uint8_t decode_nibble(char c) {
    if ('0' <= c && c <= '9') {
      return c - '0';
    } else if ('A' <= c && c <= 'F'){
      return (c - 'A') + 10;
    } else {
      Logger::warn("corrupt hex from TWELITE");
      return 0;
    }
  }

  void receive_command() {
    // Accept ":"
    while (getch() != ':');

    size = 0;
    while (true) {
      char c = getch();
      if (c == '\r' || c == '\n') {
        return;
      } else if (c == ':') {
        Logger::warn("unexpected':'");
      } else if (c == '!') {
        Logger::warn("unexpected'!");
      } else {
        if (size < BUF_SIZE) {
          buffer[size] = c;
          size++;
        }
      }
    }
  }

  char getch() {
    while (Serial.available() == 0) {
      if (request_log.send) {
        send_normal(request_log);
        request_log.send = false;
      }
    }
    return Serial.read();
  }

  static void send_cstr(const char* ptr) {
    while (true) {
      uint8_t v = *ptr;
      if (v == 0) {
        break;
      }
      send_byte(v);
      ptr++;
    }
  }

  inline static void send_byte(uint8_t v) {
    Serial.write(format_half_byte(v >> 4));
    Serial.write(format_half_byte(v & 0xf));
  }

  inline static char format_half_byte(uint8_t v) {
    if (v < 10) {
      return '0' + v;
    } else {
      return 'A' + (v - 10);
    }
  }
};

// Command format:
// To ensure enqueue correctness,
// Command = CommandCode[a-zA-Z] CommandBody[^/]* ("\n" | "/")
//
class CommandProcessorSingleton {
private:
  TweliteInterface twelite;
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

      char code = read();
      switch (code) {
        case 'x': exec_cancel_actions(); break;
        case 'p': exec_print_actions(); break;
        case 'e': exec_enqueue(); break;
        default:
          request_log.println("[WARN] Unknown command");
      }
      twelite.send_normal(request_log);
    }
  }

private:
  bool consume_separator() {
    char ch = read();
    if (ch == ',') {
      return true;
    }

    if (ch != 0) {
      unread(ch);
    }
    return false;
  }

  bool consume_report_flag() {
    char ch = read();
    if (ch == '!') {
      return true;
    }

    if (ch != 0) {
      unread(ch);
    }
    return false;
  }

  bool available() {
    return (buffer != 0) || (Serial.available() > 0);
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

  void exec_enqueue() {
    while (true) {
      enqueue_single_action();
      if (!consume_separator()) {
        break;
      }
    }
    request_log.print('{');

    request_log.print_dict_key("time/ms");
    request_log.print(millis());
    request_log.print(',');

    request_log.print_dict_key("queue");
    actions.queue.print_json();

    request_log.print('}');
  }

  void enqueue_single_action() {
    bool report_flag = consume_report_flag();
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
    action.report = report_flag;
    // parse command body.
    while (true) {
      char target = read();
      int16_t value = parse_int();

      if (target == 'a' || target == 'b') {
        if (value < 10) {
          value = 10;
          request_log.println("[WARN] pos truncated to 10");
        } else if (value > 33) {
          // note: 255 is reserved as SERVO_POS_KEEP.
          value = 33;
          request_log.println("[WARN] pos truncated to 33");
        }
      } else if (target == 't' || target == 'o' || target == 's') {
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
        case 'a': action.servo_pos[CIX_A] = value; break;
        case 'b': action.servo_pos[CIX_B] = value; break;
        case 't': action.motor_vel[MV_TRAIN] = value; break;
        case 'o': action.motor_vel[MV_ORI] = value; break;
        case 's': action.motor_vel[MV_SCREW_DRIVER] = value; break;
      }
      break;
    }
    actions.enqueue(action);
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
  Logger::send_short("worker:init1");

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
  Logger::send_short("worker:init2");
  command_processor.loop();
}
