import type {
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import {CharacteristicEventTypes} from 'homebridge';
import {FlairPlatform} from './platform';
import Client from 'flair-api-ts/lib/client';
import {Vent} from 'flair-api-ts/lib/client/models';
import {Pressure, PressureSensor} from './Pressure';
import {getRandomIntInclusive} from './utils';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class FlairVentPlatformAccessory {
    private windowService: Service;
    private temperatureService: Service;
    private pressureService: Service;
    private accessoryInformationService: Service;

    private vent: Vent;
    private client: Client;

    constructor(
        private readonly platform: FlairPlatform,
        private readonly accessory: PlatformAccessory,
        client: Client,
    ) {
      this.vent = this.accessory.context.device;
      this.client = client;

      // set accessory information
      this.accessoryInformationService = this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Flair')
        .setCharacteristic(this.platform.Characteristic.Model, 'Vent')
        .setCharacteristic(this.platform.Characteristic.SerialNumber, this.vent.id!);

      // We fake a vent as a window covering.
      this.windowService = this.accessory.getService(this.platform.Service.WindowCovering)
          ?? this.accessory.addService(this.platform.Service.WindowCovering);
      this.windowService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
      this.windowService.setPrimaryService(true);

      //Add our temperature sensor
      this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor)
          ?? this.accessory.addService(this.platform.Service.TemperatureSensor);
      this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
      this.temperatureService.setCharacteristic(
        this.platform.Characteristic.CurrentTemperature,
        this.vent.ductTemperatureC,
      );
      this.windowService.addLinkedService(this.temperatureService);

      //Add our custom pressure sensor
      this.pressureService = this.accessory.getService(PressureSensor) ?? this.accessory.addService(PressureSensor);
      this.pressureService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
      this.pressureService.setCharacteristic(Pressure, this.vent.ductPressure);
      this.windowService.addLinkedService(this.pressureService);

      this.windowService.setCharacteristic(this.platform.Characteristic.TargetPosition, this.vent.percentOpen);
      this.windowService.setCharacteristic(this.platform.Characteristic.CurrentPosition, this.vent.percentOpen);
      this.windowService.setCharacteristic(
        this.platform.Characteristic.PositionState,
        this.platform.Characteristic.PositionState.STOPPED,
      );
      this.windowService.getCharacteristic(this.platform.Characteristic.TargetPosition)
        .on(CharacteristicEventTypes.SET, this.setTargetPosition.bind(this))
        .on(CharacteristicEventTypes.GET, this.getTargetPosition.bind(this));



      setInterval(async () => {
        await this.getNewVentReadings();
      }, (platform.config.pollInterval+ getRandomIntInclusive(1,20)) * 1000);
      this.getNewVentReadings();
    }

    /**
     //  * Handle "SET" requests from HomeKit
     //  * These are sent when the user changes the state of an accessory, for example, changing the Brightness
     //  */
    setTargetPosition(value: CharacteristicValue, callback: CharacteristicSetCallback) {
      this.client.setVentPercentOpen(this.vent, value as number).then((vent: Vent) => {
        this.updateVentReadingsFromVent(vent);
        this.platform.log.debug('Set Characteristic Percent Open -> ', value);
        // you must call the callback function
        callback(null, vent.percentOpen);
      });

    }

    getTargetPosition(callback: CharacteristicGetCallback) {
      this.getNewVentReadings().then((vent: Vent) => {
        callback(null, vent.percentOpen);
      });
    }

    async getNewVentReadings(): Promise<Vent> {
      try {
        const vent = await this.client.getVentReading(this.vent);
        this.updateVentReadingsFromVent(vent);
        return vent;
      } catch (e) {
        this.platform.log.error(e);
      }

      return this.vent;
    }

    updateVentReadingsFromVent(vent: Vent) {
      this.accessory.context.device = vent;
      this.vent = vent;

      this.temperatureService.updateCharacteristic(
        this.platform.Characteristic.CurrentTemperature,
        this.vent.ductTemperatureC,
      );

      this.pressureService.updateCharacteristic(Pressure, this.vent.ductPressure);

      this.windowService.updateCharacteristic(this.platform.Characteristic.TargetPosition, this.vent.percentOpen);
      this.windowService.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.vent.percentOpen);
      this.windowService.updateCharacteristic(
        this.platform.Characteristic.PositionState,
        this.platform.Characteristic.PositionState.STOPPED,
      );

      this.accessoryInformationService.updateCharacteristic(
        this.platform.Characteristic.FirmwareRevision,
        this.vent.firmwareVersionS,
      );

      this.platform.log.debug(`Pushed updated state for vent: ${this.vent.name!} to HomeKit`, {
        open: this.vent.percentOpen,
        pressure: this.vent.ductPressure,
        temperature: this.vent.ductTemperatureC,
      });
    }

}
