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

  void send_soon() {
    send_async = true;
  }
};

// Request scoped logger.
// Log buffer is created anew for every request.
Logger<250> request_log;
