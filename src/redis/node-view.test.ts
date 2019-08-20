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
          slots: {},
          importingSlots: {},
          migratingSlots: {},
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
          slots: {},
          importingSlots: {},
          migratingSlots: {},
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
          slots: {},
          importingSlots: {},
          migratingSlots: {},
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
          slots: {},
          importingSlots: {},
          migratingSlots: {},
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
          slots: {
            5000: true,
          },
          importingSlots: {},
          migratingSlots: {},
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
          slots: {
            0: true,
            1: true,
            2: true,
            3: true,
          },
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
          slots: {
            0: true,
            100: true,
            300: true,
            301: true,
            400: true,
            501: true,
            502: true,
            503: true,
          },
          importingSlots: {},
          migratingSlots: {},
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
          slots: {},
          importingSlots: {
            100: '292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f',
          },
          migratingSlots: {},
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
          slots: {
            30: true,
            100: true,
          },
          importingSlots: {
            100: '292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f',
          },
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
          slots: {},
          importingSlots: {},
          migratingSlots: {
            100: '292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f',
          },
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
          slots: {
            100: true,
          },
          importingSlots: {},
          migratingSlots: {
            100: '292f8b365bb7edb5e285caf0b7e6ddc7265d2f4f',
          },
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
