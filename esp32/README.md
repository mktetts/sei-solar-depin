# ESP32 Solar Charging Station Controller

This folder contains the MicroPython firmware for ESP32-based solar charging station hardware that provides real-time power monitoring, battery management, and HTTP API endpoints for remote control.

## Hardware Overview

The ESP32 controller manages a solar charging station with the following components:
- **Solar Panel**: Captures renewable energy 
- **Battery Storage**: 2000mAh lithium battery with voltage monitoring
- **Current Sensor**: ACS712 for real-time current measurement
- **Load Control**: PWM-controlled LED (representing EV charging load)
- **Network Interface**: WiFi connectivity for blockchain integration

## Circuit Diagram

See [`connection-diagram.png`](connection-diagram.png) for complete wiring schematic showing:
- ESP32 pin assignments
- ADC connections for sensors
- PWM output for load control
- Power distribution and safety circuits

## Pin Configuration

| Component | ESP32 Pin | Purpose |
|-----------|-----------|---------|
| LED/Load Control | GPIO 23 | PWM output (1kHz) |
| Current Sensor | GPIO 34 (ADC) | ACS712 analog input |
| Battery Voltage | GPIO 32 (ADC) | Voltage divider input |

## Key Features

### 1. Real-time Power Monitoring
- **Current Measurement**: Uses ACS712 sensor with 185mV/A sensitivity
- **Battery Voltage**: Monitors via voltage divider circuit
- **Power Calculation**: Real-time watts = current × voltage
- **Energy Tracking**: Accumulates Wh delivery over time

### 2. Adaptive Power Control
- **PWM Regulation**: Adjusts duty cycle (0-1023) for precise power control
- **Feedback Loop**: Continuously adjusts output to match target wattage
- **Auto-shutoff**: Stops when target energy (Wh) is delivered

### 3. Battery Management
- **Capacity Monitoring**: Calculates available Wh based on voltage
- **Safety Limits**: Prevents over-discharge by checking capacity vs demand
- **Real-time Status**: Provides voltage, capacity, and percentage via API

## HTTP API Endpoints

### `/battery` - Battery Status
**Method**: GET  
**Response**: JSON with current battery state
```json
{
  "voltage": 3.85,
  "capacity_Wh": 7.70,
  "percentage": 91.7
}
```

### `/toggle/<energy>/<power_w>` - Start Charging
**Method**: GET  
**Parameters**:
- `energy`: Target energy delivery in Wh (e.g., 0.5)
- `power_w`: Target power output in watts (e.g., 0.25)

**Example**: `GET /toggle/0.5/0.25`
- Delivers 0.5 Wh at 0.25 watts
- Automatically stops when target reached
- Returns error if insufficient battery capacity

### `/stop` - Emergency Stop
**Method**: GET  
**Response**: JSON with delivery summary
```json
{
  "status": "stopped",
  "delivered_Wh": 0.3247,
  "duration_s": 4682.5
}
```

### `/estimate/<energy>/<power_w>` - Time Estimation
**Method**: GET  
**Returns**: Estimated delivery time for given energy/power
**Example**: `GET /estimate/1.0/0.5` → "Estimated time: 120 min 0 sec"

## Core Algorithm

### Power Regulation Loop
The system implements a continuous feedback control system:

1. **Sampling**: Reads current sensor every 50ms
2. **Calculation**: Converts ADC to actual current/power
3. **Error Detection**: Compares actual vs target power
4. **PWM Adjustment**: Modifies duty cycle to correct error
5. **Energy Accumulation**: Tracks total Wh delivered
6. **Auto-stop**: Halts when target energy reached

```python
# Core control loop (simplified)
while sampling:
    current_a = read_current_sensor()
    actual_power = current_a * voltage
    error = target_watt - actual_power
    
    # Adjust PWM duty cycle
    adjustment = int(error / target_watt * 50)
    current_duty += adjustment
    led_module.duty(current_duty)
    
    # Check if target energy delivered
    if total_Wh >= target_Wh:
        stop_charging()
```

### Battery Voltage Calculation
```python
# Voltage divider: R1=R2 (2:1 ratio)
raw_adc = battery_adc.read()  # 0-4095
voltage = (raw_adc / 4095.0) * 3.3 * 2

# Capacity estimation (simplified Li-ion)
capacity_wh = (battery_capacity_mAh / 1000.0) * voltage
percentage = min(100, (voltage / 4.2) * 100)
```

## Installation & Setup

### 1. Hardware Assembly
- Wire components according to [`connection-diagram.png`](connection-diagram.png)
- Ensure proper ADC voltage dividers for battery monitoring
- Connect current sensor in series with load circuit

### 2. Firmware Installation
```bash
# Install MicroPython on ESP32
esptool.py --chip esp32 erase_flash
esptool.py --chip esp32 write_flash -z 0x1000 micropython.bin

# Upload firmware files
ampy --port /dev/ttyUSB0 put solar_charging.py
```

### 3. Dependencies
Install required MicroPython libraries:
- `microdot` - Lightweight HTTP server
- `ujson` - JSON encoding/decoding
- Built-in: `machine`, `time`, `_thread`

### 4. Network Configuration
Configure WiFi connection in boot.py:
```python
import network, utime

# Replace the following with your WIFI Credentials
SSID = "yous ssid"
SSI_PASSWORD = "your password"

def do_connect():
    import network
    sta_if = network.WLAN(network.STA_IF)
    if not sta_if.isconnected():
        print('connecting to network...')
        sta_if.active(True)
        sta_if.connect(SSID, SSI_PASSWORD)
        while not sta_if.isconnected():
            pass
    print('Connected! Network config:', sta_if.ifconfig())
    
print("Connecting to your wifi...")
do_connect()

```

## Integration with Blockchain

This ESP32 controller integrates with the SEI Solar DePIN network:

1. **MCP Server**: Communicates via HTTP API calls
2. **Smart Contracts**: Blockchain records all charging sessions
3. **Real-time Sync**: Device state matches blockchain bookings
4. **Payment Processing**: Energy delivery triggers automatic payments

## Safety Features

- **Over-current Protection**: PWM limits prevent hardware damage  
- **Battery Protection**: Checks available capacity before starting
- **Emergency Stop**: Immediate shutdown via `/stop` endpoint
- **Continuous Monitoring**: Real-time sensor feedback prevents overload

## Troubleshooting

### Common Issues

**Device not responding**:
- Check WiFi connection and IP address
- Verify power supply (5V recommended)
- Reset ESP32 if needed

**Inaccurate power readings**:
- Calibrate current sensor offset (should read ~1.65V at 0A)
- Check ADC reference voltage (3.3V)
- Verify sensor placement and connections

**Battery readings incorrect**:
- Confirm voltage divider ratios (R1=R2 for 2:1)
- Check battery connection and charge level
- Calibrate against known voltage reference

### Debug Output
Enable serial monitoring to see real-time power calculations:
```
Total Wh so far: 0.1247
Target 0.5 Wh reached, LED OFF after 1847.2s
```

## Technical Specifications

- **Input Voltage**: 3.3V - 5V DC
- **Power Output**: 0.001W - 3W (PWM controlled)
- **Current Range**: 0 - 30A (ACS712 dependent)
- **Accuracy**: ±2% current, ±1% voltage
- **Response Time**: 50ms control loop
- **Network**: 802.11 b/g/n WiFi
- **API Latency**: <100ms typical

This ESP32 controller forms the critical hardware layer of the SEI Solar DePIN network, providing precise power control and real-time monitoring essential for decentralized energy trading.