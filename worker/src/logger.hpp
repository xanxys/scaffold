#pragma once

// Current logger design is messed up. It should become temporary ephemeral
// object issued by TweliteInterface.
template<unsigned int SIZE>
class Logger {
public:
  char buffer[SIZE];
  uint8_t index;
public:
  volatile bool send_async;

  Logger() : index(0) {}

  void clear() {
    index = 0;
  }

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

  inline void print(char v) {
    if (index < SIZE) {
      buffer[index] = v;
      index++;
    }
  }

  void print_dict_key(const char* s) {
    print_str(s);
    print(':');
  }

  // Print standard "ty" & "t/ms" fields.
  // Must be called inside a dict.
  void begin_std_dict(const char* ty) {
    print('{');

    print_dict_key("ty");
    print_str(ty);
    print(',');

    print_dict_key("t/ms");
    print(millis());
    print(',');
  }

  // Print escaped string.
  void print_str(const char* s, uint8_t size) {
    print('"');
    for (uint8_t i = 0; i < size; i++) {
      char c = *s;
      if (c == '"') {
        print("\\\"");
      } else if (c == '\n') {
        print("\\n");
      } else if (c < 0x20 || c >= 0x7f) {
        print("\\x");
        print(format_half_byte(c >> 4));
        print(format_half_byte(c & 0xf));
      } else {
        print(c);
      }
      s++;
    }
    print('"');
  }

  // Print escaped 0-terminated string.
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

  void send_soon() {
    send_async = true;
  }
private:
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
Logger<250> request_log;
