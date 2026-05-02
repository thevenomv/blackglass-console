# Collector fleet — cost & scaling notes

BLACKGLASS collectors use **SSH** from the Node runtime (**`ssh2`**) subject to **`collectorMaxParallelSsh`** (**`collector-env`**). Each host handshake consumes app CPU and egress bandwidth.

## Sizing axes

| Concern | Knob |
|--------|-----|
| Concurrency ceiling | **`COLLECTOR_MAX_PARALLEL_SSH`** (or derive from plan) |
| Wall-clock per fleet scan | **`async-pool`** + timeout in **`collect.ts`** |
| Egress IPs | Restrict target host **firewalls** to DO App Platform egress CIDR lists or static egress add-on |

## Scaling patterns

1. **Vertical**: larger DO instance_slug before parallelism — avoids SSH thundering herds on small CPUs.  
2. **Regional**: collectors near fleets (latency); avoid cross-region SSH when possible.  
3. **Queue externalization** (later): enqueue host IDs → worker fleet; dashboard stays stateless HTTP.

Revisit **pricing** when average scan duration × host count threatens SLO (**`< 120s`** p95 as an internal baseline).
