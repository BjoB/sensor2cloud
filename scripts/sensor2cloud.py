#!/usr/bin/env python3

import asyncio
import platform
import struct
import argparse

from bleak import BleakClient
from bleak import BleakScanner
from bleak import _logger as logger
from bleak.uuids import uuid16_dict

from datetime import datetime
from pymongo import MongoClient

# sensortag uuids

uuid16_dict = {v: k for k, v in uuid16_dict.items()}

SYSTEM_ID_UUID = "0000{0:x}-0000-1000-8000-00805f9b34fb".format(
    uuid16_dict.get("System ID")
)
MODEL_NBR_UUID = "0000{0:x}-0000-1000-8000-00805f9b34fb".format(
    uuid16_dict.get("Model Number String")
)
DEVICE_NAME_UUID = "0000{0:x}-0000-1000-8000-00805f9b34fb".format(
    uuid16_dict.get("Device Name")
)
FIRMWARE_REV_UUID = "0000{0:x}-0000-1000-8000-00805f9b34fb".format(
    uuid16_dict.get("Firmware Revision String")
)
HARDWARE_REV_UUID = "0000{0:x}-0000-1000-8000-00805f9b34fb".format(
    uuid16_dict.get("Hardware Revision String")
)
SOFTWARE_REV_UUID = "0000{0:x}-0000-1000-8000-00805f9b34fb".format(
    uuid16_dict.get("Software Revision String")
)
MANUFACTURER_NAME_UUID = "0000{0:x}-0000-1000-8000-00805f9b34fb".format(
    uuid16_dict.get("Manufacturer Name String")
)
BATTERY_LEVEL_UUID = "0000{0:x}-0000-1000-8000-00805f9b34fb".format(
    uuid16_dict.get("Battery Level")
)
KEY_PRESS_UUID = "0000{0:x}-0000-1000-8000-00805f9b34fb".format(0xFFE1)
IO_DATA_CHAR_UUID = "f000aa65-0451-4000-b000-000000000000"
IO_CONFIG_CHAR_UUID = "f000aa66-0451-4000-b000-000000000000"

TEMP_SERVICE_UUID = 'f000aa20-0451-4000-b000-000000000000'
TEMP_CHAR_UUID = 'f000aa21-0451-4000-b000-000000000000'
TEMP_CONFIG_CHAR_UUID = 'f000aa22-0451-4000-b000-000000000000'


async def sensortag_com_handler(address, debug=False):
    device = await BleakScanner.find_device_by_address(address)
    if not device:
        print("Could not find device with address {}".format(address))
        return

    async with BleakClient(address) as client:
        x = await client.is_connected()
        logger.info("Connected: {0}".format(x))

        system_id = await client.read_gatt_char(SYSTEM_ID_UUID)
        print(
            "System ID: {0}".format(
                ":".join(["{:02x}".format(x) for x in system_id[::-1]])
            )
        )

        model_number = await client.read_gatt_char(MODEL_NBR_UUID)
        print("Model Number: {0}".format("".join(map(chr, model_number))))

        try:
            device_name = await client.read_gatt_char(DEVICE_NAME_UUID)
            print("Device Name: {0}".format("".join(map(chr, device_name))))
        except Exception:
            pass

        manufacturer_name = await client.read_gatt_char(MANUFACTURER_NAME_UUID)
        print("Manufacturer Name: {0}".format(
            "".join(map(chr, manufacturer_name))))

        firmware_revision = await client.read_gatt_char(FIRMWARE_REV_UUID)
        print("Firmware Revision: {0}".format(
            "".join(map(chr, firmware_revision))))

        hardware_revision = await client.read_gatt_char(HARDWARE_REV_UUID)
        print("Hardware Revision: {0}".format(
            "".join(map(chr, hardware_revision))))

        software_revision = await client.read_gatt_char(SOFTWARE_REV_UUID)
        print("Software Revision: {0}".format(
            "".join(map(chr, software_revision))))

        battery_level = await client.read_gatt_char(BATTERY_LEVEL_UUID)
        print("Battery Level: {0}%".format(int(battery_level[0])))

        # activate temp/humid sensor
        write_value = bytearray([0x01])
        await client.write_gatt_char(TEMP_CONFIG_CHAR_UUID, write_value)

        # subscribe
        await client.start_notify(TEMP_CHAR_UUID, notification_handler)

        while True:
            await asyncio.sleep(1.0)


def notification_handler(sender, data):
    dt_now = datetime.now()
    temp, rel_hum = calc_temp_humidity(data)

    print("Temperature / Rel. Humidity: {} / {}".format(temp, rel_hum))

    global dt_last
    diff_to_last_post = dt_now - dt_last
    if diff_to_last_post.total_seconds() > sendinterval:
        print("Pushing last sensordata to database...")
        sensordata_entry = {"time": dt_now,
                            "temp": f'{temp:.1f}',
                            "rh": f'{rel_hum:.0f}'}
        collection.insert_one(sensordata_entry)
        dt_last = dt_now


def calc_temp_humidity(data):
    (raw_temo, raw_hum) = struct.unpack('<HH', data)
    temp = -46.85 + 175.72 * (raw_temo / 65536.0)
    rel_hum = -6.0 + 125.0 * ((raw_hum & 0xFFFC)/65536.0)
    return (temp, rel_hum)


if __name__ == "__main__":
    dt_last = datetime.now()

    parser = argparse.ArgumentParser()
    parser.add_argument("address", type=str,
                        help="sensortag address (format: xx:xx:xx:xx:xx:xx)")
    parser.add_argument(
        "mongodburi", help="mongodb uri for storage of results")
    parser.add_argument(
        "database", type=str, help="mongodb database for storage of results")
    parser.add_argument(
        "collection", type=str, help="mongodb collection for storage of results")
    parser.add_argument(
        "sendinterval", type=int, help="send interval to database [s]")
    args = parser.parse_args()

    client = MongoClient(args.mongodburi)
    collection = client[args.database][args.collection]
    sendinterval = args.sendinterval

    try:
        asyncio.run(sensortag_com_handler(args.address, True))
    except KeyboardInterrupt:
        print("Exiting ...")
