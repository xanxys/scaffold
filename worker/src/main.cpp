#include <Arduino.h>
#include <MsTimer2.h>
#include <nanopb/pb_decode.h>
#include <nanopb/pb_encode.h>
#include <proto/builder.pb.h>

#include "action.hpp"
#include "shared_state.h"

ActionExecutorSingleton g_actions;

int16_t convert_acc(int16_t raw) {
  return (static_cast<int32_t>(raw) * 61) / 1000;
}

void fill_sensor_status(SensorStatus& status) {
  // TODO: scaling
  status.gyro_x_cdps = -imu.gyro[1];
  status.gyro_y_cdps = imu.gyro[0];
  status.gyro_z_cdps = imu.gyro[2];

  //status.acc_x_mg = convert_acc(-imu.acc[1]);
  //
  status.acc_x_mg = odometry.vx;
  status.acc_y_mg = 0; convert_acc(imu.acc[0]);
  status.acc_z_mg = 0; //convert_acc(imu.acc[2]);
}

class CommandHandler {
 private:
  MaybeSlice datagram;  // dependent on buffer inside twelite.
  int r_ix;

  uint8_t buffer[80];

 public:
  CommandHandler(MaybeSlice datagram) : datagram(datagram), r_ix(0) {}

  void handle() {
    r_ix = 0;
    indicator.flash_blocking();
    uint8_t code = read();
    switch (code) {
      case CommandType_PRINT_STATUS:
        exec_print();
        break;
      case CommandType_SCAN_I2C:
        exec_scan();
        break;
      case CommandType_ENQUEUE:
        exec_enqueue();
        break;
      case CommandType_READ_SENSOR:
        exec_read_sensor();
        break;
      default:
        TWELITE_ERROR(Cause_OVERMIND);  // unknown command
        break;
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
      g_actions.fill_status(status);

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
      fill_io_status(status);

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

  void exec_read_sensor() {
    ReadSensorCommand command;
    pb_istream_t stream =
        pb_istream_from_buffer(datagram.ptr + 1, datagram.size - 1);
    if (!pb_decode(&stream, ReadSensorCommand_fields, &command)) {
      TWELITE_ERROR(Cause_OVERMIND);  // unparsable
      return;
    }

    // TODO: Read value.
    g_async_sensor_ttl_ms = 5000;  // command.verbose_sensor_ttl_ms;
    g_async_sensor_since_last_sent_ms = 0;
  }

  void exec_scan() {
    I2CScanResult result;
    g_actions.fill_i2c_scan_result(result);

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
    g_actions.enqueue(action);
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

  void fill_io_status(IOStatus& status) const {
    fill_sensor_status(status.sensor);
    g_actions.fill_output_status(status.output);
  }
};

constexpr uint8_t IMU_POLL_CYCLE = 19;
uint8_t imu_poll_index = 0;

void loop1ms() {
  g_actions.loop1ms();

  uint16_t ttl_ms = g_async_sensor_ttl_ms;
  if (ttl_ms > 0) {
    ttl_ms--;
  }
  g_async_sensor_ttl_ms = ttl_ms;
  g_async_sensor_since_last_sent_ms++;

  if (imu_poll_index == 0) {
    imu.poll();
    odometry.poll();
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

  // Start odometry magnetic sensor.
  odometry.init();

  indicator.flash_blocking();
  TWELITE_INFO();  // All HW initialized.

  g_actions.init();
  // Initialize servo pos to safe (i.e. not colliding with rail) position.
  {
    Action action(1 /* dur_ms */);
    action.servo_pos[CIX_A] = 13;
    action.servo_pos[CIX_B] = 11;
    g_actions.enqueue(action);
  }

  // Fully initialized. Start realtime periodic process & idle tasks.
  setMillisHook(loop1ms);
  while (true) {
    if (g_twelite_packet_recv_done) {
      MaybeSlice datagram = twelite.get_datagram();
      if (datagram.is_valid()) {
        CommandHandler command_handler(datagram);
        command_handler.handle();
      }
      twelite.restart_recv();
    }
    if (g_async_message_avail) {
    }
    if (g_async_sensor_ttl_ms > 0 && g_async_sensor_since_last_sent_ms > 100) {
      IOStatus status;
      status.output = OutputStatus_init_default;
      fill_sensor_status(status.sensor);

      uint8_t buffer[80];
      buffer[0] = PacketType_IO_STATUS;
      pb_ostream_t stream =
          pb_ostream_from_buffer((pb_byte_t*)(buffer + 1), sizeof(buffer) - 1);
      if (pb_encode(&stream, IOStatus_fields, &status)) {
        twelite.send_datagram(buffer, 1 + stream.bytes_written);
      } else {
        TWELITE_ERROR(Cause_LOGIC_RT);
      }

      g_async_sensor_since_last_sent_ms = 0;
    }
  }
}
