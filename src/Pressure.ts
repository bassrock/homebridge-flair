import {Characteristic, Formats, Perms, Service} from 'homebridge'

export class Pressure extends Characteristic {

    static readonly UUID: string = '2B411C00-E2E2-4B21-A665-7F079E525304';

    constructor() {
        super('kPA', Pressure.UUID);
        this.setProps({
            format: Formats.FLOAT,
            maxValue: 100000,
            minValue: 0,
            minStep: 0.001,
            perms: [Perms.PAIRED_READ, Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    }
}

export class PressureSensor extends Service {
    static readonly UUID: string = '2B411C00-E2E2-4B21-A665-7F079E525404';

    constructor() {
        super('Pressure', PressureSensor.UUID);

        this.addCharacteristic(Pressure);
    }
}
