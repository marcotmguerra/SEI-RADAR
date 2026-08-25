// Typings for Chrome Extension APIs (Manifest V3)

declare namespace chrome {
  export namespace runtime {
    export interface MessageSender {
      tab?: chrome.tabs.Tab;
      id?: string;
      url?: string;
      frameId?: number;
    }

    export function getURL(path: string): string;
    export const id: string;
    export const lastError: { message?: string } | undefined;

    export function sendMessage<T = any, R = any>(
      message: T,
      responseCallback?: (response: R) => void
    ): Promise<R>;

    export const onMessage: {
      addListener(
        callback: (
          message: any,
          sender: MessageSender,
          sendResponse: (response?: any) => void
        ) => boolean | void
      ): void;
      removeListener(callback: (...args: any[]) => void): void;
    };

    export const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void;
    };
  }

  export namespace action {
    export function setBadgeText(details: { text: string; tabId?: number }): Promise<void>;
    export function setBadgeBackgroundColor(details: { color: string | [number, number, number, number]; tabId?: number }): Promise<void>;
    export function setTitle(details: { title: string; tabId?: number }): Promise<void>;
  }

  export namespace storage {
    export interface StorageArea {
      get(keys?: string | string[] | Record<string, any> | null): Promise<Record<string, any>>;
      set(items: Record<string, any>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }

    export const local: StorageArea;
    export const session: StorageArea;
    export const sync: StorageArea;
  }

  export namespace alarms {
    export interface AlarmCreateInfo {
      delayInMinutes?: number;
      periodInMinutes?: number;
      when?: number;
    }

    export interface Alarm {
      name: string;
      scheduledTime: number;
      periodInMinutes?: number;
    }

    export function create(name: string, alarmInfo: AlarmCreateInfo): void;
    export function clear(name: string): Promise<boolean>;
    export function get(name: string): Promise<Alarm | undefined>;
    export function getAll(): Promise<Alarm[]>;

    export const onAlarm: {
      addListener(callback: (alarm: Alarm) => void): void;
      removeListener(callback: (...args: any[]) => void): void;
    };
  }

  export namespace notifications {
    export interface NotificationOptions {
      type: 'basic' | 'image' | 'list' | 'progress';
      iconUrl?: string;
      title: string;
      message: string;
      contextMessage?: string;
      priority?: number;
      buttons?: Array<{ title: string; iconUrl?: string }>;
      requireInteraction?: boolean;
      silent?: boolean;
    }

    export function create(
      notificationId: string,
      options: NotificationOptions,
      callback?: (notificationId: string) => void
    ): Promise<string>;

    export function clear(notificationId: string): Promise<boolean>;

    export const onClicked: {
      addListener(callback: (notificationId: string) => void): void;
      removeListener(callback: (...args: any[]) => void): void;
    };
  }

  export namespace offscreen {
    export enum Reason {
      AUDIO_PLAYBACK = 'AUDIO_PLAYBACK',
    }

    export interface CreateDocumentOptions {
      url: string;
      reasons: Reason[];
      justification: string;
    }

    export function createDocument(options: CreateDocumentOptions): Promise<void>;
    export function closeDocument(): Promise<void>;
    export function hasDocument(): Promise<boolean>;
  }

  export namespace sidePanel {
    export interface PanelOptions {
      tabId?: number;
      path?: string;
      enabled?: boolean;
    }

    export interface GetPanelOptions {
      tabId?: number;
    }

    export interface PanelBehavior {
      openPanelOnActionClick?: boolean;
    }

    export interface OpenOptions {
      tabId?: number;
      windowId?: number;
    }

    export function open(options: OpenOptions): Promise<void>;
    export function setOptions(options: PanelOptions): Promise<void>;
    export function getOptions(options: GetPanelOptions): Promise<PanelOptions>;
    export function setPanelBehavior(behavior: PanelBehavior): Promise<void>;
    export function getPanelBehavior(): Promise<PanelBehavior>;
  }

  export namespace tabs {
    export interface Tab {
      id?: number;
      url?: string;
      title?: string;
      active?: boolean;
      windowId?: number;
    }

    export interface CreateProperties {
      url?: string;
      active?: boolean;
    }

    export interface QueryInfo {
      active?: boolean;
      currentWindow?: boolean;
      url?: string | string[];
    }

    export function create(createProperties: CreateProperties): Promise<Tab>;
    export function query(queryInfo: QueryInfo): Promise<Tab[]>;
    export function update(tabId: number, updateProperties: { active?: boolean; url?: string }): Promise<Tab>;
    export function highlight(highlightInfo: { tabs: number | number[]; windowId?: number }): Promise<any>;
    export function sendMessage<T = any, R = any>(
      tabId: number,
      message: T,
      options?: { frameId?: number }
    ): Promise<R>;
  }
}
