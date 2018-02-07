/*
  HardwareSerial.cpp - Hardware serial library for Wiring
  Copyright (c) 2006 Nicholas Zambetti.  All right reserved.

  This library is free software; you can redistribute it and/or
  modify it under the terms of the GNU Lesser General Public
  License as published by the Free Software Foundation; either
  version 2.1 of the License, or (at your option) any later version.

  This library is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
  Lesser General Public License for more details.

  You should have received a copy of the GNU Lesser General Public
  License along with this library; if not, write to the Free Software
  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA

  Modified 23 November 2006 by David A. Mellis
  Modified 28 September 2010 by Mark Sproul
  Modified 14 August 2012 by Alarus
*/

#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "Arduino.h"
#include "wiring_private.h"

// this next line disables the entire HardwareSerial.cpp,
// this is so I can support Attiny series and any other chip without a uart
#if defined(UBRRH) || defined(UBRR0H) || defined(UBRR1H) || defined(UBRR2H) || \
    defined(UBRR3H)

#include "HardwareSerial.h"

/*
 * on ATmega8, the uart and its bits are not numbered, so there is no "TXC0"
 * definition.
 */
#if !defined(TXC0)
#if defined(TXC)
#define TXC0 TXC
#elif defined(TXC1)
// Some devices have uart1 but no uart0
#define TXC0 TXC1
#else
#error TXC0 not definable in HardwareSerial.h
#endif
#endif

#if !defined(USART0_RX_vect) && defined(USART1_RX_vect)
// do nothing - on the 32u4 the first USART is USART1
#else
#if !defined(USART_RX_vect) && !defined(USART0_RX_vect) && \
    !defined(USART_RXC_vect)
#error "Don't know what the Data Received vector is called for the first UART"
#else
void serialEvent() __attribute__((weak));
void serialEvent() {}
#define serialEvent_implemented
#if defined(USART_RX_vect)
ISR(USART_RX_vect)
#elif defined(USART0_RX_vect)
ISR(USART0_RX_vect)
#elif defined(USART_RXC_vect)
ISR(USART_RXC_vect)  // ATmega8
#endif
{
#if defined(UDR0)
  if (bit_is_clear(UCSR0A, UPE0)) {
    unsigned char c = UDR0;
    if (Serial.recv_callback) {
      Serial.recv_callback(Serial.cb_base, c);
    }
  } else {
    unsigned char c = UDR0;
  };
#elif defined(UDR)
  if (bit_is_clear(UCSRA, PE)) {
    unsigned char c = UDR;
    if (Serial.recv_callback) {
      Serial.recv_callback(Serial.cb_base, c);
    }
  } else {
    unsigned char c = UDR;
  };
#else
#error UDR not defined
#endif
}
#endif
#endif

#if !defined(USART0_UDRE_vect) && defined(USART1_UDRE_vect)
// do nothing - on the 32u4 the first USART is USART1
#else
#if !defined(UART0_UDRE_vect) && !defined(UART_UDRE_vect) && \
    !defined(USART0_UDRE_vect) && !defined(USART_UDRE_vect)
#error \
    "Don't know what the Data Register Empty vector is called for the first UART"
#else
#if defined(UART0_UDRE_vect)
ISR(UART0_UDRE_vect)
#elif defined(UART_UDRE_vect)
ISR(UART_UDRE_vect)
#elif defined(USART0_UDRE_vect)
ISR(USART0_UDRE_vect)
#elif defined(USART_UDRE_vect)
ISR(USART_UDRE_vect)
#endif
{
}
#endif
#endif

// Constructors ////////////////////////////////////////////////////////////////

HardwareSerial::HardwareSerial(volatile uint8_t *ubrrh, volatile uint8_t *ubrrl,
                               volatile uint8_t *ucsra, volatile uint8_t *ucsrb,
                               volatile uint8_t *ucsrc, volatile uint8_t *udr,
                               uint8_t rxen, uint8_t txen, uint8_t rxcie,
                               uint8_t udrie, uint8_t u2x) {
  _ubrrh = ubrrh;
  _ubrrl = ubrrl;
  _ucsra = ucsra;
  _ucsrb = ucsrb;
  _ucsrc = ucsrc;
  _udr = udr;
  _rxen = rxen;
  _txen = txen;
  _rxcie = rxcie;
  _udrie = udrie;
  _u2x = u2x;
}

void HardwareSerial::set_recv_callback(void *cb_base,
                                       void (*hook)(void *, uint8_t)) {
  this->cb_base = cb_base;
  this->recv_callback = hook;
}

// Public Methods //////////////////////////////////////////////////////////////

void HardwareSerial::begin(unsigned long baud) {
  uint16_t baud_setting;
  bool use_u2x = true;

try_again:

  if (use_u2x) {
    *_ucsra = 1 << _u2x;
    baud_setting = (F_CPU / 4 / baud - 1) / 2;
  } else {
    *_ucsra = 0;
    baud_setting = (F_CPU / 8 / baud - 1) / 2;
  }

  if ((baud_setting > 4095) && use_u2x) {
    use_u2x = false;
    goto try_again;
  }

  // assign the baud_setting, a.k.a. ubbr (USART Baud Rate Register)
  *_ubrrh = baud_setting >> 8;
  *_ubrrl = baud_setting;

  sbi(*_ucsrb, _rxen);
  sbi(*_ucsrb, _txen);
  sbi(*_ucsrb, _rxcie);
  cbi(*_ucsrb, _udrie);
}

void HardwareSerial::begin(unsigned long baud, byte config) {
  uint16_t baud_setting;
  bool use_u2x = true;

try_again:

  if (use_u2x) {
    *_ucsra = 1 << _u2x;
    baud_setting = (F_CPU / 4 / baud - 1) / 2;
  } else {
    *_ucsra = 0;
    baud_setting = (F_CPU / 8 / baud - 1) / 2;
  }

  if ((baud_setting > 4095) && use_u2x) {
    use_u2x = false;
    goto try_again;
  }

  // assign the baud_setting, a.k.a. ubbr (USART Baud Rate Register)
  *_ubrrh = baud_setting >> 8;
  *_ubrrl = baud_setting;

  // set the data bits, parity, and stop bits
#if defined(__AVR_ATmega8__)
  config |= 0x80;  // select UCSRC register (shared with UBRRH)
#endif
  *_ucsrc = config;

  sbi(*_ucsrb, _rxen);
  sbi(*_ucsrb, _txen);
  sbi(*_ucsrb, _rxcie);
  cbi(*_ucsrb, _udrie);
}

void HardwareSerial::end() {
  cbi(*_ucsrb, _rxen);
  cbi(*_ucsrb, _txen);
  cbi(*_ucsrb, _rxcie);
  cbi(*_ucsrb, _udrie);
}

// Preinstantiate Objects //////////////////////////////////////////////////////

HardwareSerial Serial(&UBRR0H, &UBRR0L, &UCSR0A, &UCSR0B, &UCSR0C, &UDR0, RXEN0,
                      TXEN0, RXCIE0, UDRIE0, U2X0);

#endif  // whole file
