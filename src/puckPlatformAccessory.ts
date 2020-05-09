import { CharacteristicEventTypes } from 'homebridge';
import type { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback} from 'homebridge';

import { FlairPlatform } from './platform';
import {Puck, Vent} from "flair-api-ts/lib/client/models";
import Client from "flair-api-ts/lib/client";
import {Pressure, PressureSensor} from "./Pressure";

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class FlairPuckPlatformAccessory {
    private temperatureService: Service;
    private humidityService: Service;
    private accessoryInformationService: Service;
    private pressureService: Service;

    private client: Client;
    private puck: Puck;


    constructor(
        private readonly platform: FlairPlatform,
        private readonly accessory: PlatformAccessory,
        client: Client
    ) {
        this.puck = this.accessory.context.device;
        this.client = client;

        // set accessory information
        this.accessoryInformationService = this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Flair')
            .setCharacteristic(this.platform.Characteristic.Model, 'Puck')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, this.puck.displayNumber);

        // you can create multiple services for each accessory
        this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) ?? this.accessory.addService(this.platform.Service.TemperatureSensor);
        this.temperatureService.setPrimaryService(true);
        this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
        this.temperatureService.setCharacteristic(this.platform.Characteristic.CurrentTemperature, this.puck.currentTemperatureC)

        this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) ?? this.accessory.addService(this.platform.Service.HumiditySensor);
        this.humidityService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
        this.humidityService.setCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.puck.currentHumidity)
        this.temperatureService.addLinkedService(this.humidityService);

        //Add our custom pressure sensor
        this.pressureService = this.accessory.getService(PressureSensor) ?? this.accessory.addService(PressureSensor);
        this.pressureService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
        this.pressureService.setCharacteristic(Pressure, this.puck.currentRoomPressure);
        this.temperatureService.addLinkedService(this.pressureService);

        setInterval(async () => {
            await this.getNewPuckReadings()
        }, platform.config.pollInterval * 1000);
        this.getNewPuckReadings();
    }


    async getNewPuckReadings(): Promise<Puck> {
        let puck = await this.client.getPuckReading(this.puck)
        this.updatePuckReadingsFromPuck(puck)
        return puck;
    }

    updatePuckReadingsFromPuck(puck: Puck) {
        this.accessory.context.device = puck;
        this.puck = puck;

        // push the new value to HomeKit
        this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.puck.currentTemperatureC);
        this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.puck.currentHumidity);
        this.pressureService.updateCharacteristic(Pressure, this.puck.currentRoomPressure);

        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .updateCharacteristic(this.platform.Characteristic.FirmwareRevision, this.puck.firmwareVersionS)

        this.platform.log.debug(`Pushed updated current temperature state for ${this.puck.name!} to HomeKit:`, this.puck.currentTemperatureC);
    }

}
