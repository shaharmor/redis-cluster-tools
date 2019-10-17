import * as Redis from 'ioredis';
import delay from 'delay';
import { NodeView } from './node-view';
import { Logger } from '@/utils/logger';

export class ClusterNode {
  public readonly host: string;
  public readonly port: number;
  public readonly redis: Redis.Redis;
  public nodes: NodeView[];
  private myself!: NodeView;
  private logger: Logger;

  public get id(): string {
    return this.myself.id;
  }

  public get ownSlots() {
    return this.myself.ownSlots;
  }

  public isMaster() {
    return this.myself.flags.includes('master');
  }

  public static async fromHostPort(host: string, port: number) {
    const node = new ClusterNode(host, port);
    await node.updateClusterView();
    return node;
  }

  public async meet(host: string, port: number) {
    // we don't want to "meet" nodes that we already know and are connected to
    // to avoid a known bug that shows the same node listed twice
    // ref: https://github.com/antirez/redis/issues/5711
    const knowsNode = this.nodes.some((n) => n.host === host && n.port === port);
    if (knowsNode) {
      this.logger.log(`Skipping handshake process with known node ${host}:${port}`);
      return;
    }
    this.logger.log(`Starting handshake process with ${host}:${port}`);
    await this.redis.cluster('MEET', host, port);
    this.logger.log(`Started handshake process with ${host}:${port}`);
  }

  public async forget(host: string, port: number) {
    const node = this.nodes.find((n) => n.host === host && n.port === port);
    if (!node) {
      this.logger.warn(`Could not find node ${host}:${port}`);
      return;
    }
    const nodeId = node.id;
    this.logger.log(`Forgetting node ${host}:${port}`);
    await this.redis.cluster('FORGET', nodeId);
    await this.updateClusterView();
    this.logger.log(`Forgot node ${host}:${port}`);
  }

  public async migrateKeysInSlot(
    toHost: string,
    toPort: number,
    slot: number,
    pipeline = 20,
    timeout = 5000
  ) {
    let keys: string[];
    do {
      keys = await this.redis.cluster('GETKEYSINSLOT', slot, pipeline);
      if (keys.length > 0) {
        await this.redis.migrate(toHost, toPort, '', 0, timeout, 'REPLACE', 'KEYS', ...keys);
      }
    } while (keys.length > 0);
  }

  public async setSlotState(
    slot: number,
    type: 'IMPORTING' | 'MIGRATING' | 'NODE',
    nodeId: string
  ) {
    // TODO: update internal slot mapping!
    return this.redis.cluster('SETSLOT', slot, type, nodeId);
  }

  public async reset() {
    return this.redis.cluster('RESET', 'SOFT');
  }

  public async disconnect() {
    return this.redis.quit();
  }

  public async waitForAllHandshakesToComplete() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await this.updateClusterView();
      const handshakeInProgress = this.nodes.some((n) => n.flags.includes('handshake'));
      if (!handshakeInProgress) {
        break;
      }
      await delay(100);
    }
  }

  public getHealthyNodes() {
    return this.nodes.filter((n) => !n.flags.includes('fail'));
  }

  public knowsNode(host: string, port: number) {
    return this.nodes.some((n) => n.host === host && n.port === port);
  }

  public async updateClusterView() {
    const clusterNodesOutput: string = await this.redis.cluster('nodes');
    this.nodes = clusterNodesOutput
      .split('\n')
      .filter((l) => l)
      .map((line) => new NodeView(line));
    this.myself = this.nodes.find((n) => n.flags.includes('myself')) as NodeView;
  }

  private constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
    this.nodes = [];
    this.redis = new Redis({ host, port });
    this.logger = new Logger(`Node (${host}:${port})`);
  }
}
