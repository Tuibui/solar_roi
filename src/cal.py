import requests
import pandas as pd
from pvlib.location import Location
import pvlib
import os
import matplotlib.pyplot as plt

#detecting latitude_longtitude_timezone
def detect_location_and_timezone():
    try:
        r = requests.get("https://ipinfo.io/json")
        data = r.json()
        lat, lon = map(float, data["loc"].split(","))
        timezone = data.get("timezone", "UTC") 
        return lat, lon, timezone
    except Exception as e:
        print(f"error: {e}")
        return None, None, None

lat, lon, detected_timezone = detect_location_and_timezone()

# request for DNI,DHI,GHI,temp,pressure
PARAMS = "ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DNI,ALLSKY_SFC_SW_DIFF,T2M,PS"
START_DATE = "20240101"
END_DATE = "20241231"
url = (
    "https://power.larc.nasa.gov/api/temporal/hourly/point"
    f"?start={START_DATE}&end={END_DATE}"
    f"&latitude={lat}&longitude={lon}"
    f"&community=RE"
    f"&parameters={PARAMS}"
    "&format=JSON"
)
response = requests.get(url)
data = response.json()
hourly_data = data['properties']['parameter']
ghi = hourly_data['ALLSKY_SFC_SW_DWN']
dni = hourly_data['ALLSKY_SFC_SW_DNI']
dhi = hourly_data['ALLSKY_SFC_SW_DIFF']
temp_air = hourly_data['T2M']  #degc
pressure_kpa = hourly_data['PS'] # kPa

df = pd.DataFrame({
    'GHI': list(ghi.values()),
    'DNI': list(dni.values()),
    'DHI': list(dhi.values()),
    'temp_air': list(temp_air.values()),
    'pressure_kpa': list(pressure_kpa.values())
})
df['pressure_pa'] = df['pressure_kpa'] * 1000

#Timestamp_setup_for_locally
timestamps = pd.to_datetime(list(ghi.keys()), format='%Y%m%d%H')
df.index = timestamps
df.index = df.index.tz_localize(detected_timezone)


#Solar_position
solpos = pvlib.solarposition.get_solarposition(
    time=df.index,
    latitude=lat,
    longitude=lon,
    altitude=0,  
    temperature=df['temp_air'],  
    pressure=df['pressure_pa']    
)

df['solar_zenith'] = solpos['apparent_zenith']
df['solar_azimuth'] = solpos['azimuth']

#Relative_airmass
df['relative_airmass'] = pvlib.atmosphere.get_relative_airmass(
    zenith=df['solar_zenith'], 
    model='kastenyoung1989'
)

#extra_DNI 
df['dni_extra'] = pvlib.irradiance.get_extra_radiation(df.index)


#Irradiance(using perez model)

poa_data = pvlib.irradiance.get_total_irradiance(
    surface_tilt=15,
    surface_azimuth=180,
    dni=df['DNI'],
    ghi=df['GHI'],
    dhi=df['DHI'],
    solar_zenith=df['solar_zenith'],
    solar_azimuth=df['solar_azimuth'],
    model='perez', 
    airmass=df['relative_airmass'],
    dni_extra=df['dni_extra']  
)

df['irradiance'] = poa_data['poa_global']
df = df.fillna(0.0) #fix NAN value

#Vizuallize

monthly_totals_perday = df['irradiance'].resample('ME').sum() / 30000
monthly_totals= df['irradiance'].resample('ME').sum() / 1000
for date, energy in monthly_totals_perday.items():
    month_name = date.strftime('%B')  # e.g., "January"
    print(f"{month_name}: {energy:.2f} kWh/m²/day")

annual=monthly_totals_perday.mean()
print(f"\nannual: {annual:,.2f} kWh/m²/day")







