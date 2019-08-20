import * as pMap from 'p-map';
import { ClusterNode } from './cluster-node';
import { AddNodeOptions } from '@/typings';
import { Logger } from '@/utils/logger';

const logger = new Logger('Cluster');

export class Cluster {
  public nodes: ClusterNode[];

  private constructor(nodes: ClusterNode[]) {
    logger.log(`Cluster initialized with ${nodes.length} nodes`);
    this.nodes = nodes;
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

  public async addNode(
    host: string,
    port: number,
    options: AddNodeOptions = { forgetOnError: true }
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
    logger.log(`Adding new node ${host}:${port} to cluster nodes list`);
    const newNode = await ClusterNode.fromHostPort(host, port);
    this.nodes.push(newNode);
    logger.log(`Waiting for all nodes to finish their handshake process`);
    await pMap(this.nodes, (n) => n.waitForAllHandshakesToComplete(), { concurrency: 1 });
    logger.log(`Updating cluster view`);
    await pMap(this.nodes, (n) => n.updateClusterView());
    logger.log(`Successfully introduced node ${host}:${port} to the cluster`);
  }

  public async delNode(host: string, port: number) {
    const nodeToDelete = this.nodes.find((n) => n.host === host && n.port === port);
    logger.log(`Forgetting node ${host}:${port} from all existing nodes`);
    const otherNodes = this.nodes.filter((n) => n !== nodeToDelete);
    try {
      await pMap(otherNodes, (n) => n.forget(host, port), { stopOnError: false });
    } catch (err) {
      logger.error(`Received error while forgetting node ${host}:${port}`, err);
    }
    logger.log(`Forgot node ${host}:${port} from all existing nodes`);
    logger.log(`Removing node ${host}:${port} from cluster nodes list`);
    this.nodes = this.nodes.filter((n) => n !== nodeToDelete);
    if (nodeToDelete) {
      try {
        logger.log(`Disconnecting from old node ${host}:${port}`);
        await nodeToDelete.disconnect();
      } catch (err) {
        logger.error(`Received error while disconnecting from node ${host}:${port}`, err);
      }
    }
  }

  public async disconnect() {
    logger.log(`Disconnecting from all nodes`);
    await pMap(this.nodes, (n) => n.disconnect());
    logger.log(`Disconnected from all nodes`);
  }
}
