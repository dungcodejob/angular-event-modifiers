import { DOCUMENT } from '@angular/common';
import {
  EventEmitter,
  Inject,
  inject,
  Injectable,
  reflectComponentType,
  ɵgetLContext,
} from '@angular/core';
import {
  EventManagerPlugin,
  ɵKeyEventsPlugin,
} from '@angular/platform-browser';
import { first, Observable } from 'rxjs';
import {
  EVENT_MODIFIER_OPTIONS,
  EventModifiers,
} from './event-modifier-options';

enum SystemModifier {
  Ctrl = 'ctrl',
  Shift = 'shift',
  Alt = 'alt',
  meta = 'meta',
  Exact = 'exact',
}

enum EventModifier {
  Stop = 'stop',
  Prevent = 'prevent',
  Self = 'self',
  Capture = 'capture',
  Once = 'once',
  Passive = 'passive',
}

enum MouseButtonModifier {
  Left = 'left',
  Middle = 'middle',
  Right = 'right',
}

type RemoveModifier =
  | Exclude<
      EventModifier,
      EventModifier.Once | EventModifier.Capture | EventModifier.Passive
    >
  | Exclude<SystemModifier, SystemModifier.Exact>
  | MouseButtonModifier;
type KeyedEvent = KeyboardEvent | MouseEvent | TouchEvent;

type GuardFn = (e: KeyedEvent, modifiers: string[]) => boolean | void;

const modifierGuards: Record<RemoveModifier, GuardFn> = {
  [SystemModifier.Ctrl]: (e) => !e.ctrlKey,
  [SystemModifier.Shift]: (e) => !e.shiftKey,
  [SystemModifier.Alt]: (e) => !e.altKey,
  [SystemModifier.meta]: (e) => !e.metaKey,
  [EventModifier.Stop]: (e) => e.stopPropagation(),
  [EventModifier.Prevent]: (e) => e.preventDefault(),
  [EventModifier.Self]: (e) => e.target !== e.currentTarget,
  [MouseButtonModifier.Left]: (e) => 'button' in e && e.button !== 0,
  [MouseButtonModifier.Middle]: (e) => 'button' in e && e.button !== 1,
  [MouseButtonModifier.Right]: (e) => 'button' in e && e.button !== 2,
};

const removeModifiers = [
  EventModifier.Stop,
  EventModifier.Prevent,
  EventModifier.Self,
  MouseButtonModifier.Left,
  MouseButtonModifier.Middle,
  MouseButtonModifier.Right,
  SystemModifier.Exact,
];

const DISABLED = Symbol('DISABLED');

function withModifiers<T extends (event: any, ...args: any[]) => any>(
  fn: T,
  modifiers: string[],
  customEventModifier: EventModifiers
) {
  return (data: any, ...args: any[]) => {
    const modifierFn = (item: string, data: any) => {
      if (item === EventModifier.Once) {
        return data;
      }
      const guard =
        customEventModifier?.guard?.[item] ??
        modifierGuards[item as RemoveModifier];
      if (guard) {
        let disabled = guard(data, modifiers);
        if (disabled instanceof Promise) {
          return disabled.then((disabled) => {
            return disabled ? DISABLED : data;
          });
        }
        return disabled ? DISABLED : data;
      } else {
        let mapItem = customEventModifier?.map?.[item];
        if (!mapItem) {
          throw new Error(`unknown modifier: ${item}`);
        }
        return mapItem(data, modifiers);
      }
    };

    for (const item of modifiers) {
      if (data instanceof Promise) {
        data = data.then((value) => {
          if (value === DISABLED) {
            return value;
          }
          return modifierFn(item, value);
        });
      } else {
        data = modifierFn(item, data);
        if (data === DISABLED) {
          return;
        }
      }
    }
    if (data instanceof Promise) {
      return data.then((value) => {
        if (value === DISABLED) {
          return;
        }
        return fn(value, ...args);
      });
    } else {
      return fn(data, ...args);
    }
  };
}

function getModifierStatusAndRemove(list: string[], item: string) {
  let index = list.indexOf(item);
  if (index === -1) {
    return false;
  }
  list.splice(index, 1);
  return true;
}
const HOOKED_EVENT = Symbol('HOOKED_EVENT');

@Injectable()
export class EventModifierPlugin extends EventManagerPlugin {
  private readonly _options =
    inject(EVENT_MODIFIER_OPTIONS, { optional: true }) ?? {};
  constructor(@Inject(DOCUMENT) doc: Document) {
    super(doc);
  }

  override supports(eventName: string): boolean {
    return true;
  }
  override addEventListener(
    element: HTMLElement,
    eventName: string,
    handler: Function
  ): Function {
    let modifiers = eventName.split('.');
    const name = modifiers.shift() as string;
    let newHandler = withModifiers(
      handler as any,
      modifiers.slice(),
      this._options.modifiers ?? {}
    );

    modifiers = modifiers.filter(
      (item) => !removeModifiers.includes(item as RemoveModifier)
    );

    if (
      this._options.componentOutput &&
      typeof (element as any)['__ngContext__'] !== undefined
    ) {
      let lContext = ɵgetLContext(element);
      let maybeComponent = lContext?.lView?.[lContext.nodeIndex]?.[8];
      if (maybeComponent) {
        let define = reflectComponentType(maybeComponent.constructor)!;
        let list = define.outputs;
        if (list.length) {
          let item = list.find((item) => item.templateName === name) as {
            readonly propName: string;
            readonly templateName: string;
          };
          let outputP = maybeComponent[item.propName];
          if (outputP) {
            const propertyName = item.propName;
            let newEvent: EventEmitter<any> =
              maybeComponent[propertyName][HOOKED_EVENT] ??
              new EventEmitter(false);
            maybeComponent[propertyName][HOOKED_EVENT] = newEvent;
            let ob = newEvent as Observable<any>;
            if (getModifierStatusAndRemove(modifiers, EventModifier.Once)) {
              ob = ob.pipe(first());
            }
            let subscription = ob.subscribe((value) => {
              newHandler(value);
            });
            maybeComponent[propertyName].emit = function (value: any) {
              newEvent.next(value);
            };
            return () => subscription.unsubscribe();
          }
        }
      }
    }

    let options: AddEventListenerOptions = {
      capture: getModifierStatusAndRemove(modifiers, EventModifier.Capture),
      once: getModifierStatusAndRemove(modifiers, EventModifier.Once),
      passive: getModifierStatusAndRemove(modifiers, EventModifier.Passive),
    };
    let newEventName = [name, ...modifiers].join('.');
    let parsedEvent = ɵKeyEventsPlugin.parseEventName(newEventName);
    if (!parsedEvent) {
      return this._commonEvent(element, name, newHandler, options);
    } else {
      return this._keyBoardEvent(element, parsedEvent, newHandler, options);
    }
  }

  private _commonEvent(
    element: HTMLElement,
    eventName: string,
    handler: Function,
    options: AddEventListenerOptions
  ) {
    element.addEventListener(eventName, handler as EventListener, options);
    return () =>
      this._removeEventListener(element, eventName, handler as EventListener);
  }

  private _keyBoardEvent(
    element: HTMLElement,
    parsedEvent: {
      fullKey: string;
      domEventName: string;
    },
    handler: Function,
    options: AddEventListenerOptions
  ): Function {
    const outsideHandler = ɵKeyEventsPlugin.eventCallback(
      parsedEvent['fullKey'],
      handler,
      this.manager.getZone()
    );

    return this.manager.getZone().runOutsideAngular(() => {
      element.addEventListener(
        parsedEvent['domEventName'] as any,
        outsideHandler as any,
        options
      );
      return () => {
        this._removeEventListener(
          element,
          parsedEvent['domEventName'] as any,
          outsideHandler as any
        );
      };
    });
  }

  private _setupEventListener(
    element: HTMLElement,
    eventName: string,
    handler: Function,
    options: AddEventListenerOptions
  ): () => void {
    element.addEventListener(eventName as any, handler as any, options);

    return () =>
      this._removeEventListener(element, eventName as any, handler as any);
  }

  private _removeEventListener(
    target: any,
    eventName: string,
    callback: Function
  ): void {
    return target.removeEventListener(eventName, callback as EventListener);
  }
}
