#pragma once

#include <stdint.h>

class MaybeSlice {
 public:
  // Should be const, but non-const to avoid unnecessary local variable
  // creations in callers. e.g. MaybeSlice p; p = f(p);  // ERROR if const
  // Forced to write:
  // MaybeSlice q = f(p);  // Note this is copy constructor, not assignment.
  uint8_t* ptr;
  uint8_t size;

  MaybeSlice() : ptr(nullptr), size(0) {}
  MaybeSlice(uint8_t* ptr, uint8_t size) : ptr(ptr), size(size) {}

  bool is_valid() const { return ptr != nullptr; }

  MaybeSlice slice(uint8_t offset) const {
    if (offset > size) {
      return MaybeSlice();
    } else {
      return MaybeSlice(ptr + offset, size - offset);
    }
  }

  MaybeSlice trim(uint8_t l, uint8_t r) const {
    // Non-overflowing comparison.
    uint8_t new_size = size;
    if (l > new_size) {
      return MaybeSlice();
    } else {
      new_size -= l;
    }
    if (r > new_size) {
      return MaybeSlice();
    } else {
      new_size -= r;
    }
    return MaybeSlice(ptr + l, new_size);
  }

  uint32_t u32_be() const {
    if (size < 4) {
      return 0;
    } else {
      return (static_cast<uint32_t>(ptr[0]) << 24) |
             (static_cast<uint32_t>(ptr[1]) << 16) |
             (static_cast<uint32_t>(ptr[2]) << 8) |
             (static_cast<uint32_t>(ptr[3]));
    }
  }
};
