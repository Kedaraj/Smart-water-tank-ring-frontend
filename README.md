# 🌊 Smart Water Tank Monitoring System

<div align="center">

![ESP32](https://img.shields.io/badge/ESP32-IoT-blue?style=for-the-badge\&logo=espressif)
![Arduino](https://img.shields.io/badge/Arduino-C++-00979D?style=for-the-badge\&logo=arduino)
![HTML](https://img.shields.io/badge/HTML5-Web-E34F26?style=for-the-badge\&logo=html5)
![CSS](https://img.shields.io/badge/CSS3-Styling-1572B6?style=for-the-badge\&logo=css3)
![JavaScript](https://img.shields.io/badge/JavaScript-Frontend-F7DF1E?style=for-the-badge\&logo=javascript)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

### 💧 Real-Time IoT Water Tank Monitoring using ESP32 & HC-SR04

Monitor your water tank level from anywhere using an ESP32, ultrasonic sensor, and a modern web dashboard.

</div>

---

## 📖 Overview

The **Smart Water Tank Monitoring System** is an IoT-based solution that continuously measures the water level inside a tank using an **HC-SR04 Ultrasonic Sensor** connected to an **ESP32**. The ESP32 transmits the measured data to a web server where users can monitor the tank level in real time from any device.

---

# ✨ Features

* 📡 Real-time water level monitoring
* 🌐 Wi-Fi enabled ESP32
* 📱 Responsive web dashboard
* 📊 Water level percentage display
* 💧 Tank fill animation
* 🚨 Low & Full level alerts
* ⚡ Fast sensor updates
* 🔄 Automatic data refresh
* 📈 Future-ready for history graphs
* ☁️ Cloud/server integration

---

# 🛠 Hardware Components

| Component                 |    Quantity |
| ------------------------- | ----------: |
| ESP32 Dev Board           |           1 |
| HC-SR04 Ultrasonic Sensor |           1 |
| Jumper Wires              | As Required |
| Breadboard                |           1 |
| 5V Power Supply           |           1 |
| Wi-Fi Network             |           1 |

---

# 🖥 Software Stack

* Arduino IDE
* ESP32 Board Package
* HTML5
* CSS3
* JavaScript
* REST API
* HTTP Communication

---

# ⚙ Hardware Connections

| HC-SR04 | ESP32                                                              |
| ------- | ------------------------------------------------------------------ |
| VCC     | 5V                                                                 |
| GND     | GND                                                                |
| TRIG    | GPIO18                                                             |
| ECHO    | GPIO19 *(Use a voltage divider or logic level shifter for safety)* |

---

# 🏗 System Architecture

```text
Water Tank
     │
     ▼
HC-SR04 Ultrasonic Sensor
     │
     ▼
ESP32
     │
 Wi-Fi Network
     │
     ▼
Cloud / Web Server
     │
     ▼
Web Dashboard
     │
     ▼
User (Mobile / Laptop)
```

---

# 🔄 Working Principle

1. ESP32 connects to Wi-Fi.
2. HC-SR04 measures the distance to the water surface.
3. ESP32 calculates the water level percentage.
4. Sensor data is sent to the web server.
5. Dashboard displays the latest tank status.
6. The process repeats continuously.

---

# 📂 Project Structure

```text
smart-water-tank-monitoring-system
│
├── firmware/
│   └── smart_water_tank.ino
│
├── web/
│   ├── index.html
│   ├── style.css
│   └── script.js
│
├── diagrams/
│   ├── wiring_diagram.png
│   ├── block_diagram.png
│   └── flowchart.png
│
├── images/
│
├── docs/
│
├── README.md
└── LICENSE
```

---

# 🚀 Installation

1. Clone this repository.
2. Open `smart_water_tank.ino` in Arduino IDE.
3. Install the required ESP32 libraries.
4. Update your Wi-Fi credentials.
5. Upload the firmware to the ESP32.
6. Start your web server.
7. Open the dashboard and monitor the tank level.

---

# 📊 Future Improvements

* Push notifications
* Pump automation
* Mobile application
* MQTT support
* Firebase integration
* Data logging
* Historical charts
* Multiple tank support

---

# 📸 Project Images

> Add screenshots in the `images/` folder.

* Hardware Setup
* Wiring Diagram
* Dashboard
* Testing
* Final Prototype

---

# 🤝 Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a new feature branch.
3. Commit your changes.
4. Open a Pull Request.

---

# 📜 License

This project is licensed under the **MIT License**.

---

# 👨‍💻 Author

**KDJ**

**Techraft Studio**

Building innovative IoT, Embedded Systems, AI, and Robotics projects.

---

<div align="center">

⭐ If you found this project useful, consider giving it a **Star** on GitHub!

</div>
