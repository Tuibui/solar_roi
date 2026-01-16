import json
import requests
import paho.mqtt.client as mqtt

BROKER = "localhost"
PORT = 1883

REQ_TOPIC = "solar/request/location"
RES_TOPIC = "solar/response/location"


def detect_location():
    r = requests.get("https://ipinfo.io/json", timeout=5)
    data = r.json()
    lat, lon = map(float, data["loc"].split(","))
    return lat, lon


def on_message(client, userdata, msg):
    if msg.topic == REQ_TOPIC:
        lat, lon = detect_location()
        payload = json.dumps({
            "lat": lat,
            "lon": lon
        })
        client.publish(RES_TOPIC, payload)
        print("📍 Sent location:", payload)


client = mqtt.Client()
client.on_message = on_message

client.connect(BROKER, PORT)
client.subscribe(REQ_TOPIC)

print("✅ Python MQTT node running...")
client.loop_forever()

