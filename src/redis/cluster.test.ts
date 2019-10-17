import * as execa from 'execa';
import * as pMap from 'p-map';
import * as pTimes from 'p-times';
import * as cryptoRandomString from 'crypto-random-string';
import { Cluster } from './cluster';
import * as slotToKey from '../slot-to-key.json';

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
      await cluster.addNode('127.0.0.1', 7004);
      expect(cluster.nodes.some((n) => n.host === '127.0.0.1' && n.port === 7004)).toEqual(true);
      await cluster.delNode('127.0.0.1', 7004);
      expect(cluster.nodes.some((n) => n.host === '127.0.0.1' && n.port === 7004)).toEqual(false);
    });

    it('makes all remaining nodes in the cluster forget the old node', async () => {
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);
      await cluster.addNode('127.0.0.1', 7004);
      expect(cluster.nodes.every((n) => n.knowsNode('127.0.0.1', 7004))).toEqual(true);
      await cluster.delNode('127.0.0.1', 7004);
      expect(cluster.nodes.some((n) => n.knowsNode('127.0.0.1', 7004))).toEqual(false);
    });

    it('does not forget a node that owns slots', async () => {
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);
      expect(cluster.nodes.every((n) => n.knowsNode('127.0.0.1', 7003))).toEqual(true);
      await cluster.delNode('127.0.0.1', 7003);
      expect(cluster.nodes.some((n) => n.host === '127.0.0.1' && n.port === 7003)).toEqual(true);
      expect(cluster.nodes.every((n) => n.knowsNode('127.0.0.1', 7003))).toEqual(true);
    });

    it('forgets a node that owns slots - with options.rebalance', async () => {
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);
      expect(cluster.nodes.every((n) => n.knowsNode('127.0.0.1', 7003))).toEqual(true);
      await cluster.delNode('127.0.0.1', 7003, { rebalance: true });
      expect(cluster.nodes.some((n) => n.knowsNode('127.0.0.1', 7003))).toEqual(false);
    });
  });

  describe('.moveSlot()', () => {
    it('moves a slot from one node to the other', async () => {
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);
      const keysToMove = ['key1{somekey}', 'key2{somekey}', 'key3{somekey}'];
      const slotToMove = 11058;
      const currentOwner = cluster.nodes.find((n) => n.ownSlots.has(slotToMove));
      if (!currentOwner) {
        throw new Error(`Could not find an owner for slot ${slotToMove}`);
      }
      const newOwner = cluster.nodes.find(
        (n) => n.host !== currentOwner.host || n.port !== currentOwner.port
      );
      if (!newOwner) {
        throw new Error(`Could not find a new owner`);
      }
      await pMap(keysToMove, (key) => currentOwner.redis.set(key, 1));
      expect(currentOwner.ownSlots.has(slotToMove)).toEqual(true);
      expect(newOwner.ownSlots.has(slotToMove)).toEqual(false);
      await cluster.moveSlot(
        currentOwner.host,
        currentOwner.port,
        newOwner.host,
        newOwner.port,
        slotToMove
      );
      await cluster.refresh();
      expect(currentOwner.ownSlots.has(slotToMove)).toEqual(false);
      expect(newOwner.ownSlots.has(slotToMove)).toEqual(true);
      expect(
        cluster.nodes.every((n) => {
          const node = n.nodes.find((k) => k.ownSlots.has(slotToMove));
          return node && node.id === newOwner.id;
        })
      ).toEqual(true);
    });

    it('moves two slots from two nodes to another', async () => {
      jest.setTimeout(100000000);
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);

      const source1 = cluster.nodes[0];
      const source2 = cluster.nodes[1];
      const target = cluster.nodes[2];

      const randomSlotIndexFromSource1 = Math.floor(Math.random() * source1.ownSlots.size);
      const randomSlotIndexFromSource2 = Math.floor(Math.random() * source2.ownSlots.size);
      const slotFromSource1 = Array.from(source1.ownSlots)[randomSlotIndexFromSource1];
      const slotFromSource2 = Array.from(source2.ownSlots)[randomSlotIndexFromSource2];
      const keyForSource1 = (slotToKey as { [key: number]: string })[slotFromSource1];
      const keyForSource2 = (slotToKey as { [key: number]: string })[slotFromSource2];

      // load data
      await Promise.all([
        pTimes(
          1000000,
          (i) =>
            source1.redis.set(`key{${keyForSource1}}${i}`, cryptoRandomString({ length: 500 })),
          { concurrency: 20 }
        ),
        pTimes(
          1000000,
          (i) =>
            source2.redis.set(`key{${keyForSource2}}${i}`, cryptoRandomString({ length: 500 })),
          { concurrency: 20 }
        ),
      ]);
      expect(source1.ownSlots.has(slotFromSource1)).toEqual(true);
      expect(source2.ownSlots.has(slotFromSource2)).toEqual(true);
      expect(target.ownSlots.has(slotFromSource1)).toEqual(false);
      expect(target.ownSlots.has(slotFromSource2)).toEqual(false);

      const parallel = true;
      if (!parallel) {
        await cluster.moveSlot(
          source1.host,
          source1.port,
          target.host,
          target.port,
          slotFromSource1
        );
        await cluster.moveSlot(
          source2.host,
          source2.port,
          target.host,
          target.port,
          slotFromSource2
        );
      } else {
        await Promise.all([
          cluster.moveSlot(source1.host, source1.port, target.host, target.port, slotFromSource1),
          cluster.moveSlot(source2.host, source2.port, target.host, target.port, slotFromSource2),
        ]);
      }
      await cluster.refresh();
      expect(source1.ownSlots.has(slotFromSource1)).toEqual(false);
      expect(source2.ownSlots.has(slotFromSource2)).toEqual(false);
      expect(target.ownSlots.has(slotFromSource1)).toEqual(true);
      expect(target.ownSlots.has(slotFromSource2)).toEqual(true);
      expect(
        cluster.nodes.every((n) => {
          const node = n.nodes.find((k) => k.ownSlots.has(slotFromSource1));
          return node && node.id === target.id;
        })
      ).toEqual(true);
      expect(
        cluster.nodes.every((n) => {
          const node = n.nodes.find((k) => k.ownSlots.has(slotFromSource2));
          return node && node.id === target.id;
        })
      ).toEqual(true);
    });
  });

  describe('.rebalance()', () => {
    it('3 -> 4', async () => {
      jest.setTimeout(1000000);
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);
      await cluster.addNode('127.0.0.1', 7004);
      expect(cluster.nodes[0].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[1].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[2].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[3].ownSlots.size).toEqual(0);
      await cluster.rebalance();
      await cluster.refresh();
      expect(cluster.nodes[0].ownSlots.size).toEqual(4096);
      expect(cluster.nodes[1].ownSlots.size).toEqual(4096);
      expect(cluster.nodes[2].ownSlots.size).toEqual(4096);
      expect(cluster.nodes[3].ownSlots.size).toEqual(4096);
    });

    it('3 -> 5', async () => {
      jest.setTimeout(1000000);
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);
      await cluster.addNode('127.0.0.1', 7004);
      await cluster.addNode('127.0.0.1', 7005);
      expect(cluster.nodes[0].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[1].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[2].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[3].ownSlots.size).toEqual(0);
      expect(cluster.nodes[4].ownSlots.size).toEqual(0);
      await cluster.rebalance();
      await cluster.refresh();
      expect(cluster.nodes[0].ownSlots.size).toEqual(3277);
      expect(cluster.nodes[1].ownSlots.size).toEqual(3277);
      expect(cluster.nodes[2].ownSlots.size).toEqual(3277);
      expect(cluster.nodes[3].ownSlots.size).toEqual(3277);
      expect(cluster.nodes[4].ownSlots.size).toEqual(3276);
    });

    it('3 -> 6', async () => {
      jest.setTimeout(1000000);
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);
      await cluster.addNode('127.0.0.1', 7004);
      await cluster.addNode('127.0.0.1', 7005);
      await cluster.addNode('127.0.0.1', 7006);
      expect(cluster.nodes[0].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[1].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[2].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[3].ownSlots.size).toEqual(0);
      expect(cluster.nodes[4].ownSlots.size).toEqual(0);
      expect(cluster.nodes[5].ownSlots.size).toEqual(0);
      await cluster.rebalance();
      await cluster.refresh();
      expect(cluster.nodes[0].ownSlots.size).toEqual(2731);
      expect(cluster.nodes[1].ownSlots.size).toEqual(2731);
      expect(cluster.nodes[2].ownSlots.size).toEqual(2731);
      expect(cluster.nodes[3].ownSlots.size).toEqual(2731);
      expect(cluster.nodes[4].ownSlots.size).toEqual(2730);
      expect(cluster.nodes[5].ownSlots.size).toEqual(2730);
    });

    it('keeps empty excluded nodes empty', async () => {
      jest.setTimeout(1000000);
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);
      await cluster.addNode('127.0.0.1', 7004);
      await cluster.addNode('127.0.0.1', 7005);
      expect(cluster.nodes[0].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[1].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[2].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[3].ownSlots.size).toEqual(0);
      expect(cluster.nodes[4].ownSlots.size).toEqual(0);
      await cluster.rebalance({ exclude: [{ host: '127.0.0.1', port: 7005 }] });
      await cluster.refresh();
      expect(cluster.nodes[0].ownSlots.size).toEqual(4096);
      expect(cluster.nodes[1].ownSlots.size).toEqual(4096);
      expect(cluster.nodes[2].ownSlots.size).toEqual(4096);
      expect(cluster.nodes[3].ownSlots.size).toEqual(4096);
      expect(cluster.nodes[4].ownSlots.size).toEqual(0);
    });

    it('empties excluded nodes with slots', async () => {
      jest.setTimeout(1000000);
      const cluster = await Cluster.initFromHostPort('127.0.0.1', 7001);
      await cluster.addNode('127.0.0.1', 7004);
      await cluster.addNode('127.0.0.1', 7005);
      expect(cluster.nodes[0].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[1].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[2].ownSlots.size).toBeGreaterThanOrEqual(5461);
      expect(cluster.nodes[3].ownSlots.size).toEqual(0);
      expect(cluster.nodes[4].ownSlots.size).toEqual(0);
      await cluster.rebalance({ exclude: [{ host: '127.0.0.1', port: 7001 }] });
      await cluster.refresh();
      expect(cluster.nodes[0].ownSlots.size).toEqual(0);
      expect(cluster.nodes[1].ownSlots.size).toEqual(4096);
      expect(cluster.nodes[2].ownSlots.size).toEqual(4096);
      expect(cluster.nodes[3].ownSlots.size).toEqual(4096);
      expect(cluster.nodes[4].ownSlots.size).toEqual(4096);
    });
  });
});
