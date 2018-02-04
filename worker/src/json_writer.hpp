#pragma once

class StringWriter {
public:
  char* const ptr_begin;
  char* ptr;
  char* const ptr_end; 

  StringWriter(char* p, uint8_t size) : ptr_begin(p), ptr(p), ptr_end(p + size) {
  }

  uint8_t size_written() const {
    return ptr - ptr_begin;
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
