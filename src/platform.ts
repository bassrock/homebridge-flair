import {APIEvent} from 'homebridge';
import type {API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig} from 'homebridge';

import {PLATFORM_NAME, PLUGIN_NAME} from './settings';
import {FlairPuckPlatformAccessory} from './puckPlatformAccessory';
import {FlairVentPlatformAccessory} from './ventPlatformAccessory';
import Client from "flair-api-ts/lib/client";
import {platform} from "os";
import {Puck, Vent} from "flair-api-ts/lib/client/models";
import {Model} from "flair-api-ts/lib/client/models/model";

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
        });
    }

    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Restoring accessory from cache:', accessory.displayName);

        if (accessory.context.type == Puck.type) {
            this.log.info('Restoring puck from cache:', accessory.displayName);
            new FlairPuckPlatformAccessory(this, accessory, this.client);
        } else if (accessory.context.type == Vent.type) {
            this.log.info('Restoring vent from cache:', accessory.displayName);
            new FlairVentPlatformAccessory(this, accessory, this.client);
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
        let uuids : [string[], string[]] = await Promise.all([
            this.addDevices(await this.client.getPucks()),
            this.addDevices(await this.client.getVents())
        ]);

        currentUUIDs = currentUUIDs.concat(uuids[0], uuids[1])


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
                this.log.info('Registering new accessory:', device.name!);

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
                } else {
                    continue;
                }

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