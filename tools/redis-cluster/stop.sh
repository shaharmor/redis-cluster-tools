#!/bin/bash

# kill old instances
for i in {1..6}
do
  kill "$(cat /tmp/redis-700$i.pid)"
  rm /tmp/redis-700$i.pid /tmp/redis-700$i.log /tmp/nodes-700$i.conf
done
