import { NodeView } from '@/redis/node-view';
import { LinkState } from '@/typings';

describe('NodeView', () => {
  describe('ctor', () => {
    const nodeInfos = [
      {
        // no slots
        input:
          '292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f 127.0.0.1:7000 master - 0 1426238317239 4 connected',
        output: {
          id: '292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f',
          host: '127.0.0.1',
          port: 7000,
          flags: 'master',
          linkState: LinkState.connected,
          ownSlots: new Set(),
          importingSlots: new Map(),
          migratingSlots: new Map(),
          masterId: '-',
        },
      },
      {
        // fail? flag
        input:
          '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1 127.0.0.1:7000 master,fail? - 0 1426238316232 2 connected',
        output: {
          id: '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1',
          host: '127.0.0.1',
          port: 7000,
          flags: 'master,fail?',
          linkState: LinkState.connected,
          ownSlots: new Set(),
          importingSlots: new Map(),
          migratingSlots: new Map(),
          masterId: '-',
        },
      },
      {
        // fail flag
        input:
          '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1 127.0.0.1:7000 master,fail - 0 1426238316232 2 connected',
        output: {
          id: '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1',
          host: '127.0.0.1',
          port: 7000,
          flags: 'master,fail',
          linkState: LinkState.connected,
          ownSlots: new Set(),
          importingSlots: new Map(),
          migratingSlots: new Map(),
          masterId: '-',
        },
      },
      {
        // handshake flag
        input:
          '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1 127.0.0.1:7000 master,handshake - 0 1426238316232 2 connected',
        output: {
          id: '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1',
          host: '127.0.0.1',
          port: 7000,
          flags: 'master,handshake',
          linkState: LinkState.connected,
          ownSlots: new Set(),
          importingSlots: new Map(),
          migratingSlots: new Map(),
          masterId: '-',
        },
      },
      {
        // singe slot
        input:
          '292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f 127.0.0.1:7000 master - 0 1426238316232 2 connected 5000',
        output: {
          id: '292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f',
          host: '127.0.0.1',
          port: 7000,
          flags: 'master',
          linkState: LinkState.connected,
          ownSlots: new Set([5000]),
          importingSlots: new Map(),
          migratingSlots: new Map(),
          masterId: '-',
        },
      },
      {
        // slot range
        input:
          '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1 127.0.0.1:7000 master - 0 1426238316232 2 connected 0-3',
        output: {
          id: '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1',
          host: '127.0.0.1',
          port: 7000,
          flags: 'master',
          linkState: LinkState.connected,
          ownSlots: new Set([0, 1, 2, 3]),
          masterId: '-',
        },
      },
      {
        // multiple slot ranges
        input:
          '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1 127.0.0.1:7000 master - 0 1426238316232 2 connected 0 100 300-301 400 501-503',
        output: {
          id: '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1',
          host: '127.0.0.1',
          port: 7000,
          flags: 'master',
          linkState: LinkState.connected,
          ownSlots: new Set([0, 100, 300, 301, 400, 501, 502, 503]),
          importingSlots: new Map(),
          migratingSlots: new Map(),
          masterId: '-',
        },
      },
      {
        // importing slot
        input:
          '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1 127.0.0.1:7000 master - 0 1426238316232 2 connected [100-<-292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f]',
        output: {
          id: '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1',
          host: '127.0.0.1',
          port: 7000,
          flags: 'master',
          linkState: LinkState.connected,
          ownSlots: new Set(),
          importingSlots: new Map([[100, '292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f']]),
          migratingSlots: new Map(),
          masterId: '-',
        },
      },
      {
        // own slot + importing slot
        input:
          '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1 127.0.0.1:7000 master - 0 1426238316232 2 connected 30 100 [100-<-292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f]',
        output: {
          id: '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1',
          host: '127.0.0.1',
          port: 7000,
          flags: 'master',
          linkState: LinkState.connected,
          ownSlots: new Set([30, 100]),
          importingSlots: new Map([[100, '292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f']]),
          masterId: '-',
        },
      },
      {
        // migrating slot
        input:
          '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1 127.0.0.1:7000 master - 0 1426238316232 2 connected [100->-292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f]',
        output: {
          id: '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1',
          host: '127.0.0.1',
          port: 7000,
          flags: 'master',
          linkState: LinkState.connected,
          ownSlots: new Set(),
          importingSlots: new Map(),
          migratingSlots: new Map([[100, '292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f']]),
          masterId: '-',
        },
      },
      {
        // own slot + migrating slot
        input:
          '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1 127.0.0.1:7000 master - 0 1426238316232 2 connected 100 [100->-292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f]',
        output: {
          id: '67ed2db8d677e59ec4a4cefb06858cf2a1a89fa1',
          host: '127.0.0.1',
          port: 7000,
          flags: 'master',
          linkState: LinkState.connected,
          ownSlots: new Set([100]),
          importingSlots: new Map(),
          migratingSlots: new Map([[100, '292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f']]),
          masterId: '-',
        },
      },
    ];

    nodeInfos.forEach((item, index) => {
      it(`parses redis node info - ${index}`, () => {
        const node = new NodeView(item.input);
        for (const [key, value] of Object.entries(item.output)) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
          // @ts-ignore
          expect(node[key]).toEqual(value);
        }
      });
    });
  });
});
