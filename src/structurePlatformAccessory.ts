import type {PlatformAccessory, Service} from 'homebridge';
import {
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
} from 'homebridge';

import {FlairPlatform} from './platform';
import {Structure, StructureHeatCoolMode, Client} from 'flair-api-ts';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class FlairStructurePlatformAccessory {
  private accessoryInformationService: Service;
  private thermostatService: Service;

  private client: Client;
  private structure: Structure;


  constructor(
        private readonly platform: FlairPlatform,
        private readonly accessory: PlatformAccessory,
        client: Client,
  ) {
    this.structure = this.accessory.context.device;
    this.client = client;

    // set accessory information
    this.accessoryInformationService = this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Flair')
      .setCharacteristic(this.platform.Characteristic.Model, 'Structure')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.structure.id!);

    this.thermostatService = this.accessory.getService(this.platform.Service.Thermostat)
            ?? this.accessory.addService(this.platform.Service.Thermostat);
    this.thermostatService.setPrimaryService(true);
    this.thermostatService
      .setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name)
      .setCharacteristic(this.platform.Characteristic.CurrentTemperature, this.structure.setPointTemperatureC!)
      .setCharacteristic(this.platform.Characteristic.TargetTemperature, this.structure.setPointTemperatureC!)
      .setCharacteristic(
        this.platform.Characteristic.TargetHeatingCoolingState,
                this.getTargetHeatingCoolingState(this.structure)!,
      )
      .setCharacteristic(
        this.platform.Characteristic.CurrentHeatingCoolingState,
                this.getCurrentHeatingCoolingState(this.structure)!,
      );

    this.thermostatService.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .on(CharacteristicEventTypes.SET, this.setTargetTemperature.bind(this))
      .on(CharacteristicEventTypes.GET, this.getTargetTemperature.bind(this));

    this.thermostatService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .on(CharacteristicEventTypes.SET, this.setTargetHeatingCoolingState.bind(this));
  }

  setTargetHeatingCoolingState(value: CharacteristicValue, callback: CharacteristicSetCallback): void {
    if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
      this.platform.setStructureMode(StructureHeatCoolMode.OFF).then((structure: Structure) => {
        callback(null);
        this.updateFromStructure(structure);
      });
    } else if (value === this.platform.Characteristic.TargetHeatingCoolingState.COOL) {
      this.platform.setStructureMode(StructureHeatCoolMode.COOL).then((structure: Structure) => {
        callback(null);
        this.updateFromStructure(structure);
      });
    } else if (value === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      this.platform.setStructureMode(StructureHeatCoolMode.HEAT).then((structure: Structure) => {
        callback(null);
        this.updateFromStructure(structure);
      });
    } else if (value === this.platform.Characteristic.TargetHeatingCoolingState.AUTO) {
      this.platform.setStructureMode(StructureHeatCoolMode.AUTO).then((structure: Structure) => {
        callback(null);
        this.updateFromStructure(structure);
      });
    }
  }

  setTargetTemperature(value: CharacteristicValue, callback: CharacteristicSetCallback): void {
    this.client.setStructureSetPoint(this.structure, value as number).then((structure: Structure) => {
      // you must call the callback function
      callback(null);
      this.updateFromStructure(structure);
      this.platform.log.debug('Set Characteristic Temperature -> ', value);

    });

  }

  getTargetTemperature(callback: CharacteristicGetCallback): void {
    callback(null, this.platform.structure ? this.platform.structure!.setPointTemperatureC : 0);
  }

  public updateFromStructure(structure: Structure): void {
    this.structure = structure;

    // push the new value to HomeKit
    this.thermostatService
      .updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.structure.setPointTemperatureC!)
      .updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.structure.setPointTemperatureC!)
      .updateCharacteristic(
        this.platform.Characteristic.TargetHeatingCoolingState,
                this.getTargetHeatingCoolingState(this.structure)!,
      )
      .updateCharacteristic(
        this.platform.Characteristic.CurrentHeatingCoolingState,
                this.getCurrentHeatingCoolingState(this.structure)!,
      );

    this.platform.log.debug(
      `Pushed updated current structure state for ${this.structure.name!} to HomeKit:`,
            this.structure.structureHeatCoolMode!,
    );
  }

  private getCurrentHeatingCoolingState(structure: Structure) {
    if (structure.structureHeatCoolMode === StructureHeatCoolMode.COOL) {
      return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
    }

    if (structure.structureHeatCoolMode === StructureHeatCoolMode.HEAT) {
      return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
    }

    if (structure.structureHeatCoolMode === StructureHeatCoolMode.AUTO) {
      //TODO: When the structure api shows the current thermostat mode change this to that.
      // For now active always means cool.
      return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
    }

    return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
  }

  private getTargetHeatingCoolingState(structure: Structure) {
    if (structure.structureHeatCoolMode === StructureHeatCoolMode.COOL) {
      return this.platform.Characteristic.TargetHeatingCoolingState.COOL;
    }

    if (structure.structureHeatCoolMode === StructureHeatCoolMode.HEAT) {
      return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
    }

    if (structure.structureHeatCoolMode === StructureHeatCoolMode.AUTO) {
      return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
    }

    return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
  }

}
