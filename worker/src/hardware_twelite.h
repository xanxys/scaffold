#pragma once

#include <proto/builder.pb.h>
#include "slice.hpp"

extern uint8_t async_tx_buffer[80];
extern uint8_t warn_tx_buffer[80];

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
  TweliteRecvStateMachine();

  // This won't change after becoming DONE_, unless reset() is called.
  State get_state() const;

  bool is_done() const;

  MaybeSlice get_buffer();

  // Need to call this to start getting another packet, after get_state()
  // becomes DONE_*.
  void reset();

  void feed(char c);

 private:
  // returns: [0, 15] for valid nibble, otherwise INVALID_NIBBLE.
  static uint8_t decode_nibble(char c);
};

class TweliteInterface {
 private:
  // Size of 01 command data (excludes TWELITE header / csum) sent.
  uint32_t data_bytes_sent = 0;
  uint32_t data_bytes_recv = 0;

  uint16_t num_invalid_packet = 0;

  TweliteRecvStateMachine recv_sm;

  enum class RecvResult : uint8_t { OK, OVERFLOW, INVALID };

 public:
  void init();

  static void cb(void* base, uint8_t c);

  uint32_t get_device_id();

  void restart_recv();

  /** Returns datagram if DONE_OK and packet is valid, otherwise returns empty slice. */
  MaybeSlice get_datagram();

  // Send specified buffer.
  // Ideally size<=80 bytes to fit in one packet.
  void send_datagram(const uint8_t* ptr, uint8_t size);
  void send_checkpoint(Criticality criticality, Cause cause, uint16_t line, const char* filename);

  uint32_t get_data_bytes_sent() const;
  uint32_t get_data_bytes_recv() const;
  uint16_t get_num_invalid_packet() const;

 private:
  void send_u32_be(uint32_t v);

  // TWELITE-Modbus level check. We only accept valid ASCII packets with
  // origin=0x00, command=0x01
  MaybeSlice validate_and_extract_modbus(MaybeSlice modbus_packet);

  MaybeSlice validate_and_extract_overmind(MaybeSlice ovm_packet);

  void send_byte(uint8_t v);

  void serial_write_cstr_blocking(const char* p);
  void serial_write_byte_blocking(uint8_t v);
  static char format_half_byte(uint8_t v);
};

#define TWELITE_INFO() \
  twelite.send_checkpoint(Criticality_INFO, Cause_LOGIC, __LINE__, __FILE__)
#define TWELITE_ERROR(cause) \
  twelite.send_checkpoint(Criticality_ERROR, cause, __LINE__, __FILE__)
#define TWELITE_SEVERE(cause) \
  twelite.send_checkpoint(Criticality_SEVERE, cause, __LINE__, __FILE__)
