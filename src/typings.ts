export interface NormalSlots {
  [key: number]: true;
}

export interface ImportingSlots {
  [key: number]: string;
}

export interface MigratingSlots {
  [key: number]: string;
}

export interface AddNodeOptions {
  forgetOnError: boolean;
}

export const enum LinkState {
  connected = 'connected',
  disconnected = 'disconnected',
}
