import requests
import os
import time

API_KEY = "AIzaSyAF5p3f_Jxqk_0OQjDYdKENTjqxmB0Mh1E" 
LAT = 13.1458939
LON = 100.9470975

def get_satellite_image(lat, lon, filename):
    url = "https://maps.googleapis.com/maps/api/staticmap"
    params = {
    "center": f"{lat},{lon}",
    "zoom": 21,
    "size": "640x640",
    "scale": 1,          
    "maptype": "satellite",
    "markers": f"color:red|label:X|{lat},{lon}",
    "key": API_KEY
}

    r = requests.get(url, params=params)
    if r.status_code == 200:
        with open(filename, "wb") as f:
            f.write(r.content)
        print(f"Saved to {filename}")
    else:
        print("Error", r.status_code)

if __name__ == "__main__":
    os.makedirs("image_set", exist_ok=True)
    get_satellite_image(LAT, LON, "image_set/satellite.jpg")

