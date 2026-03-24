# Changelog
This file records the changes to FishBot over time.


## Fishbot v0.3.1
### Changes in v0.3.1
- Significantly reduced lag spikes.
- AI behaviour
    - Improved VTOL avoidance of anti-air defences.
    - Added VTOL saturation attack (a large wave of VTOLs will attack many factories simultaneously).
    - Improved truck danger avoidance.  
    - Ground units now use Heavy Cannon to bridge the tech-gap between Assault Cannon and Twin Assault Cannon.
    - Anti-air units now focus fire on a single target.
- Internal changes
    - Packaged bot files nicely for ease of import.
    - Centralised core game data, making the bot behaviour easier to change.
    - Added system docs (in `.\docs`) & jsdocs (throughout the code).


#### Test results (Warzone 2100 v4.6.3)
- 62 / 100 = **62%** win rate: FishBot-v0.3.1 Medium vs Cobra Hard (Gamma 3P T2 - 1v1)
- 149 / 150 = **99%** win rate: FishBot-v0.3.1 Medium vs Cobra Medium (Gamma 3P T2 - 1v1)

## Fishbot v3 (v0.3.0)
### Changes in v0.3.0
- AI behaviour
    - Significant improvements in capturing oil.
    - Significant improvements in VTOL targeting and handling.
- Architecture
    - Infrastructure ugprade (common world state, grouping system, centralised TOC)

#### Test results (Warzone 2100 v4.6.3)
- 63 / 86 = **73%** win rate: FishBot-v3 Medium vs Cobra Hard (Gamma 3P T2 - 1v1)
- 98 / 100 = **98%** win rate: FishBot-v3 Medium vs Cobra Medium (Gamma 3P T2 - 1v1)

## Fishbot v2 (v0.2.0)
### Changes in v0.2.0
- AI behaviour
    - Refined build order
    - Added centralised command & control (c2.js)
    - Improved unit cohesion (uses median of group position)
    - Implemented basic greedy approach to research (ignores rockets, flamers & defensive structures)
- Architecture
    - Removed various unused code from NullBot.

#### Test results (Warzone 2100 v4.6.1)
- **100%** win rate: Fishbot-v2 Medium vs Cobra Medium (Gamma 3P T2 - 1v1)


## Fishbot v1 (v0.1.0)
### Changes in v0.1.0
- AI behaviour
    - Implemented standard build order.
    - Implemented standardised unit designs.
- Testing and validation
    - Improved auto-test scripts & added results processing

#### Test results (Warzone 2100 v4.6.1)
- **98%** win rate: Fishbot-v1 Medium vs Nullbot Insane (Gamma 3P T2 - 1v1)


## Fishbot v0 (v0.0.1)
Forked from NullBot v3.

### Release features
- AI behaviour
    - Implemented various improvements to unit movement.
    - Focused the existing build and research order. 

#### Test results (Warzone 2100 v4.6.1)
- **93%** win rate: Fishbot-v0 Medium vs Nullbot Insane (Gamma 3P T1 - 1v1)