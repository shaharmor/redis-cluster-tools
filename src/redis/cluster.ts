import * as pMap from 'p-map';
import PQueue from 'p-queue';
import { ClusterNode } from './cluster-node';
import { AddNodeCommandOptions, DelNodeCommandOptions, RebalanceCommandOptions } from '@/typings';
import { Logger } from '@/utils/logger';

const logger = new Logger('Cluster');

export class Cluster {
  public static readonly SLOTS_COUNT = 16384;
  public nodes: ClusterNode[];
  private slotsUpdateQueue: PQueue;

  public get masterNodes() {
    return this.nodes.filter((n) => n.isMaster());
  }

  private constructor(nodes: ClusterNode[]) {
    logger.log(`Cluster initialized with ${nodes.length} nodes`);
    this.nodes = nodes;
    this.slotsUpdateQueue = new PQueue({ concurrency: 1 });
  }

  public static async initFromHostPort(host: string, port: number) {
    logger.log(`Initializing cluster from node ${host}:${port}`);
    const node = await ClusterNode.fromHostPort(host, port);
    const healthyNodes = node.getHealthyNodes();
    const otherHealthyNodes = healthyNodes.filter((n) => n.id !== node.id);
    // TODO: what if we timeout during connection to one of the nodes?
    const otherNodes = await pMap(otherHealthyNodes, (n) =>
      ClusterNode.fromHostPort(n.host, n.port)
    );
    return new Cluster([node, ...otherNodes]);
  }

  public async refresh() {
    await pMap(this.nodes, (n) => n.updateClusterView());
  }

  public async addNode(
    host: string,
    port: number,
    options: AddNodeCommandOptions = { forgetOnError: true }
  ) {
    const nodeExists = this.nodes.some((n) => n.host === host && n.port === port);
    if (nodeExists) {
      logger.warn(`Node ${host}:${port} already exists in the cluster`);
      return;
    }
    logger.log(`Introducing new node ${host}:${port} to all existing nodes`);
    try {
      await pMap(this.nodes, (n) => n.meet(host, port), { concurrency: 1 });
    } catch (meetErr) {
      logger.error(`Received error while introducing node ${host}:${port}`, meetErr);
      if (options.forgetOnError) {
        logger.log(`Forgetting node ${host}:${port} from all existing nodes`);
        try {
          await pMap(this.nodes, (n) => n.forget(host, port), { stopOnError: false });
          await pMap(this.nodes, (n) => n.updateClusterView(), { stopOnError: false });
        } catch (forgetErr) {
          logger.error(`Received error while forgetting node ${host}:${port}`, forgetErr);
        }
      }
      return;
    }

    // TODO: replace manually adding new node with automatically updating nodes list
    logger.log(`Adding new node ${host}:${port} to cluster nodes list`);
    const newNode = await ClusterNode.fromHostPort(host, port);
    this.nodes.push(newNode);
    logger.log(`Waiting for all nodes to finish their handshake process`);
    await pMap(this.nodes, (n) => n.waitForAllHandshakesToComplete(), { concurrency: 1 });
    logger.log(`Updating cluster view`);
    await pMap(this.nodes, (n) => n.updateClusterView());
    logger.log(`Successfully introduced node ${host}:${port} to the cluster`);
  }

  public async delNode(
    host: string,
    port: number,
    options: DelNodeCommandOptions = { rebalance: false }
  ) {
    const nodeToDelete = this.findNode(host, port);
    if (nodeToDelete.ownSlots.size > 0) {
      if (!options.rebalance) {
        // TODO: should throw?
        logger.warn(`Cannot forget node ${host}:${port} because it owns slots`);
        return;
      }
      logger.log(`Emptying node ${host}:${port} before forgetting`);
      await this.rebalance({ exclude: [{ host, port }] });
    }
    logger.log(`Forgetting node ${host}:${port} from all existing nodes`);
    const otherNodes = this.nodes.filter((n) => n !== nodeToDelete);
    try {
      await pMap(otherNodes, (n) => n.forget(host, port), { stopOnError: false });
    } catch (err) {
      logger.error(`Received error while forgetting node ${host}:${port}`, err);
      return;
    }
    logger.log(`Forgot node ${host}:${port} from all existing nodes`);
    logger.log(`Removing node ${host}:${port} from cluster nodes list`);
    this.nodes = this.nodes.filter((n) => n !== nodeToDelete);
    try {
      logger.log(`Resetting old node`);
      await nodeToDelete.reset();
      logger.log(`Disconnecting from old node ${host}:${port}`);
      await nodeToDelete.disconnect();
    } catch (err) {
      logger.error(`Received error while disconnecting from node ${host}:${port}`, err);
    }
  }

  public async moveSlot(
    fromHost: string,
    fromPort: number,
    toHost: string,
    toPort: number,
    slot: number
  ) {
    // TODO: on error, mark all slots as stable
    const fromNode = this.findNode(fromHost, fromPort);
    const toNode = this.findNode(toHost, toPort);
    await this.slotsUpdateQueue.add(async () => {
      await toNode.setSlotState(slot, 'IMPORTING', fromNode.id);
      await fromNode.setSlotState(slot, 'MIGRATING', toNode.id);
    });
    await fromNode.migrateKeysInSlot(toHost, toPort, slot);
    await this.slotsUpdateQueue.add(async () => {
      await pMap(this.masterNodes, (n) => n.setSlotState(slot, 'NODE', toNode.id), {
        concurrency: 1,
      });
    });
  }

  public async rebalance(options: RebalanceCommandOptions = {}) {
    const balances = this.masterNodes.map((node) => {
      const excluded =
        options.exclude &&
        options.exclude.find((hp) => hp.host === node.host && hp.port === node.port);
      return {
        node,
        balance: 0,
        excluded,
      };
    });

    const numberOfIncludedNodes = balances.filter((b) => !b.excluded).length;
    const slotsPerNode = Math.floor(Cluster.SLOTS_COUNT / numberOfIncludedNodes);
    const remainingSlots = Cluster.SLOTS_COUNT - slotsPerNode * numberOfIncludedNodes;

    // allocate all the slots evenly
    balances.forEach((b, i) => {
      const numOfOwnSlots = b.node.ownSlots.size;
      if (b.excluded) {
        // eslint-disable-next-line no-param-reassign
        b.balance = numOfOwnSlots;
        return;
      }
      let slotsThisNodeShouldOwn = slotsPerNode;
      if (i + 1 <= remainingSlots) {
        slotsThisNodeShouldOwn += 1;
      }
      // eslint-disable-next-line no-param-reassign
      b.balance = numOfOwnSlots - slotsThisNodeShouldOwn;
    });
    const sources = balances.filter((m) => m.balance > 0);
    const targets = balances.filter((m) => m.balance < 0);
    sources.sort((a, b) => b.balance - a.balance);
    targets.sort((a, b) => b.balance - a.balance);
    const allocations = new Map<[ClusterNode, ClusterNode], number[]>();
    for (let slot = 0; slot < Cluster.SLOTS_COUNT; slot += 1) {
      const source = sources.find((s) => s.balance > 0 && s.node.ownSlots.has(slot));
      if (!source) {
        continue;
      }
      const target = targets.find((t) => t.balance < 0);
      if (!target) {
        throw new Error('Have slot to move without a target');
      }
      const pair = [source.node, target.node] as [ClusterNode, ClusterNode];
      let slots = allocations.get(pair) || [];
      if (!slots) {
        slots = [];
      }
      slots.push(slot);
      // eslint-disable-next-line no-param-reassign
      source.balance -= 1;
      // eslint-disable-next-line no-param-reassign
      target.balance += 1;
      allocations.set(pair, slots);
    }
    await pMap(
      allocations,
      (a) => {
        const [[source, target], slots] = a;
        return pMap(slots, (slot) =>
          this.moveSlot(source.host, source.port, target.host, target.port, slot)
        );
      },
      { concurrency: 2 }
    );
  }

  public async disconnect() {
    logger.log(`Disconnecting from all nodes`);
    await pMap(this.nodes, (n) => n.disconnect());
    logger.log(`Disconnected from all nodes`);
  }

  private findNode(host: string, port: number) {
    const node = this.nodes.find((n) => n.host === host && n.port === port);
    if (!node) {
      logger.warn(`Could not find "to" node ${host}:${port}`);
      throw new Error(`Could not find "to" node ${host}:${port}`);
    }
    return node;
  }
}
