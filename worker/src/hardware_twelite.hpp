#pragma once

#include <EEPROM.h>

#include "logger.hpp"

// Parse ":..." ASCII messages from standard TWELITE MWAPP.
class TweliteInterface {
private:
  // RX buffer.
  // Command without ":" or newlines.
  const static uint8_t BUF_SIZE = 150;
  char buffer[BUF_SIZE];
  uint8_t size;

  // TX buffer.
  Logger<70> warn_log;

  // Size of 01 command data (excludes TWELITE header / csum) sent.
  uint32_t data_bytes_sent = 0;
  uint32_t data_bytes_recv = 0;

  struct RecvCommandResult {
    bool overflow : 1;
    bool is_command : 1;
  };
  bool first = true;

  const uint32_t UID_EEPROM_ADDR = 0;

  uint32_t uid = 0;
public:
  void init() {
    Serial.begin(38400);
    // Refresh UID and persist to EEPROM.
    uint32_t hdr_uid = intercept_header();

    uid = read_eeprom_be(UID_EEPROM_ADDR);
    if (uid == 0xffffffff) {
      uid = 0; // default is 0xff...., treat them as 0.
    }

    if (uid == 0 && hdr_uid != 0) {
      uid = hdr_uid;
      write_eeprom_be(UID_EEPROM_ADDR, uid);
    }
  }

  // If fails, returns 0.
  uint32_t get_device_id() {
    return uid;
  }


  // 0: overflown
  uint8_t get_datagram(uint8_t* data_ptr, uint8_t data_size) {
    while (true) {
      RecvCommandResult res = receive_command();
      if (res.overflow) {
        return 0;
      }

      // Filter / validate.
      // 6 = target(2) + command(2) + data(N) + checksum(2)
      if (size < 6 || size % 2 != 0) {
        warn("too small packet");
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
      } else {
        return 0;
      }
    }
    data_bytes_recv += data_ix;
    return data_ix;
  }

  // Send specified buffer.
  // Ideally <=80 bytes to fit in one packet.
  void send_datagram(const char* ptr, uint8_t size) {
    // Parent, Send
    Serial.write(":0001");
    // Data in hex.
    for(uint8_t i = 0; i < size; i++) {
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
  void warn(const char* message) {
    send_status("WARN", message);
  }

  void info(const char* message) {
    send_status("INFO", message);
  }

  void info(const char* message, const char* vp, uint8_t vs) {
    warn_log.clear();
    warn_log.begin_std_dict("INFO");

    warn_log.print_dict_key("msg");
    warn_log.print_str(message);

    warn_log.print_dict_key("val");
    warn_log.print_str(vp, vs);

    warn_log.print('}');

    send_datagram(warn_log.buffer, warn_log.index);
  }

  uint32_t get_data_bytes_sent() {
    return data_bytes_sent;
  }

  uint32_t get_data_bytes_recv() {
    return data_bytes_recv;
  }
private:
  uint32_t intercept_header() {
    // Search SID=xxxx. Abandon at 100B.
    uint8_t n_read = 0;
    while (true) {
      if (n_read > 100) {
        return 0;  // failed to get SID=.
      }

      n_read++;
      if (getch() != 'S') {
        continue;
      }
      n_read++;
      if (getch() != 'I') {
        continue;
      }
      n_read++;
      if (getch() != 'D') {
        continue;
      }
      n_read++;
      if (getch() != '=') {
        continue;
      }
      break;
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

  static void write_eeprom_be(uint16_t addr, uint32_t v) {
    for (uint8_t i = 0; i < 4; i++) {
      EEPROM.write(addr + i, v >> 24);
      v <<= 8;
    }
  }

  static uint32_t read_eeprom_be(uint16_t addr) {
    uint32_t v = 0;
    for (uint8_t i = 0; i < 4; i++) {
      v <<= 8;
      v |= EEPROM.read(addr + i);
    }
    return v;
  }

  void send_status(const char* type, const char* message) {
    warn_log.clear();
    warn_log.begin_std_dict(type);

    warn_log.print_dict_key("msg");
    warn_log.print_str(message);

    warn_log.print('}');

    send_datagram(warn_log.buffer, warn_log.index);
  }

  uint8_t decode_nibble(char c) {
    if ('0' <= c && c <= '9') {
      return c - '0';
    } else if ('A' <= c && c <= 'F'){
      return (c - 'A') + 10;
    } else {
      warn("corrupt hex from TWELITE");
      return 0;
    }
  }

  RecvCommandResult receive_command() {
    while (getch_concurrent() != ':');

    RecvCommandResult result;
    result.overflow = false;
    result.is_command = true;
    size = 0;
    while (true) {
      char c = getch();
      if (c == '\r' || c == '\n') {
        return result;
      } else if (c == ':') {
        warn("unexpected':'");
      } else if (c == '!') {
        warn("unexpected'!");
      } else {
        if (size < BUF_SIZE) {
          buffer[size] = c;
          size++;
        } else {
          result.overflow = true;
        }
      }
    }
  }

  char getch_concurrent() {
    while (Serial.available() == 0) {
      if (request_log.send_async) {
        send_datagram(request_log.buffer, request_log.index);
        request_log.clear();
        request_log.send_async = false;
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

TweliteInterface twelite;
