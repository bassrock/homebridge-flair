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
import {getRandomIntInclusive} from './utils';

enum AccessoryType {
    WindowCovering = 'windowCovering',
    Fan = 'fan',
    AirPurifier = 'airPurifier'
}

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class FlairVentPlatformAccessory {
    private fanService?: Service;
    private windowService?: Service;
    private airPurifierService?: Service;
    private mainService: Service;

    private temperatureService: Service;
    private accessoryInformationService: Service;

    private vent: Vent;
    private client: Client;
    private accessoryType: AccessoryType;

    constructor(
        private readonly platform: FlairPlatform,
        private readonly accessory: PlatformAccessory,
        client: Client,
    ) {
      this.vent = this.accessory.context.device;
      this.client = client;
      this.accessoryType = this.platform.config.ventAccessoryType as AccessoryType;
      if (!this.accessoryType) {
        this.accessoryType = AccessoryType.WindowCovering;
      }

      // set accessory information
      this.accessoryInformationService = this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Flair')
        .setCharacteristic(this.platform.Characteristic.Model, 'Vent')
        .setCharacteristic(this.platform.Characteristic.SerialNumber, this.vent.id!);

      this.fanService = this.accessory.getService(this.platform.Service.Fanv2);
      this.windowService = this.accessory.getService(this.platform.Service.WindowCovering);
      this.airPurifierService = this.accessory.getService(this.platform.Service.AirPurifier);

      // We fake a vent as a window covering.
      switch (this.accessoryType) {
        case AccessoryType.WindowCovering:
          if (this.fanService) {
            this.accessory.removeService(this.fanService);
          }

          if (this.airPurifierService) {
            this.accessory.removeService(this.airPurifierService);
          }

          this.windowService = this.windowService
                    ?? this.accessory.addService(this.platform.Service.WindowCovering);
          this.windowService.getCharacteristic(this.platform.Characteristic.TargetPosition).setProps({
            minStep: 50,
          });
          this.windowService.getCharacteristic(this.platform.Characteristic.CurrentPosition).setProps({
            minStep: 50,
          });
          this.windowService.setCharacteristic(this.platform.Characteristic.TargetPosition, this.vent.percentOpen);
          this.windowService.setCharacteristic(this.platform.Characteristic.CurrentPosition, this.vent.percentOpen);
          this.windowService.setCharacteristic(
            this.platform.Characteristic.PositionState,
            this.platform.Characteristic.PositionState.STOPPED,
          );
          this.windowService.getCharacteristic(this.platform.Characteristic.TargetPosition)
            .on(CharacteristicEventTypes.SET, this.setTargetPosition.bind(this))
            .on(CharacteristicEventTypes.GET, this.getTargetPosition.bind(this));
          this.mainService = this.windowService;
          break;
        case AccessoryType.AirPurifier:
          if (this.fanService) {
            this.accessory.removeService(this.fanService);
          }

          if (this.windowService) {
            this.accessory.removeService(this.windowService);
          }

          this.airPurifierService = this.airPurifierService
                    ?? this.accessory.addService(this.platform.Service.AirPurifier);

          this.airPurifierService.getCharacteristic(this.platform.Characteristic.RotationSpeed).setProps({
            minStep: 50,
          });
          this.airPurifierService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
            .on(CharacteristicEventTypes.SET, this.setTargetPosition.bind(this))
            .on(CharacteristicEventTypes.GET, this.getTargetPosition.bind(this));
          this.mainService = this.airPurifierService;
          break;
        case AccessoryType.Fan:
          if (this.airPurifierService) {
            this.accessory.removeService(this.airPurifierService);
          }

          if (this.windowService) {
            this.accessory.removeService(this.windowService);
          }
          this.fanService =  this.fanService
                    ?? this.accessory.addService(this.platform.Service.Fanv2);

          this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed).setProps({
            minStep: 50,
          });

          this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
            .on(CharacteristicEventTypes.SET, this.setTargetPosition.bind(this))
            .on(CharacteristicEventTypes.GET, this.getTargetPosition.bind(this));
          this.mainService = this.fanService;
          break;
        default:
          throw Error('No Vent Accessory Type Selected.');
          break;
      }

      this.mainService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
      this.mainService.setPrimaryService(true);

      //Add our temperature sensor
      this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor)
            ?? this.accessory.addService(this.platform.Service.TemperatureSensor);
      this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
      this.temperatureService.setCharacteristic(
        this.platform.Characteristic.CurrentTemperature,
        this.vent.ductTemperatureC,
      );
      this.mainService.addLinkedService(this.temperatureService);

      setInterval(async () => {
        await this.getNewVentReadings();
      }, (platform.config.pollInterval + getRandomIntInclusive(1, 20)) * 1000);
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

      // We fake a vent as a window covering.
      switch (this.accessoryType) {
        case AccessoryType.WindowCovering:
          this.mainService.updateCharacteristic(this.platform.Characteristic.TargetPosition, this.vent.percentOpen);
          this.mainService.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.vent.percentOpen);
          this.mainService.updateCharacteristic(
            this.platform.Characteristic.PositionState,
            this.platform.Characteristic.PositionState.STOPPED,
          );
          break;
        case AccessoryType.AirPurifier:
          this.mainService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.vent.percentOpen);
          this.mainService.updateCharacteristic(this.platform.Characteristic.Active, this.vent.percentOpen > 0);
          this.mainService.updateCharacteristic(this.platform.Characteristic.CurrentAirPurifierState, this.vent.percentOpen > 0);
          break;
        case AccessoryType.Fan:
          this.mainService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.vent.percentOpen);
          this.mainService.updateCharacteristic(this.platform.Characteristic.Active, this.vent.percentOpen > 0);
          break;
        default:
          throw Error('No Vent Accessory Type Selected.');
          break;
      }


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
