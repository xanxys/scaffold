#pragma once

#include "logger.hpp"

// Parse ":..." ASCII messages from standard TWELITE MWAPP.
class TweliteInterface {
private:
  // Command without ":" or newlines.
  const static uint8_t BUF_SIZE = 64;
  char buffer[BUF_SIZE];
  uint8_t size;

  // Size of 01 command data (excludes TWELITE header / csum) sent.
  uint32_t data_bytes_sent = 0;
  uint32_t data_bytes_recv = 0;
public:
  uint8_t get_datagram(uint8_t* data_ptr, uint8_t data_size) {
    while (true) {
      receive_command();

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
      }
    }
    data_bytes_recv += data_ix;
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

  // Simple warning message.
  // Warning=non-critical, expected errors.
  // e.g.
  // * network data corruption
  void warn(const char* message) {
    // Parent, Send
    Serial.write(":0001");
    send_byte('W');
    send_cstr(message);
    // csum (omitted) + CRLF
    Serial.write("X\r\n");
    Serial.flush();
  }

  void send_short(const char* message) {
    // Parent, Send
    Serial.write(":0001");
    send_cstr(message);
    // csum (omitted) + CRLF
    Serial.write("X\r\n");
    Serial.flush();
  }

  uint32_t get_data_bytes_sent() {
    return data_bytes_sent;
  }

  uint32_t get_data_bytes_recv() {
    return data_bytes_recv;
  }
private:
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

  void receive_command() {
    // Accept ":"
    while (getch() != ':');

    size = 0;
    while (true) {
      char c = getch();
      if (c == '\r' || c == '\n') {
        return;
      } else if (c == ':') {
        warn("unexpected':'");
      } else if (c == '!') {
        warn("unexpected'!");
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

  inline char format_half_byte(uint8_t v) {
    if (v < 10) {
      return '0' + v;
    } else {
      return 'A' + (v - 10);
    }
  }
};

TweliteInterface twelite;
