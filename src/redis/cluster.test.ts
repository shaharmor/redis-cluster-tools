import * as execa from 'execa';
import { Cluster } from './cluster';

describe('Cluster', () => {
  beforeEach(async () => {
    jest.setTimeout(20000);
    await execa('npm', ['run', 'cluster:start']);
  });

  afterEach(async () => {
    jest.setTimeout(20000);
    await execa('npm', ['run', 'cluster:stop']);
  });

  describe('.addNode()', () => {
    it('adds the node to the .nodes property of the cluster', async () => {
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);
      expect(cluster.nodes.some((n) => n.host === '127.0.0.1' && n.port === 7004)).toEqual(false);
      await cluster.addNode('127.0.0.1', 7004);
      expect(cluster.nodes.some((n) => n.host === '127.0.0.1' && n.port === 7004)).toEqual(true);
    });

    it('makes all existing nodes in the cluster know the new node', async () => {
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);
      expect(cluster.nodes.some((n) => n.knowsNode('127.0.0.1', 7004))).toEqual(false);
      await cluster.addNode('127.0.0.1', 7004);
      expect(cluster.nodes.every((n) => n.knowsNode('127.0.0.1', 7004))).toEqual(true);
    });
  });

  describe('.delNode()', () => {
    it('removes a node from the .nodes property of the cluster', async () => {
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);
      expect(cluster.nodes.some((n) => n.host === '127.0.0.1' && n.port === 7003)).toEqual(true);
      await cluster.delNode('127.0.0.1', 7003);
      expect(cluster.nodes.some((n) => n.host === '127.0.0.1' && n.port === 7003)).toEqual(false);
    });

    it('makes all remaining nodes in the cluster forget the old node', async () => {
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);
      expect(cluster.nodes.every((n) => n.knowsNode('127.0.0.1', 7003))).toEqual(true);
      await cluster.delNode('127.0.0.1', 7003);
      expect(cluster.nodes.some((n) => n.knowsNode('127.0.0.1', 7003))).toEqual(false);
    });
  });
});
