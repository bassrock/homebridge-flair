import type {
  Service,
  PlatformAccessory,
} from 'homebridge';

import {FlairPlatform} from './platform';
import {Puck, Client} from 'flair-api-ts';
import {getRandomIntInclusive} from './utils';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class FlairPuckPlatformAccessory {
    private temperatureService: Service;
    private humidityService: Service;
    private accessoryInformationService: Service;

    private client: Client;
    private puck: Puck;


    constructor(
        private readonly platform: FlairPlatform,
        private readonly accessory: PlatformAccessory,
        client: Client,
    ) {
      this.puck = this.accessory.context.device;
      this.client = client;

      // set accessory information
      this.accessoryInformationService = this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Flair')
        .setCharacteristic(this.platform.Characteristic.Model, 'Puck')
        .setCharacteristic(this.platform.Characteristic.SerialNumber, this.puck.displayNumber);

      // you can create multiple services for each accessory
      this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor)
          ?? this.accessory.addService(this.platform.Service.TemperatureSensor);
      this.temperatureService.setPrimaryService(true);
      this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
      this.temperatureService.setCharacteristic(
        this.platform.Characteristic.CurrentTemperature,
        this.puck.currentTemperatureC,
      );

      this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor)
          ?? this.accessory.addService(this.platform.Service.HumiditySensor);
      this.humidityService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
      this.humidityService.setCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.puck.currentHumidity);
      this.temperatureService.addLinkedService(this.humidityService);

      setInterval(async () => {
        await this.getNewPuckReadings();
      }, (platform.config.pollInterval + getRandomIntInclusive(1, 20)) * 1000);
      this.getNewPuckReadings();
    }


    async getNewPuckReadings(): Promise<Puck> {
      try {
        const puck = await this.client.getPuckReading(this.puck);
        this.updatePuckReadingsFromPuck(puck);
        return puck;
      } catch (e) {
        this.platform.log.debug(e);
      }

      return this.puck;
    }

    updatePuckReadingsFromPuck(puck: Puck):void {
      this.accessory.context.device = puck;
      this.puck = puck;

      // push the new value to HomeKit
      this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.puck.currentTemperatureC);
      this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.puck.currentHumidity);

      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .updateCharacteristic(this.platform.Characteristic.FirmwareRevision, this.puck.firmwareVersionS);

      this.platform.log.debug(`Pushed updated current temperature state for ${this.puck.name!} to HomeKit:`, this.puck.currentTemperatureC);
    }

}
