import { DOCUMENT } from '@angular/common';
import { Provider } from '@angular/core';
import { EVENT_MANAGER_PLUGINS } from '@angular/platform-browser';
import {
  EVENT_MODIFIER_OPTIONS,
  EventModifierOptions,
} from './event-modifier-options';
import { EventModifierPlugin } from './event-modifier.service';

export function provideEventModifier(options?: EventModifierOptions): Provider {
  return [
    {
      provide: EVENT_MANAGER_PLUGINS,
      useClass: EventModifierPlugin,
      multi: true,
      deps: [DOCUMENT],
    },
    {
      provide: EVENT_MODIFIER_OPTIONS,
      useValue: options,
    },
  ];
}
