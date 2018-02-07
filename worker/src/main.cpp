#include <Arduino.h>
#include <MsTimer2.h>
#include <nanopb/pb_encode.h>
#include <proto/builder.pb.h>

#include "action.hpp"
#include "hardware_builder.hpp"

ActionExecutorSingleton actions;

// Command format:
// To ensure enqueue correctness,
// Command = CommandCode[a-zA-Z] CommandBody[^/]* ("\n" | "/")
//
class CommandProcessorSingleton {
 private:
  MaybeSlice datagram;  // dependent on buffer inside twelite.
  int r_ix;

  uint8_t buffer[80];

 public:
  CommandProcessorSingleton() : r_ix(0) {}

  void loop() {
    while (true) {
      datagram = twelite.get_datagram();
      r_ix = 0;

      indicator.flash_blocking();

      char code = read();
      switch (code) {
        case 'x':
          exec_cancel_actions();
          break;
        case 'p':
          exec_print();
          break;
        case 's':
          exec_scan();
          break;
        case 'e':
          exec_enqueue();
          break;
        default:
          TWELITE_ERROR(Cause_OVERMIND);  // unknown command
          break;
      }
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
  void exec_cancel_actions() {
    actions.cancel_all();
    TWELITE_INFO();  // Cancel executed.
  }

  void exec_enqueue() {
    while (true) {
      enqueue_single_action();
      if (!consume(',')) {
        break;
      }
    }
    TWELITE_INFO();  // Enqueue executed.
  }

  void exec_print() {
    {
      Status status;
      actions.fill_status(status);

      buffer[0] = PacketType_STATUS;
      pb_ostream_t stream =
          pb_ostream_from_buffer((pb_byte_t*)(buffer + 1), sizeof(buffer) - 1);
      if (pb_encode(&stream, Status_fields, &status)) {
        twelite.send_datagram(buffer, 1 + stream.bytes_written);
      } else {
        TWELITE_ERROR(Cause_LOGIC_RT);
      }
    }
    delay(10);
    {
      IOStatus status;
      actions.fill_io_status(status);

      buffer[0] = PacketType_IO_STATUS;
      pb_ostream_t stream =
          pb_ostream_from_buffer((pb_byte_t*)(buffer + 1), sizeof(buffer) - 1);
      if (pb_encode(&stream, IOStatus_fields, &status)) {
        twelite.send_datagram(buffer, 1 + stream.bytes_written);
      } else {
        TWELITE_ERROR(Cause_LOGIC_RT);
      }
    }
  }

  void exec_scan() {
    I2CScanResult result;
    actions.fill_i2c_scan_result(result);

    buffer[0] = PacketType_I2C_SCAN_RESULT;
    pb_ostream_t stream =
        pb_ostream_from_buffer((pb_byte_t*)(buffer + 1), sizeof(buffer) - 1);
    if (pb_encode(&stream, I2CScanResult_fields, &result)) {
      twelite.send_datagram(buffer, 1 + stream.bytes_written);
    } else {
      TWELITE_ERROR(Cause_LOGIC_RT);
    }
  }

  void enqueue_single_action() {
    int16_t dur_ms = parse_int();
    if (dur_ms < 1) {
      dur_ms = 1;
      TWELITE_ERROR(Cause_OVERMIND);  // dur capped to 1ms
    } else if (dur_ms > 5000) {
      dur_ms = 5000;
      TWELITE_ERROR(Cause_OVERMIND);  // dur capped to 5s
    }
    Action action(dur_ms);

    while (true) {
      char target = read();
      switch (target) {
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
        default:
          TWELITE_ERROR(Cause_OVERMIND);  // unknown action target
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
      TWELITE_ERROR(Cause_OVERMIND);  // too small value
    } else if (value > 255) {
      value = 255;
      TWELITE_ERROR(Cause_OVERMIND);  // too big value
    }
    return value;
  }

  uint8_t safe_read_pos() {
    int16_t value = parse_int();
    if (value < 10) {
      value = 10;
      TWELITE_ERROR(Cause_OVERMIND);  // too small pos
    } else if (value > 33) {
      // note: 255 is reserved as SERVO_POS_KEEP.
      value = 33;
      TWELITE_ERROR(Cause_OVERMIND);  // too big pos
    }
    return value;
  }

  int8_t safe_read_vel() {
    int16_t value = parse_int();
    if (value < -127) {
      value = -127;
      TWELITE_ERROR(Cause_OVERMIND);  // too small vel
    } else if (value > 127) {
      value = 127;
      TWELITE_ERROR(Cause_OVERMIND);  // too big vel
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
  TWELITE_INFO();  // Minimum HW initialized.

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
  TWELITE_INFO();  // All HW initialized.

  actions.init();
  // Initialize servo pos to safe (i.e. not colliding with rail) position.
  {
    Action action(1 /* dur_ms */);
    action.servo_pos[CIX_A] = 13;
    action.servo_pos[CIX_B] = 11;
    actions.enqueue(action);
  }

  // Fully initialized. Start realtime periodic process & idle tasks.
  setMillisHook(loop1ms);
  command_processor.loop();
}
