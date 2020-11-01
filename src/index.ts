import type { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { FlairPlatform } from './platform';
import 'reflect-metadata';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  api.registerPlatform("homebridge-flair", PLATFORM_NAME, FlairPlatform);
}
