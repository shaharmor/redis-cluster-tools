export interface AddNodeCommandOptions {
  forgetOnError: boolean;
}

export interface DelNodeCommandOptions {
  rebalance: boolean;
}

export interface RebalanceCommandOptions {
  exclude?: NodeHostPort[];
}

export interface NodeHostPort {
  host: string;
  port: number;
}

export const enum LinkState {
  connected = 'connected',
  disconnected = 'disconnected',
}
