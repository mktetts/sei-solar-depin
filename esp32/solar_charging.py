from microdot import Microdot, Response
from machine import Pin, PWM, ADC
import time
import ujson as json
import _thread

app = Microdot()
led_pin = 23
led_module = PWM(Pin(led_pin), freq=1000, duty=0)

current_sensor_adc = ADC(Pin(34))
current_sensor_adc.atten(ADC.ATTN_11DB)

battery_adc = ADC(Pin(32))
battery_adc.atten(ADC.ATTN_11DB)

battery_capacity_mAh = 2000  # example, adjust to your battery
led_voltage = 3.3

sampling = False
samples = []
start_time = 0
target_Wh = 0
target_watt = 0
current_duty = 0
total_Wh = 0.0
duration_s = 0.0

def read_battery_voltage():
    raw = battery_adc.read()
    v = (raw / 4095.0) * 3.3 * 2  # *2 because of voltage divider
    return v

@app.route('/battery')
def battery_info(request):
    v_bat = read_battery_voltage()
    capacity_wh = (battery_capacity_mAh / 1000.0) * v_bat
    percentage = min(100, (v_bat / 4.2) * 100)
    return Response(body=json.dumps({
        "voltage": round(v_bat, 2),
        "capacity_Wh": round(capacity_wh, 2),
        "percentage": round(percentage, 1)
    }), headers={"Content-Type": "application/json"})

@app.route('/toggle/<energy>/<power_w>')
def toggle_with_target_watt(request, energy, power_w):
    global sampling, samples, start_time, target_Wh, target_watt, current_duty, total_Wh, duration_s
    try:
        target_Wh = float(energy)
        target_watt = float(power_w)
    except:
        return "Invalid energy or power"

    v_bat = read_battery_voltage()
    cap_wh = (battery_capacity_mAh / 1000.0) * v_bat

    if cap_wh < target_Wh:
        return f"Not enough battery capacity. Battery has {cap_wh:.2f} Wh, requested {target_Wh:.2f} Wh"

    if led_module.duty() == 0:
        samples = []
        total_Wh = 0.0
        duration_s = 0.0
        start_time = time.ticks_ms()
        sampling = True
        current_duty = int((target_watt / 3.0) * 1023)
        current_duty = max(0, min(1023, current_duty))
        led_module.duty(current_duty)
        return f"LED ON, target {target_Wh} Wh, target {target_watt} W"
    else:
        return "LED already ON"

@app.route('/stop')
def stop_led(request):
    global sampling, current_duty, total_Wh, duration_s
    if led_module.duty() != 0:
        led_module.duty(0)
        sampling = False
        current_duty = 0
        delivered = total_Wh
        dur = duration_s
        total_Wh = 0.0
        duration_s = 0.0
        print(f"delivered watt : {delivered}")
        return Response(body=json.dumps({
            "status": "stopped",
            "delivered_Wh": round(delivered, 4),
            "duration_s": round(dur, 2)
        }), headers={"Content-Type": "application/json"})
    else:
        return Response(body=json.dumps({
            "status": "already_off"
        }), headers={"Content-Type": "application/json"})

@app.route('/estimate/<energy>/<power_w>')
def estimate_time(request, energy, power_w):
    try:
        energy_wh = float(energy)
        power_watt = float(power_w)
        if power_watt <= 0 or power_watt > 1:
            return "Power must be between 0 and 1"
    except:
        return "Invalid energy or power"

    time_s = (energy_wh / power_watt) * 3600
    minutes = int(time_s // 60)
    seconds = int(time_s % 60)
    return f"Estimated time: {minutes} min {seconds} sec"

def sample_loop():
    global sampling, samples, start_time, target_Wh, target_watt, current_duty, total_Wh, duration_s
    while True:
        if sampling:
            adc_raw = current_sensor_adc.read()
            samples.append(adc_raw)
            end_time = time.ticks_ms()
            duration_s = (end_time - start_time) / 1000.0

            avg_adc = sum(samples) / len(samples)
            voltage_sensor = avg_adc * (3.3 / 4095)
            diff = voltage_sensor - 1.65
            current_a = abs(diff / 0.185)

            current_a_scaled = current_a * (current_duty / 1023)
            power_w = current_a_scaled * led_voltage
            total_Wh = power_w * (duration_s / 3600.0)
            print(f"Total Wh so far: {total_Wh}")
            error = target_watt - power_w
            adjustment = int(error / target_watt * 50) if target_watt != 0 else 0
            current_duty += adjustment
            current_duty = max(0, min(1023, current_duty))
            led_module.duty(current_duty)

            if total_Wh >= target_Wh and led_module.duty() != 0:
                led_module.duty(0)
                sampling = False
                print(f"Target {target_Wh} Wh reached, LED OFF after {duration_s:.2f}s")
        time.sleep(0.05)

if __name__ == '__main__':
    _thread.start_new_thread(sample_loop, ())
    app.run(debug=True)

