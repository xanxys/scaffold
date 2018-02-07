#pragma once

#include <avr/boot.h>
#include <avr/io.h>
#include <nanopb/pb_encode.h>
#include <proto/builder.pb.h>

#include "slice.hpp"

uint8_t async_tx_buffer[80];
uint8_t warn_tx_buffer[80];

#define SIGROW_SERNUM0 0x0e
#define SIGROW_SERNUM1 0x0f
#define SIGROW_SERNUM2 0x10
#define SIGROW_SERNUM3 0x11

// Parse ":..." ASCII messages from standard TWELITE MWAPP.
class TweliteRecvStateMachine {
 private:
  static constexpr uint8_t BUFFER_SIZE = 120;

 public:
  enum State : uint8_t {
    WAITING_HEADER_COLON = 0,

    // Internal state.
    FIRST_NIBBLE = 1,
    SECOND_NIBBLE = 2,

    // end states
    DONE_OK = 0x10,
    DONE_ERR_INVALID = 0x11,
    DONE_ERR_OVERFLOW = 0x12,
  };

 private:
  volatile State state;

  uint8_t size_done = 0;
  uint8_t buffer[BUFFER_SIZE];
  uint8_t byte_temp = 0;

  static constexpr uint8_t INVALID_NIBBLE = 0xff;

 public:
  TweliteRecvStateMachine() { reset(); }

  // This won't change after becoming DONE_, unless reset() is called.
  State get_state() const { return state; }

  bool is_done() const { return (uint8_t)state & 0x10; }

  MaybeSlice get_buffer() {
    if (state != State::DONE_OK) {
      return MaybeSlice();
    } else {
      return MaybeSlice(buffer, size_done);
    }
  }

  // Need to call this to start getting another packet, after get_state()
  // becomes DONE_*.
  void reset() { state = WAITING_HEADER_COLON; }

  void feed(char c) {
    if (state == WAITING_HEADER_COLON) {
      if (c == ':') {
        state = FIRST_NIBBLE;
        size_done = 0;
      }
    } else if (state == FIRST_NIBBLE) {
      if (c == '\r' || c == '\n') {
        state = DONE_OK;
        return;
      }
      uint8_t nibble = decode_nibble(c);
      if (nibble == INVALID_NIBBLE) {
        state = DONE_ERR_INVALID;
      } else {
        state = SECOND_NIBBLE;
        byte_temp = nibble << 4;
      }
    } else {
      uint8_t nibble = decode_nibble(c);
      if (nibble == INVALID_NIBBLE) {
        state = DONE_ERR_INVALID;
      } else {
        state = FIRST_NIBBLE;
        buffer[size_done++] = byte_temp | nibble;
        if (size_done >= BUFFER_SIZE) {
          state = DONE_ERR_OVERFLOW;
        }
      }
    }
  }

 private:
  // returns: [0, 15] for valid nibble, otherwise INVALID_NIBBLE.
  uint8_t decode_nibble(char c) {
    if ('0' <= c && c <= '9') {
      return c - '0';
    } else if ('A' <= c && c <= 'F') {
      return (c - 'A') + 10;
    } else {
      return INVALID_NIBBLE;
    }
  }
};

#define TWELITE_ERROR_INTN(cause) \
  send_checkpoint(Criticality_ERROR, cause, __LINE__)

class TweliteInterface {
 private:
  // Size of 01 command data (excludes TWELITE header / csum) sent.
  uint32_t data_bytes_sent = 0;
  uint32_t data_bytes_recv = 0;

  uint16_t num_invalid_packet = 0;

  TweliteRecvStateMachine recv_sm;

  enum class RecvResult : uint8_t { OK, OVERFLOW, INVALID };

 public:
  void init() {
    Serial.begin(38400);
    Serial.set_recv_callback(&recv_sm, &cb);
  }

  static void cb(void* base, uint8_t c) {
    static_cast<TweliteRecvStateMachine*>(base)->feed((char)c);
  }

  uint32_t get_device_id() {
    return static_cast<uint32_t>(boot_signature_byte_get(SIGROW_SERNUM0)) |
           (static_cast<uint32_t>(boot_signature_byte_get(SIGROW_SERNUM1))
            << 8) |
           (static_cast<uint32_t>(boot_signature_byte_get(SIGROW_SERNUM2))
            << 16) |
           (static_cast<uint32_t>(boot_signature_byte_get(SIGROW_SERNUM3))
            << 24);
  }

  void restart_recv() { recv_sm.reset(); }

  // Wait for next datagram addressed (including broadcast) to this device.
  MaybeSlice get_datagram() {
    while (true) {
      restart_recv();
      while (!recv_sm.is_done()) {
      }

      switch (recv_sm.get_state()) {
        case TweliteRecvStateMachine::State::DONE_OK:
          break;
        case TweliteRecvStateMachine::State::DONE_ERR_INVALID:
          num_invalid_packet++;
          continue;
        case TweliteRecvStateMachine::State::DONE_ERR_OVERFLOW:
          TWELITE_ERROR_INTN(Cause_OVERMIND);
          continue;

        default:
          TWELITE_ERROR_INTN(Cause_OVERMIND);  // shouldn't reach here.
          continue;
      }
      MaybeSlice packet = recv_sm.get_buffer();
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
    serial_write_cstr_blocking(":0001");
    // Overmind info.
    send_u32_be(get_device_id());
    send_u32_be(millis());
    // Data in hex.
    for (uint8_t i = 0; i < size; i++) {
      send_byte(ptr[i]);
    }
    // csum (omitted) + CRLF
    serial_write_cstr_blocking("X\r\n");
  }

  void send_checkpoint(Criticality criticality, Cause cause, uint16_t line) {
    Checkpoint cp;
    cp.criticality = criticality;
    cp.cause = cause;
    cp.at_line = line;

    uint8_t buffer[16];
    buffer[0] = PacketType_CHECKPOINT;
    pb_ostream_t stream =
        pb_ostream_from_buffer((pb_byte_t*)(buffer + 1), sizeof(buffer) - 1);
    if (pb_encode(&stream, Checkpoint_fields, &cp)) {
      send_datagram(buffer, 1 + stream.bytes_written);
    } else {
      // don't do anything, because it might cause infinite error loop.
    }
  }

  uint32_t get_data_bytes_sent() const { return data_bytes_sent; }

  uint32_t get_data_bytes_recv() const { return data_bytes_recv; }

  uint16_t get_num_invalid_packet() const { return num_invalid_packet; }

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
      TWELITE_ERROR_INTN(Cause_OVERMIND);  // too small to be valid
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
      TWELITE_ERROR_INTN(Cause_OVERMIND);  // address required but not found
      return MaybeSlice();
    }
    uint32_t addr = ovm_packet.u32_be();
    if (addr != get_device_id() && addr != 0xffffffff) {
      return MaybeSlice();
    }
    return ovm_packet.trim(4, 0);
  }

  inline void send_byte(uint8_t v) {
    serial_write_byte_blocking(format_half_byte(v >> 4));
    serial_write_byte_blocking(format_half_byte(v & 0xf));
    data_bytes_sent++;
  }

  inline void serial_write_cstr_blocking(const char* p) {
    while (*p) {
      serial_write_byte_blocking(*p);
      p++;
    }
  }

  inline void serial_write_byte_blocking(uint8_t v) {
    while (!(UCSR0A & _BV(UDRE0))) {
    }
    UDR0 = v;
  }

  inline static char format_half_byte(uint8_t v) {
    if (v < 10) {
      return '0' + v;
    } else {
      return 'A' + (v - 10);
    }
  }
};

#define TWELITE_INFO() \
  twelite.send_checkpoint(Criticality_INFO, Cause_LOGIC, __LINE__)
#define TWELITE_ERROR(cause) \
  twelite.send_checkpoint(Criticality_ERROR, cause, __LINE__)
#define TWELITE_SEVERE(cause) \
  twelite.send_checkpoint(Criticality_SEVERE, cause, __LINE__)
