# Changelog

## Fishbot v3
### 75% WR: Fishbot-v3 Medium vs Cobra Hard (Gamma 3P T2); Warzone 2100 v4.6.3

- AI behaviour
    - Significant improvements in capturing oil.
    - Significant improvements in VTOL targeting and handling.
- Architecture
    - Infrastructure ugprade (common world state, grouping system, centralised TOC)

## Fishbot v2
### 100% WR: Fishbot-v2 Medium vs Cobra Medium (Gamma 3P T2)

- AI behaviour
    - Refined build order
    - Added centralised command & control (c2.js)
    - Improved unit cohesion (uses median of group position)
    - Implemented basic greedy approach to research (ignores rockets, flamers & defensive structures)
- Architecture
    - Removed various unused code from NullBot.

## Fishbot v1
### 98% WR: Fishbot-v1 Medium vs Nullbot Insane (Gamma 3P T2)

- AI behaviour
    - Implemented standard build order.
    - Implemented standardised unit designs.
- Testing and validation
    - Improved auto-test scripts & added results processing

## Fishbot v0 
### 93% WR (win rate): Fishbot-v0 Medium vs Nullbot Insane (Gamma 3P T1)

- AI behaviour
    - Implemented various improvements to unit movement.
    - Focused the existing build and research order. 