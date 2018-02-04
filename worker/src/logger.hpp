#pragma once

class StringWriter {
public:
  char* const ptr_begin;
  char* ptr;
  char* const ptr_end; 

  StringWriter(char* p, uint8_t size) : ptr_begin(p), ptr(p), ptr_end(p + size) {
  }

  void write(char c) {
    if (ptr < ptr_end) {
      *ptr = c;
      ptr++;
    }
  }

  void write(const char* str) {
    while(*str) {
      write(*str);
      str++;
    }
  }

  void write_json_escaped(const char* s) {
    write('"');
    while(*s != 0) {
      char c = *s;
      if (c == '"') {
        write("\\\"");
      } else if (c == '\n') {
        write("\\n");
      } else {
        write(c);
      }
      s++;
    }
    write('"');
  }
};


class JsonArray;
class JsonDict;

// Streaming JSON writer.
class JsonElement {
private:
  StringWriter* writer;
public:
  JsonElement(StringWriter* writer) : writer(writer) {
  }

  void set(const char* s) {
    writer->write_json_escaped(s);
  }

  template<typename T>
  void set(const T& v) {
    String s(v);
    for (uint8_t i = 0; i < s.length(); i++) {
      writer->write(s.charAt(i));
    }
  }

  void set_null() {
    writer->write("null");
  }

  JsonArray as_array();
  JsonDict as_dict();
};

class JsonArray {
private:
  StringWriter* writer;
  bool is_first = true;
public:
  JsonArray(StringWriter* writer) : writer(writer), is_first(true) {
    writer->write('[');
  }

  JsonElement add() {
    if (is_first) {
      is_first = false;
    } else {
      writer->write(',');
    }
    return JsonElement(writer);
  }

  void end() {
    writer->write(']');
  }
};

class JsonDict {
private:
  StringWriter* writer;
  bool is_first = true;
public:
  JsonDict(StringWriter* writer) : writer(writer), is_first(true) {
    writer->write('{');
  }

  JsonElement insert(const char* key) {
    if (is_first) {
      is_first = false;
    } else {
      writer->write(',');
    }
    writer->write_json_escaped(key);
    writer->write(':');
    return JsonElement(writer);
  }

  void end() {
    writer->write('}');
  }
};

JsonArray JsonElement::as_array() {
  return JsonArray(writer);
}

JsonDict JsonElement::as_dict() {
  return JsonDict(writer);
}

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
