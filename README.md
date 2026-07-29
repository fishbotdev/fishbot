# FishBot, a capable T2 Warzone 2100 bot 
![Badge](https://hitscounter.dev/api/hit?url=https%3A%2F%2Fgithub.com%2Ffishbotdev%2Ffishbot&label=Hits&icon=github&color=%23198754&message=&style=flat&tz=UTC)
![GitHub downloads (all releases)](https://img.shields.io/github/downloads/fishbotdev/fishbot/total)

FishBot is a Warzone 2100 AI bot compatible with Warzone 2100 **v4.6.1+**.

It is designed for Tech Level 2 (No Scavenger) skirmish games on the supported maps below. Tech Level 1 is currently not supported.

## Download

1. Open Warzone 2100. Click on "Options".
2. Click "Open Configuration Directory" in the bottom left corner.
3. Download 📦fishbot.zip from https://github.com/fishbotdev/fishbot/releases. 
4. Move the .zip file to 📁`mods/4.7.0/autoload/`. **To avoid any version conflicts, please remove all previous versions of FishBot**.
5. Restart Warzone 2100.

To check if the path is correct, you should be able to find `FishBot.js` in this location:

**`%MY_WARZONE2100_CONFIG_DIRECTORY_PATH% \ mods \ 4.7.0 \ autoload \ fishbot \ multiplay \ skirmish \ FishBot.js`**

If you can find `Fishbot.js` here, FishBot should automatically load on the next startup of Warzone 2100. It will then be available to select as an AI bot.

## Supported technology levels
Currently, only T2 (**Technology Level 2**) starts are supported. Further support for other technology levels might be added in a future version. 

However, at the moment I feel like Cobra already fills the gap in the other technology levels very well.

In particular, I think Cobra performs excellently on T1 in Warzone 2100 v4.6.3+. 

## Supported maps (Warzone2100 4.7.0)
As of **v0.5.0**, FishBot works on most "low-oil" maps shipped with the game. There might be a few lag issues with high-player count games; these are being actively worked on.

FishBot is not compatible with scavengers; it currently ignores them.

### 2 player (T2-NoScav)
* `Sk-Startup` (100% duel)
* `Sk-UrbanChasm` (85% duel)
* `Sk-HighGround` (80% duel)
* `Roughness` (100% duel)
* `Vision` (95% duel)
* `DustyMaze (2P)` (*tested manually*)

### 3 player (T2-NoScav)
* `Monocot` (100% duel, 100% FFA)
* `Gamma` (100% duel, 97% FFA)

### 4 player (T2-NoScav)
* `Sk-Rush` (99% duel, 80% FFA)
* `Sk-Rush2` (100% duel, 92% FFA)
* `Sk-UrbanDuel` (99% duel, 92% FFA)
* `Sk-Mountain` (100% duel, 62% FFA)
* `Sk-Valley` (98% duel, 85% FFA)
* ~~`Sk-FishNets` (86% duel, **15% FFA**)~~ - **not compatible**: targeting algorithm interacts poorly with water obstacles 
* `Sk-GreatRift` (100% duel, 72% FFA)
* `Sk-RollingHills` (93% duel, 92% FFA) 
* ~~`Sk-Basingstoke`~~ - **not compatible**: large unit groups get stuck during pathfinding
* `Sk-LittleEgypt` (89% duel, 42% FFA) 
* ~~`Sk-Cockpit`~~ - **not compatible**: unit groups get stuck in the narrow base entrances
* `Sk-Urban-Chaos` (98% duel, 92% FFA)
* `Sk-Pyramidal` (100% duel, 78% FFA)
* `DustyMaze-2v2` (*tested manually*)
* `DustyMaze-FFA` (*tested manually*)

### 5 player (T2-NoScav)
* `Bloat` (56% FFA)

### 6 player (T2-NoScav)
* `Melting` (53% FFA)
* `Entropy` (*tested manually*)

### 7 player (T2-NoScav)
* `Thales` (*tested manually*)

### 8 player (T2-NoScav)
* `Sk-Clover` (*tested manually*)
* `Sk-MizaMaze` (*tested manually*)
* ~~`Sk-Manhattan`~~ - **not compatible**: central river blocks land units
* `Sk-Bananas` (*tested manually*)
* `Sk-Wheel` (*tested manually*)
* `Sk-Ziggurat` (*tested manually*)
* `Sk-Concrete` (*tested manually*)
* `Sk-ThePit` (*tested manually*)
* ~~`Sk-HideNSneak`~~ - **not compatible**: terrain confuses the unit grouping algorithm
* `Sk-YinYang` (*tested manually*)
* `Sk-SandCastles` (*tested manually*)
* `Sk-BeggarsKanyon` (*tested manually*)
* `Sk-Gridlock` (*tested manually*)
* ~~`Sk-Cockate`~~ - **not compatible**: unit groups get stuck in the narrow base entrances

### 9 player (T2-NoScav)
* `Sk-WindFury` (*tested manually*)

### 10 player (T2-NoScav)
* `Emergence` (*tested manually*)
* ~~`WaterLoop`~~ - **not compatible**: sea map

### How to determine if a map is supported
The method is as follows:
* For 2 player maps, FishBot has a 75%+ win rate (cumulatively, across both positions) against Cobra @ Medium difficulty.
* For 3 & 4 player maps, FishBot has a:
    * 50%+ win rate in FFA (cumulative across all positions) against Cobra @ Medium difficulty, and
    * 75%+ win rate in duels (against Cobra @ Medium difficulty) across all pairs of positions (i.e. 1v1 with all other player slots being empty).
* For 5 player maps and higher, FishBot is able to win a FFA game in 3 tries or less, and does not run into a breaking issue.

Some current FishBot limitations are:
* FishBot's group-movement algorithm sometimes causes large groups of units to get stuck in a tight ball.
* FishBot does not use hover units (yet) so it struggles with maps with a lot of water.
* FishBot sometimes attempts to build forward-defences around derricks which are actually too dangerous to go and capture.

## Recent updates
* **v0.5.0** - *released **29 Jul 2026***
    * Now compatible with most maps shipped with Warzone 2100 v4.7.0 (validated by a new automatic testing pipeline).
    * Greatly improved combat effectiveness; now up to 4 combat groups are used.
    * Major overhaul of the production, resupply & repair system to support the above.
    * Improved base construction efficiency. Added build order adaptation for very low-oil maps.

* **v0.4.2** - *released **10 Jul 2026***
    * Combat improvements:
        * Improved direct-fire targeting and the effectiveness of AA units.
        * Added support for Heavy Repair Turret units.
    * Slightly improved research order and construction reliability.

* **v0.4.1** - *released **27 Jun 2026***
    * Increased combat group cohesion.
    * Construction fixes:
        * Repair facilities are more likely to be forward-constructed. 
        * Base structure positions now account for terrain obstacles.
    * Improved TL2 to TL3 research transition (now focuses on Gauss Cannon tree).
    * FishBot now follows the same rules as human players on game start (will no longer produce Hover Trucks before the Command Center is built).

* **v0.4.0** -- *released **02 May 2026***
    * FishBot now divides its army into 2 main groups ('brigades') with 1 reserve group.
    * FishBot now uses repair facilities, and forward-builds these near active combat brigades.
    * Production is no longer randomised (now depends on current brigade demand).
    * Various construction fixes and improvements (please see [`CHANGELOG.md`](CHANGELOG.md) for a full list of changes).

Please see [`CHANGELOG.md`](CHANGELOG.md) for a detailed list of all past changes.

## Upcoming features
The current areas for improvement are:
* Strategic improvements (FishBot's current strategic level is: 'this is the closest target, go there').
* Tactical-level targeting improvements (i.e. preventing target oscillation).
* Support for T1 & T3.

## Background and Goals
FishBot was initially forked from NullBot v3. I acknowledge and appreciate the work of the NullBot team in creating the foundation for this body of work. As of v0.4.0, not much of the original code remains, but I am grateful for the structural and spiritual influence of the original work.

I played Warzone 2100 many years ago, and I remember how much happiness it brought me as as a kid. 
It was so much fun to build up a little army, rush the AI and see the enemy base satisfyingly turn into little puffs of debris.
I am hoping that FishBot will bring a little bit of that happiness to our dedicated players by being a fun, fresh and challenging opponent (or ally) for your skirmish games.

My goal is to make FishBot a generally useful bot which could be packaged with the official game one day. 
As mentioned above, I'd like it to be genuinely fun to play with, both as a teammate and as an opponent! 
Admittedly, there is a long way to go - but I am hoping that one day I am able to make this wish come true. 

## Documentation

* For a high-level view of the FishBot software system, please see `docs\ARCHITECTURE.md`.
* To get set up with development, please see `docs\DEVELOPMENT.md`.
* For a detailed list of changes from version to version, please see `CHANGELOG.md`.

## Licensing Information (GPL 2.0)

This file is part of FishBot, a Warzone 2100 AI.

FishBot is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License 
as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.

FishBot is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied 
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. 
If not, see <https://www.gnu.org/licenses/>.