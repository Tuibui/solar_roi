import requests
import pandas as pd
import os

print("--- RECREATING THE 'NIGHT SUN' PROBLEM ---")
print("Simulating server location: London, UK")

# 1. FORCE LONDON COORDINATES (The "UTC Area")
# London is approx Lat 51.5, Lon -0.1
# Solar Noon here is ~12:00 UTC.
lat_london = 51.507
lon_london = -0.127
target_tz  = 'Asia/Bangkok'

# 2. FETCH DATA FOR LONDON
url = (
    "https://power.larc.nasa.gov/api/temporal/hourly/point"
    "?start=20230101&end=20230101"  # Just 1 day to be fast
    f"&latitude={lat_london}&longitude={lon_london}"
    "&community=RE&parameters=ALLSKY_SFC_SW_DNI"
    "&format=JSON"
)

response = requests.get(url)
data = response.json()
dni_data = data['properties']['parameter']['ALLSKY_SFC_SW_DNI']

# 3. APPLY THE TIMEZONE (UTC -> Bangkok)
# London noon (12:00 UTC) becomes 19:00 Bangkok time.
df = pd.DataFrame({'DNI': list(dni_data.values())})
df.index = pd.to_datetime(list(dni_data.keys()), format='%Y%m%d%H')
df.index = df.index.tz_localize('UTC')

print("\n--- RESULT: LONDON DATA DISPLAYED IN BANGKOK TIME ---")
print(df['DNI'].between_time('6:00', '18:00'))
