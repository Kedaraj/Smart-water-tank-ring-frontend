/*
   AquaSmart ESP32 Water Tank Monitor
   Board: ESP32 Dev Module
   Sensor: HC-SR04 Ultrasonic
   Firebase Realtime Database

   Wiring:
     HC-SR04 VCC  → 5V (Vin)
     HC-SR04 GND  → GND
     HC-SR04 TRIG → GPIO 5
     HC-SR04 ECHO → [1kΩ]→GPIO 18→[2kΩ]→GND  (voltage divider!)
     Relay    IN  → GPIO 26  (LOW = pump ON)
     Buzzer   +   → GPIO 27
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

//=========================
// WiFi
//=========================
const char* WIFI_SSID     = "Kedraj";
const char* WIFI_PASSWORD = "KKKKKKKK";

//=========================
// Firebase
//=========================
const char* FIREBASE_HOST =
  "aquasmart-70-default-rtdb.asia-southeast1.firebasedatabase.app";

const char* FIREBASE_SECRET =
  "TDYEPUMV87vDVnEZx6020Jfdfc0YBKdZ67dIzpsu";

//=========================
// Tank Settings
//=========================
const float TANK_HEIGHT_CM   = 30.0;   // cm  — inside tank height
const float TANK_CAPACITY_L  = 50.0;   // L   — total capacity
const float SENSOR_OFFSET_CM = 5.0;    // cm  — gap from sensor to full water
const float FULL_THRESHOLD   = 95.0;   // %   — auto-cutoff level

//=========================
// Pins
//=========================
#define TRIG_PIN   5
#define ECHO_PIN   18
#define RELAY_PIN  26
#define BUZZER_PIN 27

//=========================
// Timing
//=========================
const unsigned long PUMP_ON_INTERVAL  = 5000;   // 5s  when pump is running
const unsigned long PUMP_OFF_INTERVAL = 30000;  // 30s when pump is idle

//=========================
// State
//=========================
bool  pumpState   = false;
bool  tankFull    = false;
unsigned long lastUpdate = 0;

bool  buzzerActive = false;
unsigned long buzzerTimer = 0;
int   buzzerCount  = 0;

//=========================
// Tank Level Structure
//=========================
struct Level {
  float pct;
  float liters;
  float distCM;
  float heightCM;
  bool  valid;
};

//=========================
// WiFi Connect
//=========================
bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting WiFi");
  for (int i = 0; i < 30; i++) {
    if (WiFi.status() == WL_CONNECTED) break;
    Serial.print(".");
    delay(500);
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("✅ WiFi OK — IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }
  Serial.println("❌ WiFi Failed");
  return false;
}

//=========================
// Pump Control (active-low relay)
//=========================
void setPump(bool on) {
  pumpState = on;
  digitalWrite(RELAY_PIN, on ? LOW : HIGH);
  Serial.print("🔌 Pump → ");
  Serial.println(on ? "ON" : "OFF");
}

//=========================
// Read HC-SR04 (median of 5)
//=========================
float readDistanceCM() {
  float val[5];

  for (int i = 0; i < 5; i++) {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    long duration = pulseIn(ECHO_PIN, HIGH, 30000);
    val[i] = (duration == 0) ? 999.0f : duration * 0.0343f / 2.0f;
    delay(40);
  }

  // Sort → median
  for (int i = 0; i < 4; i++)
    for (int j = i + 1; j < 5; j++)
      if (val[j] < val[i]) { float t = val[i]; val[i] = val[j]; val[j] = t; }

  return val[2];
}

//=========================
// Calculate Tank Level
//=========================
Level calculateLevel(float dist) {
  Level L;
  L.distCM = dist;

  if (dist < 2.0f || dist > 400.0f) {
    L.valid = false;
    return L;
  }

  L.valid    = true;
  L.heightCM = constrain(TANK_HEIGHT_CM - (dist - SENSOR_OFFSET_CM), 0.0f, TANK_HEIGHT_CM);
  L.pct      = constrain((L.heightCM / TANK_HEIGHT_CM) * 100.0f, 0.0f, 100.0f);
  L.liters   = (L.pct / 100.0f) * TANK_CAPACITY_L;
  return L;
}

//=========================
// Firebase PATCH
//=========================
bool firebasePatch(const char* path, const String& json) {
  HTTPClient http;
  String url = String("https://") + FIREBASE_HOST + path + ".json?auth=" + FIREBASE_SECRET;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);
  int code = http.sendRequest("PATCH", json);
  http.end();
  return (code == 200);
}

//=========================
// Firebase GET
//=========================
String firebaseGet(const char* path) {
  HTTPClient http;
  String url = String("https://") + FIREBASE_HOST + path + ".json?auth=" + FIREBASE_SECRET;
  http.begin(url);
  http.setTimeout(8000);
  int  code     = http.GET();
  String response = (code == 200) ? http.getString() : "null";
  http.end();
  return response;
}

//=========================
// Buzzer (non-blocking 3 beeps)
//=========================
void startBuzzer() {
  buzzerActive = true;
  buzzerTimer  = millis();
  buzzerCount  = 0;
  Serial.println("🔔 Buzzer — Tank Full!");
}

void handleBuzzer() {
  if (!buzzerActive) return;
  unsigned long elapsed = millis() - buzzerTimer;
  int cycle = elapsed / 400;
  int phase = elapsed % 400;
  if (cycle >= 6) { digitalWrite(BUZZER_PIN, LOW); buzzerActive = false; return; }
  digitalWrite(BUZZER_PIN, (phase < 200) ? HIGH : LOW);
}

//=========================
// Send data to Firebase
//=========================
void sendToFirebase(Level& lv) {
  StaticJsonDocument<256> doc;
  doc["level_pct"]    = round(lv.pct * 10) / 10.0;
  doc["level_liters"] = round(lv.liters * 10) / 10.0;
  doc["capacity"]     = (int)TANK_CAPACITY_L;
  doc["distance"]     = round(lv.distCM * 10) / 10.0;
  doc["pump"]         = pumpState;
  doc["tank_full"]    = tankFull;

  String json;
  serializeJson(doc, json);

  bool ok = firebasePatch("/aquasmart/status", json);
  Serial.printf("%s Firebase → Level:%.1f%% (%.1fL) | Dist:%.1fcm | Pump:%s\n",
    ok ? "✅" : "⚠️", lv.pct, lv.liters, lv.distCM, pumpState ? "ON" : "OFF");
}

//=========================
// Check pump command from app
//=========================
void checkPumpCommand() {
  String cmd = firebaseGet("/aquasmart/pump/command");
  cmd.trim();

  if (cmd == "\"on\"") {
    setPump(true);
    firebasePatch("/aquasmart/pump", "{\"command\":null}");
  } else if (cmd == "\"off\"") {
    setPump(false);
    firebasePatch("/aquasmart/pump", "{\"command\":null}");
  }
}

//=========================
// SETUP
//=========================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n╔══════════════════════════════════╗");
  Serial.println("║  AquaSmart ESP32 v2.0            ║");
  Serial.println("║  HC-SR04 + Relay + Buzzer        ║");
  Serial.println("╚══════════════════════════════════╝");

  pinMode(TRIG_PIN,   OUTPUT);
  pinMode(ECHO_PIN,   INPUT);
  pinMode(RELAY_PIN,  OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW);
  setPump(false);   // Pump OFF on boot

  Serial.printf("📐 Tank: %.0fcm | %.0fL | Offset:%.0fcm | Cutoff:%.0f%%\n",
    TANK_HEIGHT_CM, TANK_CAPACITY_L, SENSOR_OFFSET_CM, FULL_THRESHOLD);

  if (connectWiFi()) {
    // Boot beep — 1 short beep = ready
    digitalWrite(BUZZER_PIN, HIGH); delay(200); digitalWrite(BUZZER_PIN, LOW);
  }

  Serial.println("✅ System Ready\n");
}

//=========================
// LOOP
//=========================
void loop() {
  handleBuzzer();

  // Reconnect WiFi if lost
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi lost — reconnecting...");
    connectWiFi();
    return;
  }

  // Decide update interval
  unsigned long interval = pumpState ? PUMP_ON_INTERVAL : PUMP_OFF_INTERVAL;

  if (millis() - lastUpdate >= interval) {
    lastUpdate = millis();

    // 1. Read sensor
    float dist  = readDistanceCM();
    Level level = calculateLevel(dist);

    if (!level.valid) {
      Serial.printf("⚠️ Sensor error (dist=%.1fcm) — check wiring\n", dist);
      return;
    }

    Serial.printf("\n📏 Dist:%.1fcm | Height:%.1fcm | Level:%.1f%% | %.1fL\n",
      level.distCM, level.heightCM, level.pct, level.liters);

    // 2. Auto pump cutoff when full
    if (level.pct >= FULL_THRESHOLD && pumpState) {
      Serial.println("🚨 TANK FULL — Auto cutting pump!");
      setPump(false);
      tankFull = true;
      startBuzzer();
      firebasePatch("/aquasmart/alerts", "{\"tank_full\":true}");
    }

    // 3. Reset full flag when drops 5% below threshold
    if (level.pct < (FULL_THRESHOLD - 5.0f) && tankFull) {
      tankFull = false;
      firebasePatch("/aquasmart/alerts", "{\"tank_full\":false}");
    }

    // 4. Send to Firebase
    sendToFirebase(level);

    // 5. Check for app commands
    checkPumpCommand();
  }

  delay(50);
}
