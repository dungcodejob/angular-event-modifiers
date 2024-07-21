import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { DOCUMENT } from '@angular/common';
import { EVENT_MANAGER_PLUGINS } from '@angular/platform-browser';
import {
  EventModifiersPlugin
} from '../event-modifires/event-modifires.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    {
      provide: EVENT_MANAGER_PLUGINS,
      useClass: EventModifiersPlugin,
      multi: true,
      deps: [DOCUMENT],
    },
  ],
};
