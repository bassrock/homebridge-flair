import {Characteristic, Formats, Perms} from 'homebridge'
export class PressureCharacteristic extends Characteristic {

    static readonly UUID: string = '2B411C00-E2E2-4B21-A665-7F079E525304';

    constructor() {
        super('kPA', PressureCharacteristic.UUID);
        this.setProps({
            format: Formats.UINT32,
            maxValue: 100000,
            minValue: 0,
            minStep: 1,
            perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    }
}
