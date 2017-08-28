#pragma once

// Current logger design is messed up. It should become temporary ephemeral
// object issued by TweliteInterface. 
class Logger {
public:
  const static uint8_t SIZE = 200;
  char buffer[SIZE];
  uint8_t index;
public:
  volatile bool send;

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

  void print_dict_key(const char* s) {
    print_str(s);
    print(':');
  }

  void print_str(const char* s) {
    print('"');
    while(*s != 0) {
      char c = *s;
      if (c == '"') {
        print("\\\"");
      } else if (c == '\n') {
        print("\\n");
      } else {
        print(c);
      }
      s++;
    }
    print('"');
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

  // Simple warning message.
  // Warning=non-critical, expected errors.
  // e.g.
  // * network data corruption
  static void warn(const char* message) {
    // Parent, Send
    Serial.write(":0001");
    send_byte('W');
    send_cstr(message);
    // csum (omitted) + CRLF
    Serial.write("X\r\n");
    Serial.flush();
  }

  static void send_short(const char* message) {
    // Parent, Send
    Serial.write(":0001");
    send_cstr(message);
    // csum (omitted) + CRLF
    Serial.write("X\r\n");
    Serial.flush();
  }

  void send_soon() {
    send = true;
  }

private:
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

// Request scoped logger.
// Log buffer is created anew for every request.
Logger request_log;
