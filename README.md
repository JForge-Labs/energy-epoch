# Energy Epoch

Factorio-style energy ops on a **$5M credit facility**. Build **roads** from wells to **tank batteries** to the **refinery**. Wildcat with simple random outcomes. Pay interest, protect reputation, operate in the green.

## Run

```bash
cd energy-epoch
npm install
npm run dev
```

## Start package (financed)

- $5,000,000 debt @ ~11% APR
- ~$800k working cash
- 1 well pad, 1 tank battery, 1 truck, refinery throughput slot, drill rig

## Loop

1. **Road**-connect pad → battery → refinery (trucks only drive roads).
2. **Drill** the pad (or elsewhere). Duster or ripper — random IP + decline.
3. Hit → pumpjack + wellhead tank. Trucks: wellhead → battery → refinery (slot capped).
4. Gas flares until **gas line**. Low **rep** → fines + blocked special permits.
5. **Pay debt** / grow borrowing base with assets + rep. Goal: green ops, clear the facility.

## Later

Pipelines, pumps, compression, gas plants that buy commodities.
