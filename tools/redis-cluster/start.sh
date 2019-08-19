#!/bin/bash

redis_conf() {
  cat <<-EOF
bind 127.0.0.1
protected-mode yes
port 700$1
cluster-enabled yes
save ""
appendonly no
daemonize yes
pidfile /tmp/redis-700$1.pid
logfile /tmp/redis-700$1.log
cluster-config-file /tmp/nodes-700$1.conf
EOF
}

# start the cluster nodes
for i in {1..4}
do
  rm /tmp/redis-700$i.pid /tmp/redis-700$i.log /tmp/nodes-700$i.conf
  redis_conf $i | redis-server -
done

sleep 3

# create cluster
redis-cli --cluster create 127.0.0.1:7001 127.0.0.1:7002 127.0.0.1:7003 --cluster-replicas 0 --cluster-yes
