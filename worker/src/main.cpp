// Scaffold worker v1 firmware

#include <Arduino.h>
#include <MsTimer2.h>

#include "action.hpp"
#include "hardware_builder.hpp"
#include "json_writer.hpp"

ActionExecutorSingleton actions;

// Command format:
// To ensure enqueue correctness,
// Command = CommandCode[a-zA-Z] CommandBody[^/]* ("\n" | "/")
//
class CommandProcessorSingleton {
 private:
  MaybeSlice datagram;  // dependent on buffer inside twelite.
  int r_ix;

 public:
  CommandProcessorSingleton() : r_ix(0) {}

  void loop() {
    while (true) {
      datagram = twelite.get_datagram();
      if (!datagram.is_valid()) {
        twelite.warn("too long command");
        continue;
      }
      r_ix = 0;

#ifdef WORKER_TYPE_BUILDER
      indicator.flash_blocking();
#endif

      char code = read();

      char buffer[200];
      StringWriter writer(buffer, sizeof(buffer));

      JsonDict response(&writer);
      switch (code) {
        case 'x':
          exec_cancel_actions(response);
          break;
        case 'p':
          exec_print_actions(response);
          break;
        case 's':
          actions.print_scan(response);
          break;
        case 'e':
          exec_enqueue(response);
          break;
        default:
          twelite.warn("unknown command");
          continue;
      }
      response.end();
      twelite.send_datagram(writer.ptr_begin, writer.ptr - writer.ptr_begin);
    }
  }

 private:
  // Consume next byte if it matches target (return true).
  // If it doesn't match, doesn't consume anything (return false).
  bool consume(char target) {
    if (r_ix < datagram.size) {
      if (datagram.ptr[r_ix] == target) {
        r_ix++;
        return true;
      }
    }
    return false;
  }

  char peek() {
    if (r_ix < datagram.size) {
      return datagram.ptr[r_ix];
    } else {
      return 0;
    }
  }

  bool available() { return r_ix < datagram.size; }

  char read() {
    if (r_ix < datagram.size) {
      char ret = datagram.ptr[r_ix];
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
    while (available()) {
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

 private:  // Command Handler
  void exec_cancel_actions(JsonDict& response) {
    actions.cancel_all();
    response.insert("ty").set("CANCELLED");
  }

  void exec_print_actions(JsonDict& response) { actions.print(response); }

  void exec_enqueue(JsonDict& response) {
    while (true) {
      enqueue_single_action();
      if (!consume(',')) {
        break;
      }
    }
    response.insert("ty").set("ENQUEUED");
    response.insert("in_queue").set(actions.queue.count());
  }

  void enqueue_single_action() {
    int16_t dur_ms = parse_int();
    if (dur_ms < 1) {
      dur_ms = 1;
      twelite.warn("dur capped to 1ms");
    } else if (dur_ms > 5000) {
      dur_ms = 5000;
      twelite.warn("dur capped to 5s");
    }
    Action action(dur_ms);

    while (true) {
      char target = read();
      switch (target) {
#ifdef WORKER_TYPE_BUILDER
        case '!':
          action.report = true;
          break;
        case 'a':
          action.servo_pos[CIX_A] = safe_read_pos();
          break;
        case 'b':
          action.servo_pos[CIX_B] = safe_read_pos();
          break;
        case 't':
          action.motor_vel[MV_TRAIN] = safe_read_vel();
          break;
        case 'o':
          action.motor_vel[MV_ORI] = safe_read_vel();
          break;
        case 's':
          action.motor_vel[MV_SCREW_DRIVER] = safe_read_vel();
          break;
        case 'T':
          action.train_cutoff_thresh = safe_read_thresh();
          break;
#endif
#ifdef WORKER_TYPE_FEEDER
        case '!':
          action.report = true;
          break;
        case 'v':
          action.motor_vel[MV_VERT] = safe_read_vel();
          break;
        case 'S':
          action.stop_cutoff_thresh = safe_read_thresh();
          break;
        case 'O':
          action.origin_cutoff_thresh = safe_read_thresh();
          break;
#endif
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

constexpr uint8_t IMU_POLL_CYCLE = 19;
uint8_t imu_poll_index = 0;

void loop1ms() {
  actions.loop1ms();
  if (imu_poll_index == 0) {
    imu.poll();
  }
  imu_poll_index++;
  if (imu_poll_index >= IMU_POLL_CYCLE) {
    imu_poll_index = 0;
  }
}

int main() {
  //// Minimum AVR & 3.3V (TWELITE) init.
  // Init arduino core things (e.g. Timer0).
  init();
  twelite.init();
  indicator.flash_blocking();
  twelite.info("init1");

  //// Enable 5V & peripherals.
  set_5v_power(true);
  delay(50);  // IMU(20ms), 5V DC/DC (?ms)

  // Init I2C bus.
  I2c.begin();
  I2c.pullup(0);  // we use external pullup registers
  I2c.timeOut(10);

  // Start 6-axis sensor.
  imu.init();

  indicator.flash_blocking();
  twelite.info("init2");

  actions.init();
// Initialize servo pos to safe (i.e. not colliding with rail) position.
#ifdef WORKER_TYPE_BUILDER
  {
    Action action(1 /* dur_ms */);
    action.servo_pos[CIX_A] = 13;
    action.servo_pos[CIX_B] = 11;
    actions.enqueue(action);
  }
#endif

  // Fully initialized. Start realtime periodic process & idle tasks.
  setMillisHook(loop1ms);
  command_processor.loop();
}
