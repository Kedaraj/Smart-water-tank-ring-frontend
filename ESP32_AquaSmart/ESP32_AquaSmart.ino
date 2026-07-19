/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║   AquaSmart ESP32 Firmware v2.0 — Firebase Edition       ║
 * ║   SR04M-2 + Relay + Buzzer + Auto Pump Cutoff            ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * WIRING:
 * ─────────────────────────────────────────────────────────
 *  SR04M-2  VCC   → 5V (Vin)
 *  SR04M-2  GND   → GND
 *  SR04M-2  TRIG  → GPIO 5
 *  SR04M-2  ECHO  → [1kΩ]─GPIO 18─[2kΩ]─GND  (voltage divider!)
 *
 *  Relay    VCC   → 5V
 *  Relay    GND   → GND
 *  Relay    IN    → GPIO 26  (LOW = pump ON for active-low relay)
 *  Relay    COM   → Pump power supply Live
 *  Relay    NO    → Pump Live wire
 *
 *  Buzzer   +     → GPIO 27
 *  Buzzer   -     → GND
 *
 * LIBRARIES (Arduino Library Manager):
 *   ✅ ArduinoJson  (by Benoit Blanchon)
 *   ✅ WiFi, HTTPClient (built-in ESP32)
 *
 * LOGIC:
 *   • Pump OFF → measure every 30 seconds
 *   • Pump ON  → measure every 5 seconds (fast fill monitoring)
 *   • Tank >= FULL_THRESHOLD% → auto shutoff relay + buzzer alert
 *   • Firebase listens for pump commands from the app
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ═══════════════════════════════════════════════════════════
//  ⚙️  CONFIGURATION — Edit these values ONLY
// ═══════════════════════════════════════════════════════════

// WiFi
const char* WIFI_SSID     = "YourWiFiName";
const char* WIFI_PASSWORD = "YourWiFiPassword";

// Firebase Realtime Database
// Get from: Firebase Console → Project Settings → Your Apps
const char* FIREBASE_HOST   = "aquasmart-70-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* FIREBASE_SECRET = "AIzaSyAgloMGXGKaVQmg76crcuV4JN54e9TN4fw";  // Web API key

// Tank dimensions
const float TANK_HEIGHT_CM   = 150.0;   // cm — measure inside tank top to bottom
const float TANK_CAPACITY_L  = 1000.0;  // litres
const float SENSOR_OFFSET_CM = 10.0;    // cm gap from sensor face to full water level
const float FULL_THRESHOLD   = 95.0;    // % — above this = FULL, cut pump

// GPIO Pins
const int TRIG_PIN   = 5;
const int ECHO_PIN   = 18;
const int RELAY_PIN  = 26;   // LOW = pump ON (active-low relay)
const int BUZZER_PIN = 27;

// Update intervals
const unsigned long PUMP_ON_INTERVAL  = 5000;   // 5 sec when pump running
const unsigned long PUMP_OFF_INTERVAL = 30000;  // 30 sec when pump idle

// ═══════════════════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════════════════
bool  pumpState      = false;
bool  tankFull       = false;
unsigned long lastUpdate = 0;
unsigned long buzzerStart = 0;
int   buzzerBeeps    = 0;
bool  buzzerActive   = false;

// ═══════════════════════════════════════════════════════════
//  Buzzer — Non-blocking 3-beep pattern
// ═══════════════════════════════════════════════════════════
void startBuzzer() {
  buzzerBeeps  = 0;
  buzzerActive = true;
  buzzerStart  = millis();
  Serial.println("🔔 BUZZER — Tank Full Alert!");
}

void handleBuzzer() {
  if (!buzzerActive) return;

  unsigned long elapsed = millis() - buzzerStart;
  int cycle = elapsed / 400; // each beep cycle = 400ms
  int phase = elapsed % 400;

  if (cycle >= 6) {          // 3 beeps done (ON+OFF × 3)
    digitalWrite(BUZZER_PIN, LOW);
    buzzerActive = false;
    return;
  }

  // ON for first 200ms, OFF for next 200ms
  digitalWrite(BUZZER_PIN, (phase < 200) ? HIGH : LOW);
}

// ═══════════════════════════════════════════════════════════
//  Relay — Pump control
// ═══════════════════════════════════════════════════════════
void setPump(bool on) {
  pumpState = on;
  // Active-low relay: LOW = pump ON, HIGH = pump OFF
  digitalWrite(RELAY_PIN, on ? LOW : HIGH);
  Serial.printf("🔌 Pump → %s\n", on ? "ON" : "OFF");
}

// ═══════════════════════════════════════════════════════════
//  SR04M-2 — Read distance (median of 5)
// ═══════════════════════════════════════════════════════════
float readDistanceCM() {
  float readings[5];
  for (int i = 0; i < 5; i++) {
    digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(4);
    digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    long dur = pulseIn(ECHO_PIN, HIGH, 30000);
    readings[i] = (dur == 0) ? 999.0 : (dur * 0.0343f) / 2.0f;
    delay(30);
  }
  // Sort → median
  for (int i = 0; i < 4; i++)
    for (int j = i+1; j < 5; j++)
      if (readings[j] < readings[i]) { float t=readings[i]; readings[i]=readings[j]; readings[j]=t; }
  return readings[2];
}

// ═══════════════════════════════════════════════════════════
//  Calculate level from distance
// ═══════════════════════════════════════════════════════════
struct Level {
  float pct;
  float liters;
  float distCM;
  float heightCM;
  bool  valid;
};

Level calculateLevel(float dist) {
  Level L;
  L.distCM  = dist;
  L.valid   = (dist > 2.0 && dist < 400.0);
  if (!L.valid) { L.pct = 0; L.liters = 0; L.heightCM = 0; return L; }

  L.heightCM = constrain(TANK_HEIGHT_CM - (dist - SENSOR_OFFSET_CM), 0.0f, TANK_HEIGHT_CM);
  L.pct      = constrain((L.heightCM / TANK_HEIGHT_CM) * 100.0f, 0.0f, 100.0f);
  L.liters   = (L.pct / 100.0f) * TANK_CAPACITY_L;
  return L;
}

// ═══════════════════════════════════════════════════════════
//  WiFi
// ═══════════════════════════════════════════════════════════
bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  Serial.printf("📡 WiFi: %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500); Serial.print(".");
  }
  bool ok = WiFi.status() == WL_CONNECTED;
  Serial.println(ok ? "\n✅ WiFi OK" : "\n❌ WiFi FAIL");
  return ok;
}

// ═══════════════════════════════════════════════════════════
//  Firebase — PATCH data to Realtime Database
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
//  Firebase — GET value
// ═══════════════════════════════════════════════════════════
String firebaseGet(const char* path) {
  HTTPClient http;
  String url = String("https://") + FIREBASE_HOST + path + ".json?auth=" + FIREBASE_SECRET;
  http.begin(url);
  http.setTimeout(8000);
  int code = http.GET();
  String resp = (code == 200) ? http.getString() : "null";
  http.end();
  return resp;
}

// ═══════════════════════════════════════════════════════════
//  Send tank data to Firebase
// ═══════════════════════════════════════════════════════════
void sendToFirebase(Level& lv) {
  // Get current timestamp approximation
  unsigned long t = millis() / 1000;

  // Build tank JSON
  StaticJsonDocument<256> tank;
  tank["level_pct"]    = round(lv.pct * 10) / 10.0;
  tank["level_liters"] = (int)round(lv.liters);
  tank["capacity"]     = (int)TANK_CAPACITY_L;
  tank["dist_cm"]      = round(lv.distCM * 10) / 10.0;
  tank["updated_ms"]   = (unsigned long)millis();

  String tankJson;
  serializeJson(tank, tankJson);

  // Build pump JSON
  StaticJsonDocument<128> pump;
  pump["on"]       = pumpState;
  pump["mode"]     = "auto";
  pump["tank_full"]= tankFull;

  String pumpJson;
  serializeJson(pump, pumpJson);

  bool tankOk = firebasePatch("/aquasmart/tank", tankJson);
  bool pumpOk = firebasePatch("/aquasmart/pump", pumpJson);

  Serial.printf("%s Firebase → %s | Level:%.1f%% (%.0fL) | Pump:%s\n",
    (tankOk && pumpOk) ? "✅" : "⚠️",
    (tankOk && pumpOk) ? "OK" : "FAIL",
    lv.pct, lv.liters, pumpState ? "ON" : "OFF");
}

// ═══════════════════════════════════════════════════════════
//  Check Firebase for pump command from app
// ═══════════════════════════════════════════════════════════
void checkPumpCommand() {
  String val = firebaseGet("/aquasmart/pump/command");
  val.trim();
  if (val == "\"on\"" || val == "true") {
    if (!pumpState) {
      Serial.println("📱 App command: Pump ON");
      setPump(true);
      // Clear command
      firebasePatch("/aquasmart/pump", "{\"command\":null}");
    }
  } else if (val == "\"off\"" || val == "false") {
    if (pumpState) {
      Serial.println("📱 App command: Pump OFF");
      setPump(false);
      firebasePatch("/aquasmart/pump", "{\"command\":null}");
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n╔══════════════════════════════════════╗");
  Serial.println("║  AquaSmart v2.0 — Firebase + Relay   ║");
  Serial.println("╚══════════════════════════════════════╝\n");

  // Pins
  pinMode(TRIG_PIN,   OUTPUT);
  pinMode(ECHO_PIN,   INPUT);
  pinMode(RELAY_PIN,  OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // Safe defaults — pump OFF
  setPump(false);
  digitalWrite(BUZZER_PIN, LOW);

  Serial.printf("📐 Tank: %.0fcm tall, %.0fL capacity\n", TANK_HEIGHT_CM, TANK_CAPACITY_L);
  Serial.printf("🛑 Auto-cutoff at: %.0f%%\n\n", FULL_THRESHOLD);

  // Connect WiFi
  connectWiFi();

  // Boot beep
  digitalWrite(BUZZER_PIN, HIGH); delay(200); digitalWrite(BUZZER_PIN, LOW);
  Serial.println("✅ System ready!\n");
}

// ═══════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════
void loop() {
  // Handle buzzer (non-blocking)
  handleBuzzer();

  // Reconnect WiFi if needed
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    delay(1000);
    return;
  }

  // Decide update interval based on pump state
  unsigned long interval = pumpState ? PUMP_ON_INTERVAL : PUMP_OFF_INTERVAL;
  unsigned long now = millis();

  if (now - lastUpdate >= interval || lastUpdate == 0) {
    lastUpdate = now;

    // ─── 1. Read sensor ───────────────────────────────────
    float dist = readDistanceCM();
    Level lv   = calculateLevel(dist);

    if (!lv.valid) {
      Serial.printf("⚠️  Sensor error (dist=%.1fcm)\n", dist);
      return;
    }

    Serial.printf("\n📏 Dist: %.1fcm → Level: %.1f%% | %.0fL | Pump: %s\n",
      dist, lv.pct, lv.liters, pumpState ? "ON" : "OFF");

    // ─── 2. FULL CHECK — Auto cutoff ──────────────────────
    if (lv.pct >= FULL_THRESHOLD && pumpState) {
      Serial.println("🚨 TANK FULL — Auto-cutting pump!");
      setPump(false);
      tankFull = true;

      // Alert buzzer
      startBuzzer();

      // Write alert to Firebase
      firebasePatch("/aquasmart/alerts", "{\"tank_full\":true,\"buzzer\":true}");
    } else if (lv.pct < (FULL_THRESHOLD - 5.0f)) {
      // Reset full flag when drops 5% below threshold (hysteresis)
      if (tankFull) {
        tankFull = false;
        firebasePatch("/aquasmart/alerts", "{\"tank_full\":false,\"buzzer\":false}");
      }
    }

    // ─── 3. Send to Firebase ──────────────────────────────
    sendToFirebase(lv);

    // ─── 4. Check for commands from app ───────────────────
    checkPumpCommand();
  }

  delay(50);
}
