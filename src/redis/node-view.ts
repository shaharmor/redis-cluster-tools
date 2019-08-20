import { ImportingSlots, LinkState, MigratingSlots, NormalSlots } from '@/typings';

const NODE_INFO_REGEX = /(?<id>[a-z0-9]+)\s(?<host>\d+\.\d+\.\d+\.\d+)?:(?<port>\d+)(@(?<clusterPort>\d+))?\s(?<flags>[^\s]+)\s(?<masterId>[a-z0-9-]+)\s(?<pingSent>\d+)\s(?<pingRecv>\d+)\s(?<configEpoch>\d+)\s(?<linkState>[a-z]+)(\s(?<slots>.+))?/;

const mapSlots = (slots: string[]) => {
  const mappedSlots = {
    own: {} as NormalSlots,
    importing: {} as ImportingSlots,
    migrating: {} as MigratingSlots,
  };

  for (const slotOrRange of slots) {
    // importing / migrating
    if (slotOrRange.startsWith('[')) {
      const slot = parseInt(slotOrRange.slice(1, slotOrRange.indexOf('-')), 10);
      const nodeId = slotOrRange.slice(slotOrRange.indexOf('-') + 3, -1);
      if (slotOrRange.includes('-<-')) {
        mappedSlots.importing[slot] = nodeId;
      } else {
        mappedSlots.migrating[slot] = nodeId;
      }
    }
    // range
    else if (slotOrRange.includes('-')) {
      const [start, end] = slotOrRange.split('-');
      for (let slot = Number(start); slot <= Number(end); slot += 1) {
        mappedSlots.own[slot] = true;
      }
    }
    // single
    else {
      const slot = parseInt(slotOrRange, 10);
      mappedSlots.own[slot] = true;
    }
  }
  return mappedSlots;
};

export class NodeView {
  public readonly id: string;
  public readonly host: string;
  public readonly port: number;
  public readonly flags: string;
  public readonly masterId: string;
  public readonly linkState: LinkState;
  public readonly slots: NormalSlots;
  public readonly importingSlots: ImportingSlots;
  public readonly migratingSlots: MigratingSlots;

  constructor(nodeInfo: string) {
    const parsed = NODE_INFO_REGEX.exec(nodeInfo);
    if (!parsed) {
      throw new Error(`Could not parse node info: ${nodeInfo}`);
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    const { id, host, port, flags, masterId, linkState, slots } = parsed.groups;
    const mappedSlots = mapSlots(slots ? slots.split(' ') : []);
    this.id = id;
    this.host = host;
    this.port = +port;
    this.flags = flags;
    this.masterId = masterId;
    this.linkState = linkState as LinkState;
    this.slots = mappedSlots.own;
    this.importingSlots = mappedSlots.importing;
    this.migratingSlots = mappedSlots.migrating;
  }
}
