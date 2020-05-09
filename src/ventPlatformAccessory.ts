import type {
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    PlatformAccessory,
    Service
} from 'homebridge';
import {CharacteristicEventTypes} from 'homebridge';
import {FlairPlatform} from './platform';
import Client from "flair-api-ts/lib/client";
import {Vent} from "flair-api-ts/lib/client/models";

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class FlairVentPlatformAccessory {
    private windowService: Service;
    private temperatureService: Service;
    private accessoryInformationService: Service;

    private vent: Vent;
    private client: Client;

    constructor(
        private readonly platform: FlairPlatform,
        private readonly accessory: PlatformAccessory,
        client: Client
    ) {
        this.vent = this.accessory.context.device;
        this.client = client;

        // set accessory information
        this.accessoryInformationService = this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Flair')
            .setCharacteristic(this.platform.Characteristic.Model, 'Vent')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, this.vent.id!);

        // get the LightBulb service if it exists, otherwise create a new LightBulb service
        // you can create multiple services for each accessory
        this.windowService = this.accessory.getService(this.platform.Service.WindowCovering) ?? this.accessory.addService(this.platform.Service.WindowCovering);
        this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) ?? this.accessory.addService(this.platform.Service.TemperatureSensor);
        this.windowService.addLinkedService(this.temperatureService);

        this.temperatureService.setCharacteristic(this.platform.Characteristic.CurrentTemperature, this.vent.ductTemperatureC);

        // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
        // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
        // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

        // set the service name, this is what is displayed as the default name on the Home app
        // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
        this.windowService.setCharacteristic(this.platform.Characteristic.Name, this.vent.name!);
        this.windowService.setCharacteristic(this.platform.Characteristic.TargetPosition, this.vent.percentOpen)
        this.windowService.setCharacteristic(this.platform.Characteristic.CurrentPosition, this.vent.percentOpen)
        this.windowService.setCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED)


        // each service must implement at-minimum the "required characteristics" for the given service type
        // see https://github.com/homebridge/HAP-NodeJS/blob/master/src/lib/gen/HomeKit.ts

        this.windowService.getCharacteristic(this.platform.Characteristic.TargetPosition)
            .on(CharacteristicEventTypes.SET, this.setTargetPosition.bind(this))
            .on(CharacteristicEventTypes.GET, this.getTargetPosition.bind(this))

        setInterval(async () => {
            await this.getNewVentReadings()
        }, 30 * 1000);
    }

    /**
     //  * Handle "SET" requests from HomeKit
     //  * These are sent when the user changes the state of an accessory, for example, changing the Brightness
     //  */
    setTargetPosition(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        let self = this;
        this.client.setVentPercentOpen(this.vent, value as number).then(function (vent: Vent) {
            self.updateVentReadingsFromVent(vent)
            self.platform.log.debug('Set Characteristic Percent Open -> ', value);
            // you must call the callback function
            callback(null, vent.percentOpen);
        })

    }

    getTargetPosition(callback: CharacteristicGetCallback) {
        this.getNewVentReadings().then(function (vent: Vent) {
            callback(null, vent.percentOpen)
        })
    }

    async getNewVentReadings(): Promise<Vent> {
        let vent = await this.client.getVentReading(this.vent)
        this.updateVentReadingsFromVent(vent)
        return vent;
    }

    updateVentReadingsFromVent(vent: Vent) {
        this.accessory.context.device = vent;
        this.vent = vent;

        // push the new value to HomeKit
        this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.vent.ductTemperatureC);

        this.windowService.updateCharacteristic(this.platform.Characteristic.TargetPosition, this.vent.percentOpen);
        this.windowService.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.vent.percentOpen);
        this.windowService.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED)

        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .updateCharacteristic(this.platform.Characteristic.FirmwareRevision, this.vent.firmwareVersionS)

        this.platform.log.debug(`Pushed updated current temperature state for ${this.vent.name!} to HomeKit, open ${this.vent.percentOpen}:`, this.vent.ductTemperatureC);
    }

}
