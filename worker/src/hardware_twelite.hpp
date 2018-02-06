#pragma once

#include <avr/boot.h>

#include "json_writer.hpp"
#include "slice.hpp"

uint8_t async_tx_buffer[100];
uint8_t warn_tx_buffer[70];

#define SIGROW_SERNUM0 0x0e
#define SIGROW_SERNUM1 0x0f
#define SIGROW_SERNUM2 0x10
#define SIGROW_SERNUM3 0x11

// Parse ":..." ASCII messages from standard TWELITE MWAPP.
class TweliteInterface {
 private:
  // RX buffer.
  // Decodex command without ":" or newlines, but includes checksum.
  const static uint8_t BUF_SIZE = 150;
  uint8_t buffer[BUF_SIZE];

  volatile uint8_t send_async_size = 0;

  // Size of 01 command data (excludes TWELITE header / csum) sent.
  uint32_t data_bytes_sent = 0;
  uint32_t data_bytes_recv = 0;

  enum class RecvResult : uint8_t { OK, OVERFLOW, INVALID };

 public:
  void init() { Serial.begin(38400); }

  void queue_send_async(uint8_t async_size) { send_async_size = async_size; }

  uint32_t get_device_id() {
    return static_cast<uint32_t>(boot_signature_byte_get(SIGROW_SERNUM0)) |
           (static_cast<uint32_t>(boot_signature_byte_get(SIGROW_SERNUM1))
            << 8) |
           (static_cast<uint32_t>(boot_signature_byte_get(SIGROW_SERNUM2))
            << 16) |
           (static_cast<uint32_t>(boot_signature_byte_get(SIGROW_SERNUM3))
            << 24);
  }

  // Wait for next datagram addressed (including broadcast) to this device.
  // retval: slice of buffer held by this instance. returns invalid slice when
  // overflown.
  MaybeSlice get_datagram() {
    while (true) {
      MaybeSlice packet;
      RecvResult res = receive_modbus_command(&packet);
      if (res == RecvResult::INVALID) {
        continue;
      } else if (res == RecvResult::OVERFLOW) {
        return MaybeSlice();
      }

      packet = validate_and_extract_modbus(packet);
      packet = validate_and_extract_overmind(packet);
      if (packet.is_valid()) {
        return packet;
      }
    }
  }

  // Send specified buffer.
  // Ideally size<=80 bytes to fit in one packet.
  void send_datagram(const uint8_t* ptr, uint8_t size) {
    // Parent, Send
    Serial.write(":0001");
    // Overmind info.
    send_u32_be(get_device_id());
    send_u32_be(millis());
    // Data in hex.
    for (uint8_t i = 0; i < size; i++) {
      send_byte(ptr[i]);
    }
    // csum (omitted) + CRLF
    Serial.write("X\r\n");
    Serial.flush();
  }

  // Simple warning message.
  // Warning=non-critical, expected errors.
  // e.g.
  // * network data corruption
  void warn(const char* message) { send_status("WARN", message); }

  void info(const char* message) { send_status("INFO", message); }

  uint32_t get_data_bytes_sent() { return data_bytes_sent; }

  uint32_t get_data_bytes_recv() { return data_bytes_recv; }

 private:
  void send_u32_be(uint32_t v) {
    send_byte(v >> 24);
    send_byte((v >> 16) & 0xff);
    send_byte((v >> 8) & 0xff);
    send_byte(v & 0xff);
  }

  // TWELITE-Modbus level check. We only accept valid ASCII packets with
  // origin=0x00, command=0x01
  MaybeSlice validate_and_extract_modbus(MaybeSlice modbus_packet) {
    if (!modbus_packet.is_valid()) {
      return MaybeSlice();
    }

    // Filter / validate.
    // 3 = target(1) + command(1) + data(N) + checksum(1)
    if (modbus_packet.size < 3) {
      warn("too small twelite packet");
      return MaybeSlice();
    }
    if (modbus_packet.ptr[0] != 0x00 || modbus_packet.ptr[1] != 0x01) {
      // There are so many noisy packets (e.g. auto-local echo), we shouldn't
      // treat them as warning.
      return MaybeSlice();
    }
    return modbus_packet.trim(2, 1);
  }

  MaybeSlice validate_and_extract_overmind(MaybeSlice ovm_packet) {
    if (!ovm_packet.is_valid()) {
      return MaybeSlice();
    }

    // OvmPacket = <Addr : 4> <datagram>
    if (ovm_packet.size < 4) {
      warn("no address");
      return MaybeSlice();
    }
    uint32_t addr = ovm_packet.u32_be();
    if (addr != get_device_id() && addr != 0xffffffff) {
      return MaybeSlice();
    }
    return ovm_packet.trim(4, 0);
  }

  uint32_t intercept_header() {
    // Search SID=xxxx. Abandon at 100B.
    uint8_t n_read = 0;
    const char* target = "SID=";
    uint8_t ok_ix = 0;
    while (true) {
      if (n_read > 100) {
        return 0;  // failed to get SID=.
      }

      char c = getch();
      n_read++;
      if (c == ':') {
        // exit on command start, to not mess up other commands
        // when e.g. AVR is re-flashed while TWELITE is connected to power
        return 0;
      } else if (c == target[ok_ix]) {
        ok_ix++;
        if (ok_ix >= 4) {
          break;
        }
      } else {
        ok_ix = 0;
      }
    }

    // Discard "0x";
    getch();
    getch();

    uint32_t v = 0;
    for (uint8_t i = 0; i < 8; i++) {
      v <<= 4;
      v |= decode_nibble(getch());
    }
    return v;
  }

  void send_status(const char* type, const char* message) {
    StringWriter writer((char*)warn_tx_buffer, sizeof(warn_tx_buffer));

    JsonDict resp(&writer);
    resp.insert("ty").set(type);
    resp.insert("msg").set(message);
    resp.end();

    send_datagram(warn_tx_buffer, writer.size_written());
  }

  uint8_t decode_nibble(char c) {
    if ('0' <= c && c <= '9') {
      return c - '0';
    } else if ('A' <= c && c <= 'F') {
      return (c - 'A') + 10;
    } else {
      warn("corrupt hex from TWELITE");
      return 0;
    }
  }

  RecvResult receive_modbus_command(MaybeSlice* out_slice) {
    while (getch_concurrent() != ':')
      ;

    uint8_t size = 0;
    bool first_nibble = true;
    uint8_t v_temp = 0;
    while (true) {
      char c = getch();
      if (c == '\r' || c == '\n') {
        if (!first_nibble) {
          return RecvResult::INVALID;  // last byte was incomplete.
        } else {
          *out_slice = MaybeSlice(buffer, size);
          return RecvResult::OK;
        }
      } else if (c == ':') {
        warn("unexpected':'");
        return RecvResult::INVALID;
      } else if (c == '!') {
        warn("unexpected'!");
        return RecvResult::INVALID;
      } else {
        v_temp <<= 4;
        v_temp |= decode_nibble(c);
        first_nibble = !first_nibble;

        if (first_nibble) {
          if (size < BUF_SIZE) {
            buffer[size] = v_temp;
            v_temp = 0;
            size++;
          } else {
            consume_this_command();
            return RecvResult::OVERFLOW;
          }
        }
      }
    }
  }

  void consume_this_command() {
    while (true) {
      char c = getch();
      if (c == '\r' || c == '\n') {
        return;
      }
    }
  }

  char getch_concurrent() {
    while (Serial.available() == 0) {
      uint8_t async_size = send_async_size;
      if (async_size) {
        send_datagram(async_tx_buffer, async_size);
        send_async_size = 0;
      }
    }
    return Serial.read();
  }

  char getch() {
    while (Serial.available() == 0) {
    }
    return Serial.read();
  }

  void send_cstr(const char* ptr) {
    while (true) {
      uint8_t v = *ptr;
      if (v == 0) {
        break;
      }
      send_byte(v);
      ptr++;
    }
  }

  inline void send_byte(uint8_t v) {
    Serial.write(format_half_byte(v >> 4));
    Serial.write(format_half_byte(v & 0xf));
    data_bytes_sent++;
  }

  inline static char format_half_byte(uint8_t v) {
    if (v < 10) {
      return '0' + v;
    } else {
      return 'A' + (v - 10);
    }
  }
};
