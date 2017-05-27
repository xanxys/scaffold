#include <SoftwareSerial.h>

SoftwareSerial workerSerial(2, 3); // RX, TX

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
  if (workerSerial.available()) {
    Serial.write(workerSerial.read());
  }
  if (Serial.available()) {
    workerSerial.write(Serial.read());
  }
}
