import {APIEvent, CharacteristicSetCallback, CharacteristicValue} from 'homebridge';
import type {API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig} from 'homebridge';

import {PLATFORM_NAME, PLUGIN_NAME} from './settings';
import {FlairPuckPlatformAccessory} from './puckPlatformAccessory';
import {FlairVentPlatformAccessory} from './ventPlatformAccessory';
import {FlairRoomPlatformAccessory} from './roomPlatformAccessory';
import Client from "flair-api-ts/lib/client";
import {Puck, Vent, Room, Structure, FlairMode, StructureHeatCoolMode} from "flair-api-ts/lib/client/models";
import {Model} from "flair-api-ts/lib/client/models/model";
import {plainToClass} from "class-transformer";
import {getRandomIntInclusive} from "./utils";

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class FlairPlatform implements DynamicPlatformPlugin {
    public readonly Service = this.api.hap.Service;
    public readonly Characteristic = this.api.hap.Characteristic;

    // this is used to track restored cached accessories
    public readonly accessories: PlatformAccessory[] = [];

    private client: Client;

    private structure?: Structure;

    private rooms: [FlairRoomPlatformAccessory?] = []


    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        this.log.debug('Finished initializing platform:', this.config.name);

        this.client = new Client(this.config.clientId, this.config.clientSecret, this.config.username, this.config.password);

        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on(APIEvent.DID_FINISH_LAUNCHING, async () => {
            log.debug('Executed didFinishLaunching callback');
            // run the method to discover / register your devices as accessories
            await this.discoverDevices();

            setInterval(async () => {
                await this.getNewStructureReadings()
            }, (this.config.pollInterval+ getRandomIntInclusive(1,20)) * 1000);
        });
    }


    private async getNewStructureReadings() {
        try {
            let structure = await this.client.getStructure(await this.getStructure());
            this.updateStructureFromStructureReading(structure);
        } catch (e) {
            this.log.error(e);
        }
    }

    private updateStructureFromStructureReading(structure: Structure) {
        this.structure = structure;
        for (const room of this.rooms) {
            if (room) {
                room.updateFromStructure(this.structure);
            }
        }
        return this.structure;
    }

    public async setStructureMode(mode: FlairMode, heatingCoolingMode: StructureHeatCoolMode): Promise<Structure> {
        let structure = await this.client.setStructureMode(await this.getStructure(), mode);
        structure = await this.client.setStructureHeatingCoolMode(structure, heatingCoolingMode);

        return this.updateStructureFromStructureReading(structure);
    }

    private async getStructure(): Promise<Structure> {
        if (this.structure) {
            return this.structure!;
        }
        this.structure = await this.client.getPrimaryStructure();
        return this.structure!;
    }

    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Restoring accessory from cache:', accessory.displayName);

        if (accessory.context.type == Puck.type) {
            this.log.info('Restoring puck from cache:', accessory.displayName);
            accessory.context.device = plainToClass(Puck, accessory.context.device)
            new FlairPuckPlatformAccessory(this, accessory, this.client);
        } else if (accessory.context.type == Vent.type) {
            this.log.info('Restoring vent from cache:', accessory.displayName);
            accessory.context.device = plainToClass(Vent, accessory.context.device)
            new FlairVentPlatformAccessory(this, accessory, this.client);
        } else if (accessory.context.type == Room.type) {
            this.log.info('Restoring room from cache:', accessory.displayName);
            accessory.context.device = plainToClass(Room, accessory.context.device)
            let self = this;
            this.getStructure().then((structure: Structure) => {
                self.rooms.push(new FlairRoomPlatformAccessory(self, accessory, this.client, structure));
            })
        }

        // add the restored accessory to the accessories cache so we can track if it has already been registered
        this.accessories.push(accessory);
    }

    /**
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    async discoverDevices() {
        let currentUUIDs: string[] = [];
        let uuids: [string[], string[], string[]] = await Promise.all([
            this.addDevices(await this.client.getPucks()),
            this.addDevices(await this.client.getVents()),
            this.addDevices((await this.client.getRooms()).filter((value: Room) => {
                return value.pucksInactive === 'Active'
            }) as [Room])
        ]);

        currentUUIDs = currentUUIDs.concat(uuids[0], uuids[1], uuids[2])


        //Loop over the current uuid's and if they don't exist then remove them.
        for (const accessory of this.accessories) {
            if (!currentUUIDs.find(uuid => uuid === accessory.UUID)) {
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                delete this.accessories[this.accessories.indexOf(accessory, 0)];
                this.log.debug('Removing not found device:', accessory.displayName)
            }
        }
    }


    async addDevices(devices: [Model]): Promise<string[]> {
        const currentUUIDs: string[] = [];

        // loop over the discovered devices and register each one if it has not already been registered
        for (const device of devices) {

            // generate a unique id for the accessory this should be generated from
            // something globally unique, but constant, for example, the device serial
            // number or MAC address
            const uuid = this.api.hap.uuid.generate(device.id!);
            currentUUIDs.push(uuid);

            // check that the device has not already been registered by checking the
            // cached devices we stored in the `configureAccessory` method above
            if (!this.accessories.find(accessory => accessory.UUID === uuid)) {

                // create a new accessory
                const accessory = new this.api.platformAccessory(device.name!, uuid);

                // store a copy of the device object in the `accessory.context`
                // the `context` property can be used to store any data about the accessory you may need
                accessory.context.device = device;


                // create the accessory handler
                // this is imported from `puckPlatformAccessory.ts`
                if (device instanceof Puck) {
                    accessory.context.type = Puck.type;
                    new FlairPuckPlatformAccessory(this, accessory, this.client);
                } else if (device instanceof Vent) {
                    accessory.context.type = Vent.type;
                    new FlairVentPlatformAccessory(this, accessory, this.client);
                } else if (device instanceof Room) {
                    accessory.context.type = Room.type;
                    let self = this;
                    this.getStructure().then((structure: Structure) => {
                        self.rooms.push(new FlairRoomPlatformAccessory(self, accessory, this.client, structure));
                    })
                } else {
                    continue;
                }
                this.log.info(`Registering new ${accessory.context.type}`, device.name!);

                // link the accessory to your platform
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

                // push into accessory cache
                this.accessories.push(accessory);

                // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
                // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            } else {
                this.log.debug('Discovered accessory already exists:', device.name!)
            }
        }

        return currentUUIDs
    }

}
