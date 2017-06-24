#include <SoftwareSerial.h>

SoftwareSerial workerSerial(8, 9); // RX, TX

void setup() {
  // Open serial communications and wait for port to open:
  Serial.begin(9600);
  while (!Serial) {
    ; // wait for serial port to connect. Needed for native USB port only
  }

  // set the data rate for the SoftwareSerial port
  workerSerial.begin(2400);
 }

void loop() {
  // read line from PC.
  char buffer[64];
  int w_ix = 0;
  while (true) {
    while (Serial.available() == 0);
    char c = Serial.read();
    if (c == '\n') {
      break;
    }
    buffer[w_ix] = c;
    w_ix++;
  }

  uint32_t timeout_ms = 100;
  if (buffer[0] == 'o') {
    timeout_ms = 10 * 1000;
  }

  // proxy command to worker
  for (int i = 0; i < w_ix; i++) {
    workerSerial.write(buffer[i]);
  }
  workerSerial.write("\n"); // LF
  Serial.print(w_ix + 1);
  Serial.println(" bytes sent");

  // continue receiving result until 100ms passed until last (request | response) byte.
  uint32_t t_last = millis();
  int recv_bytes = 0;
  while (true) {
    if (workerSerial.available()) {
      char c =  workerSerial.read();
      Serial.write(c);
      recv_bytes++;
      t_last = millis();
    } else {
      if (millis() - t_last > timeout_ms) {
        if (recv_bytes == 0) {
          Serial.println("Worker didn't respond in 100 msec");
        } else {
          Serial.print(recv_bytes);
          Serial.println(" bytes received");
          Serial.println("------------------");
        }
        break;
      }
    }
  }
}
