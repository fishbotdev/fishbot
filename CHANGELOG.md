# Changelog
This file is used to record the changes to FishBot between each version.

## Fishbot v0.4.0
### Changes in v0.4.0
- Combat
    - FishBot now divides its army into two main battle groups ('brigades') and a reserve group. Each group is controlled independently. With this change, FishBot becomes markedly more effective in high unit count games.
- Production
    - Factories now only produce the most-needed unit in active combat brigades (production is now intentional and no longer random).
    - Rebalanced production quantities for high-unit count games (VTOLs and trucks are now reliably produced). 
    - `Incendiary Mortar` is removed as a primary fire support weapon.

## Fishbot v0.3.3
### Changes in v0.3.3
- Fixes:
    - Fixed research collisions: FishBot will now try to research other technologies if they are already being researched by an ally.
    - Added Gauss Cannon to the T2 research order.
- Internal changes
    - Fixed player-colour conflicts in `DEBUG_MODE`.

#### Test results (Warzone 2100 v4.7.0-beta2)
FishBot `v0.3.3` (commit `b6c85a5`) was automatically tested on: `Gamma 3P T2` 1v1. 
- 50 / 50 = **100%** win rate: FishBot-v0.3.3 Medium vs Cobra **Medium** 
- 48 / 50 = **96%** win rate: FishBot-v0.3.3 Medium vs Cobra **Hard** 

## Fishbot v0.3.2
### Changes in v0.3.2
- Minor AI behavioural improvements:
    - Production
        - Fixed issue where factories would idle excessively.
        - Production decisions are now much less random; production decisions are now made using the composition of the current force.
    - Ground units
        - Ground units will no longer use `Heavy Cannon`.
        - The primary AA weapon is changed to a mix of `Hurricane` and `AA Tornado Flak Cannon` (previously `AA Tornado Flak Cannon` only).
        - The primary fire support weapon is changed to a mix of `Incendiary Mortar` and `Pepperpot` (previously `Pepperpot` only).
    - Research
        - Removed `Heavy Cannon` from research order and re-prioritised other research items accordingly.
- Internal changes
    - All decision-making functions are now centralised in `hq_command.js`.
    - Temporarily removed `Sk-Startup` from the list of supported maps.

#### Test results (Warzone 2100 v4.6.3)
FishBot `v0.3.2` (commit `4d60e4f`) was automatically tested on: `Gamma 3P T2` 1v1. 
- 100 / 100 = **100%** win rate: FishBot-v0.3.2 Medium vs Cobra **Medium** 
- 94 / 100 = **94%** win rate: FishBot-v0.3.2 Medium vs Cobra **Hard** 
- 8 / 100 = **8%** win rate: FishBot-v0.3.2 Medium vs Cobra **Insane** 


## Fishbot v0.3.1
### Changes in v0.3.1
- Significantly reduced bot lag spikes.
- Bot files have been packaged nicely for ease of import.
- Minor AI behavioural improvements:
    - VTOLs
        - Improved avoidance of anti-air defences.
        - Improved CAS targeting & target mix based on game state.
        - Strike group sizes now depend on mission.
    - Ground units
        - Ground units prioritise meaningful threats over closest targets (within reason).
        - Early units now move out of base a lot sooner than before.
        - Units now attempt to stay grouped up when losses mount.
        - Ground units now use Heavy Cannon to bridge the tech-gap between Assault Cannon and Twin Assault Cannon.
        - Anti-air units now focus fire on a single target.
    - Construction
        - Improved truck danger avoidance.
        - Fixed trucks getting stuck when some base-build / defence-build missions are unachieveable.
        - Core base build order slightly adjusted. 
    - Production
        - Rebalanced production weights for ADA & indirect fire.
- Internal changes
    - Centralised most core game data and behaviour, making the bot behaviour easier to change.
    - Added system docs (in `.\docs`) & jsdocs (throughout the code).


#### Test results (Warzone 2100 v4.6.3)
- 79 / 100 = **79%** win rate: FishBot-v0.3.1 Medium vs Cobra **Hard** (Gamma 3P T2 - 1v1; commit `021d39e`)
- 97 / 100 = **97%** win rate: FishBot-v0.3.1 Medium vs Cobra **Medium** (Gamma 3P T2 - 1v1; commit `021d39e`)

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