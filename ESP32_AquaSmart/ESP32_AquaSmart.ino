/**
 * AquaSmart ESP32 Firmware
 * Sensor: SR04M-2 (Waterproof Ultrasonic)
 * Sends water level data to AquaSmart backend via WiFi + HTTP
 *
 * Wiring:
 *   SR04M-2 VCC  → 5V (Vin)
 *   SR04M-2 GND  → GND
 *   SR04M-2 TRIG → GPIO 5
 *   SR04M-2 ECHO → voltage divider → GPIO 18
 *                  (ECHO → 1kΩ → GPIO18 → 2kΩ → GND)
 *
 * Libraries needed (install via Arduino Library Manager):
 *   - ArduinoJson  (by Benoit Blanchon)
 *   - HTTPClient   (built-in ESP32)
 *   - WiFi         (built-in ESP32)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ═══════════════════════════════════════════════════════════
//  ⚙️  CONFIGURATION — Edit these values
// ═══════════════════════════════════════════════════════════

// WiFi credentials
const char* WIFI_SSID     = "YourWiFiName";        // ← change this
const char* WIFI_PASSWORD = "YourWiFiPassword";    // ← change this

// AquaSmart Backend URL (your Render URL)
const char* BACKEND_URL   = "https://aqua-smart-api-z4e3.onrender.com";

// Login credentials (must match backend)
const char* LOGIN_EMAIL   = "admin@aquasmart.com";
const char* LOGIN_PASS    = "aqua@1234";

// Tank physical dimensions
const float TANK_HEIGHT_CM  = 150.0;  // ← Total height of tank in cm
const float TANK_CAPACITY_L = 1000.0; // ← Total capacity in litres

// Sensor mounting offset
// Distance from sensor face to water surface when tank is FULL
const float SENSOR_OFFSET_CM = 10.0;  // ← gap from sensor to top of water at full

// GPIO Pins
const int TRIG_PIN = 5;
const int ECHO_PIN = 18;

// How often to send data (milliseconds)
const unsigned long SEND_INTERVAL = 30000; // 30 seconds

// ═══════════════════════════════════════════════════════════
//  Internal state (do not edit)
// ═══════════════════════════════════════════════════════════
String jwtToken      = "";
unsigned long lastSendTime = 0;
int   failCount      = 0;
const int MAX_FAILS  = 5;  // Re-login after this many failures

// ═══════════════════════════════════════════════════════════
//  SR04M-2 — Read distance
// ═══════════════════════════════════════════════════════════
float readDistanceCM() {
  // Take 5 readings and return the median (filters noise)
  float readings[5];
  for (int i = 0; i < 5; i++) {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(4);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout
    readings[i] = (duration == 0) ? 999.0 : (duration * 0.0343) / 2.0;
    delay(50);
  }

  // Sort and return median
  for (int i = 0; i < 4; i++)
    for (int j = i+1; j < 5; j++)
      if (readings[j] < readings[i]) { float t = readings[i]; readings[i] = readings[j]; readings[j] = t; }

  return readings[2]; // middle value
}

// ═══════════════════════════════════════════════════════════
//  Calculate water level from distance
// ═══════════════════════════════════════════════════════════
struct TankReading {
  float distanceCM;
  float waterHeightCM;
  float levelPct;
  float levelLiters;
  bool  valid;
};

TankReading calculateLevel(float distCM) {
  TankReading r;
  r.distanceCM = distCM;

  // Sensor error or out of range
  if (distCM <= 0 || distCM >= 400) {
    r.valid = false;
    return r;
  }

  // Water height = tank height - (distance - sensor offset)
  float effectiveDist = distCM - SENSOR_OFFSET_CM;
  r.waterHeightCM = TANK_HEIGHT_CM - effectiveDist;

  // Clamp to valid range
  r.waterHeightCM = constrain(r.waterHeightCM, 0.0, TANK_HEIGHT_CM);

  r.levelPct    = (r.waterHeightCM / TANK_HEIGHT_CM) * 100.0;
  r.levelPct    = constrain(r.levelPct, 0.0, 100.0);
  r.levelLiters = (r.levelPct / 100.0) * TANK_CAPACITY_L;
  r.valid       = true;
  return r;
}

// ═══════════════════════════════════════════════════════════
//  WiFi — Connect with retry
// ═══════════════════════════════════════════════════════════
bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  Serial.printf("\n📡 Connecting to WiFi: %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n✅ WiFi connected! IP: %s\n", WiFi.localIP().toString().c_str());
    return true;
  }
  Serial.println("\n❌ WiFi connection failed!");
  return false;
}

// ═══════════════════════════════════════════════════════════
//  Backend — Login and get JWT token
// ═══════════════════════════════════════════════════════════
bool loginToBackend() {
  Serial.println("🔐 Logging into AquaSmart backend...");

  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/auth/login";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

  // Build JSON body
  StaticJsonDocument<128> body;
  body["email"]    = LOGIN_EMAIL;
  body["password"] = LOGIN_PASS;
  String bodyStr;
  serializeJson(body, bodyStr);

  int code = http.POST(bodyStr);
  if (code == 200) {
    String resp = http.getString();
    StaticJsonDocument<512> doc;
    deserializeJson(doc, resp);
    if (doc["ok"].as<bool>()) {
      jwtToken = doc["token"].as<String>();
      Serial.printf("✅ Logged in as %s\n", doc["user"]["name"].as<const char*>());
      http.end();
      return true;
    }
  }

  Serial.printf("❌ Login failed! HTTP %d\n", code);
  http.end();
  return false;
}

// ═══════════════════════════════════════════════════════════
//  Backend — Send tank status
// ═══════════════════════════════════════════════════════════
bool sendTankStatus(TankReading& r) {
  if (jwtToken.length() == 0) return false;

  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/tank/status";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + jwtToken);
  http.setTimeout(10000);

  // Build payload
  StaticJsonDocument<128> body;
  body["level_pct"]    = round(r.levelPct * 10) / 10.0;   // 1 decimal
  body["level_liters"] = round(r.levelLiters);
  body["capacity"]     = (int)TANK_CAPACITY_L;

  String bodyStr;
  serializeJson(body, bodyStr);

  int code = http.PATCH(bodyStr);

  if (code == 200) {
    Serial.printf("✅ Sent → Level: %.1f%% (%.0fL of %.0fL) | Dist: %.1fcm\n",
      r.levelPct, r.levelLiters, TANK_CAPACITY_L, r.distanceCM);
    http.end();
    failCount = 0;
    return true;
  }

  if (code == 401) {
    Serial.println("⚠️  Token expired — will re-login");
    jwtToken = "";
  }

  Serial.printf("❌ Send failed! HTTP %d\n", code);
  http.end();
  failCount++;
  return false;
}

// ═══════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n");
  Serial.println("╔══════════════════════════════════════╗");
  Serial.println("║   AquaSmart ESP32 Firmware v1.0      ║");
  Serial.println("║   SR04M-2 Ultrasonic Water Level     ║");
  Serial.println("╚══════════════════════════════════════╝");

  // Setup sensor pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  // Print config
  Serial.printf("\n📐 Tank height   : %.0f cm\n", TANK_HEIGHT_CM);
  Serial.printf("💧 Tank capacity : %.0f L\n", TANK_CAPACITY_L);
  Serial.printf("📏 Sensor offset : %.1f cm\n", SENSOR_OFFSET_CM);
  Serial.printf("⏱️  Send interval : %lu sec\n\n", SEND_INTERVAL / 1000);

  // Connect WiFi
  if (!connectWiFi()) {
    Serial.println("❌ No WiFi — retrying in loop...");
    return;
  }

  // Login
  loginToBackend();
}

// ═══════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // Check WiFi every loop
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️  WiFi lost — reconnecting...");
    connectWiFi();
    return;
  }

  // Re-login if token missing or too many failures
  if (jwtToken.length() == 0 || failCount >= MAX_FAILS) {
    failCount = 0;
    loginToBackend();
    delay(2000);
    return;
  }

  // Check if it's time to send
  if (now - lastSendTime >= SEND_INTERVAL || lastSendTime == 0) {
    lastSendTime = now;

    // Read sensor
    float dist = readDistanceCM();
    Serial.printf("\n📡 Raw distance: %.2f cm\n", dist);

    TankReading reading = calculateLevel(dist);

    if (!reading.valid) {
      Serial.println("⚠️  Invalid reading — sensor error or out of range");
    } else {
      // Print to serial monitor
      Serial.printf("💧 Water height : %.1f cm\n", reading.waterHeightCM);
      Serial.printf("📊 Level        : %.1f%%\n",  reading.levelPct);
      Serial.printf("🪣  Volume       : %.0f L\n",  reading.levelLiters);

      // Send to backend
      sendTankStatus(reading);
    }
  }

  delay(100); // small delay to prevent WDT reset
}
