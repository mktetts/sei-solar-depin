from fastapi import FastAPI
from fastapi.responses import JSONResponse
import uvicorn
import time
import threading
import random

app = FastAPI()

led_state = {"duty": 0}
battery_capacity_mAh = 2000
led_voltage = 3.3

sampling = False
samples = []
start_time = 0
target_Wh = 0
target_watt = 0
current_duty = 0
total_Wh = 0.0
duration_s = 0.0

def mock_adc_read():
    return random.randint(1800, 2200)

def read_battery_voltage():
    raw = random.randint(3000, 4095)
    v = (raw / 4095.0) * 3.3 * 2
    return v

@app.get("/battery")
def battery_info():
    v_bat = read_battery_voltage()
    capacity_wh = (battery_capacity_mAh / 1000.0) * v_bat
    percentage = min(100, (v_bat / 4.2) * 100)
    return JSONResponse({
        "voltage": round(v_bat, 2),
        "capacity_Wh": round(capacity_wh, 2),
        "percentage": round(percentage, 1)
    })

@app.get("/toggle/{energy}/{power_w}")
def toggle_with_target_watt(energy: float, power_w: float):
    global sampling, samples, start_time, target_Wh, target_watt, current_duty, total_Wh, duration_s
    target_Wh = energy
    target_watt = power_w
    v_bat = read_battery_voltage()
    cap_wh = (battery_capacity_mAh / 1000.0) * v_bat
    if cap_wh < target_Wh:
        return f"Not enough battery capacity. Battery has {cap_wh:.2f} Wh, requested {target_Wh:.2f} Wh"
    if led_state["duty"] == 0:
        samples = []
        total_Wh = 0.0
        duration_s = 0.0
        start_time = time.time()
        sampling = True
        current_duty = int((target_watt / 3.0) * 1023)
        current_duty = max(0, min(1023, current_duty))
        led_state["duty"] = current_duty
        return f"LED ON, target {target_Wh} Wh, target {target_watt} W"
    else:
        return "LED already ON"

@app.get("/stop")
def stop_led():
    global sampling, current_duty, total_Wh, duration_s
    if led_state["duty"] != 0:
        led_state["duty"] = 0
        sampling = False
        current_duty = 0
        delivered = total_Wh
        dur = duration_s
        total_Wh = 0.0
        duration_s = 0.0
        return JSONResponse({
            "status": "stopped",
            "delivered_Wh": round(delivered, 4),
            "duration_s": round(dur, 2)
        })
    else:
        return JSONResponse({"status": "already_off"})

@app.get("/estimate/{energy}/{power_w}")
def estimate_time(energy: float, power_w: float):
    if power_w <= 0 or power_w > 1:
        return "Power must be between 0 and 1"
    time_s = (energy / power_w) * 3600
    minutes = int(time_s // 60)
    seconds = int(time_s % 60)
    return f"Estimated time: {minutes} min {seconds} sec"

def sample_loop():
    global sampling, samples, start_time, target_Wh, target_watt, current_duty, total_Wh, duration_s
    while True:
        if sampling:
            adc_raw = mock_adc_read()
            samples.append(adc_raw)
            end_time = time.time()
            duration_s = end_time - start_time
            avg_adc = sum(samples) / len(samples)
            voltage_sensor = avg_adc * (3.3 / 4095)
            diff = voltage_sensor - 1.65
            current_a = abs(diff / 0.185)
            current_a_scaled = current_a * (current_duty / 1023)
            power_w = current_a_scaled * led_voltage
            total_Wh = power_w * (duration_s / 3600.0)
            error = target_watt - power_w
            adjustment = int(error / target_watt * 50) if target_watt != 0 else 0
            current_duty += adjustment
            current_duty = max(0, min(1023, current_duty))
            led_state["duty"] = current_duty
            if total_Wh >= target_Wh and led_state["duty"] != 0:
                led_state["duty"] = 0
                sampling = False
        time.sleep(0.05)

threading.Thread(target=sample_loop, daemon=True).start()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
