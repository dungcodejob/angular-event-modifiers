import { InjectionToken } from "@angular/core";

export type EventModifiers = {
  map?: Record<string, (input: any, modifiers: string[]) => any>;
  guard?: Record<
    string,
    (input: any, modifiers: string[]) => boolean | Promise<boolean>
  >;
};

export interface EventModifierOptions {
  modifiers?: EventModifiers;
  componentOutput?: boolean;
}

export const EVENT_MODIFIER_OPTIONS = new InjectionToken<EventModifierOptions>(
  'EVENT_MODIFIER_OPTIONS'
);

