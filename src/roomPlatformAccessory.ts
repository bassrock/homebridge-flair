import { CharacteristicEventTypes } from 'homebridge';
import type { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback} from 'homebridge';

import { FlairPlatform } from './platform';
import {Puck, Vent} from "flair-api-ts/lib/client/models";
import Client from "flair-api-ts/lib/client";
import {Pressure, PressureSensor} from "./Pressure";
import {Room} from "flair-api-ts/lib/client/models/room";

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class FlairRoomPlatformAccessory {
    private accessoryInformationService: Service;
    private thermostatService: Service;

    private client: Client;
    private room: Room;


    constructor(
        private readonly platform: FlairPlatform,
        private readonly accessory: PlatformAccessory,
        client: Client
    ) {
        this.room = this.accessory.context.device;
        this.client = client;

        // set accessory information
        this.accessoryInformationService = this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Flair')
            .setCharacteristic(this.platform.Characteristic.Model, 'Room')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, this.room.id!);

        this.thermostatService = this.accessory.getService(this.platform.Service.Thermostat) ?? this.accessory.addService(this.platform.Service.Thermostat);
        this.thermostatService.setPrimaryService(true);
        this.thermostatService
            .setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name)
            .setCharacteristic(this.platform.Characteristic.CurrentTemperature, this.room.currentTemperatureC!)
            .setCharacteristic(this.platform.Characteristic.TargetTemperature, this.room.setPointC!)
            .setCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, this.platform.Characteristic.TargetHeatingCoolingState.AUTO)
            .setCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.platform.Characteristic.CurrentHeatingCoolingState.COOL)
            .setCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.room.currentHumidity!)

        setInterval(async () => {
            await this.getNewRoomReadings()
        }, platform.config.pollInterval * 1000);
        this.getNewRoomReadings();
    }


    async getNewRoomReadings(): Promise<Room> {
        let room = await this.client.getRoom(this.room)
        this.updateRoomReadingsFromRoom(room)
        return room;
    }

    updateRoomReadingsFromRoom(room: Room) {
        this.accessory.context.device = room;
        this.room = room;

        // push the new value to HomeKit
        this.thermostatService
            .updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.room.currentTemperatureC!)
            .updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.room.setPointC!)
            .updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, this.platform.Characteristic.TargetHeatingCoolingState.AUTO)
            .updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.platform.Characteristic.CurrentHeatingCoolingState.COOL)
            .updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.room.currentHumidity!)

        this.platform.log.debug(`Pushed updated current temperature state for ${this.room.name!} to HomeKit:`, this.room.currentTemperatureC!);
    }

}
