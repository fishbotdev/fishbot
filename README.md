# FishBot, a capable T2 Warzone 2100 bot 
![Badge](https://hitscounter.dev/api/hit?url=https%3A%2F%2Fgithub.com%2Ffishbotdev%2Ffishbot&label=Hits&icon=github&color=%23198754&message=&style=flat&tz=UTC)
![GitHub downloads (all releases)](https://img.shields.io/github/downloads/fishbotdev/fishbot/total)

FishBot is a Warzone 2100 AI bot compatible with Warzone 2100 **v4.6.1+**. 

It is designed for Tech Level 2 (No Scavenger) skirmish games on the supported maps below. Starts at other tech levels are currently not supported.

![FishBot using two unit groups to attack two bases simultaneously.](docs/images/fishbot-v0.5.1.png)
*Figure 1: FishBot **v0.5.1** using two unit groups to attack two bases simultaneously.*

## Download

1. Open Warzone 2100. Click on "Options".
2. Click "Open Configuration Directory" in the bottom left corner.
3. Download 📦fishbot.zip from https://github.com/fishbotdev/fishbot/releases. 
4. Move the .zip file to 📁`mods/4.7.0/autoload/`. **To avoid any version conflicts, please remove all old versions of FishBot (v0.5.0 and below)**.
5. Restart Warzone 2100.

To check if the path is correct, you should be able to find `FishBot.js` in this location:

**`%MY_WARZONE2100_CONFIG_DIRECTORY_PATH% \ mods \ 4.7.0 \ autoload \ fishbot \ multiplay \ skirmish \ FishBot.js`**

If you can find `Fishbot.js` here, FishBot should automatically load on the next startup of Warzone 2100. It will then be available to select as an AI bot.

## Supported technology levels
Currently, only T2 (**Technology Level 2**) starts are supported. A future version will add support for other starts.

## Supported maps (Warzone2100 v4.7.0)
Most "low-oil" maps shipped with the game are supported as of FishBot **v0.5.3**. Ironically, FishBot does not currently handle water obstacles, so `Sk-Manhattan` (8 player) and `WaterLoop` (10 player) are both not supported as of **v0.5.3**.

FishBot is also currently not compatible with scavengers; it currently ignores them.

## Test Methodology & Results
For a map to be deemed compatible, FishBot must have an absence of breaking issues.

Ideally, FishBot will also have a good win rate in both duel (1-vs-1, tested in all combinations of positions) and in FFA (free-for-all). The following test results are obtained from a standard test set of 10 games per position, per map, against `Cobra` @ Medium difficulty. As the number of possible combinations of duel positions grows quickly, duel games have only been tested for 2 to 4-player maps.

### 2 player (T2-NoScav)
| Map | Duel | FFA |
| --- | :---: | :---: |
| `DustyMaze (2P)` | 80% | - |
| `Roughness` | 100% | - |
| `Sk-HighGround` | 100% | - |
| `Sk-Startup` | 100% | - |
| `Sk-UrbanChasm` | 100% | - |
| `Vision` | 100% | - |

### 3 player (T2-NoScav)
| Map | Duel | FFA |
| --- | :---: | :---: |
| `Gamma` | 100% | 90% |
| `Monocot` | 100% | 100% |

### 4 player (T2-NoScav)
| Map | Duel | FFA |
| --- | :---: | :---: |
| `DustyMaze-2v2` | 94% | 85% |
| `DustyMaze-FFA` | 92% | 85% |
| `Sk-Basingstoke` | 80% | 45% |
| `Sk-Cockpit` | 100% | 82% |
| `Sk-FishNets` | 95% | 50% |       
| `Sk-GreatRift` | 98% | 72% |
| `Sk-LittleEgypt` | 78% | 35% |
| `Sk-Mountain` | 99% | 82% |
| `Sk-Pyramidal` | 100% | 82% |
| `Sk-RollingHills` | 88% | 80% |
| `Sk-Rush` | 100% | 82% |
| `Sk-Rush2` | 100% | 90% |
| `Sk-Urban-Chaos` | 98% | 90% |
| `Sk-UrbanDuel` | 100% | 100% |
| `Sk-Valley` | 99% | 95% |

### 5 player (T2-NoScav)
| Map | Duel | FFA |
| --- | :---: | :---: |
| `Bloat` | - | 76% |

### 6 player (T2-NoScav)
| Map | Duel | FFA |
| --- | :---: | :---: |
| `Entropy` | - | 51% |
| `Melting` | - | 67% |

### 7 player (T2-NoScav)
| Map | Duel | FFA |
| --- | :---: | :---: |
| `Thales` | - | 37% |

### 8 player (T2-NoScav)
| Map | Duel | FFA |
| --- | :---: | :---: |
| `Sk-Bananas` | - | 51% |
| `Sk-BeggarsKanyon` | - | 72% |
| `Sk-Clover` | - | 66% |
| `Sk-Cockate` | - | 44% |
| `Sk-Concrete` | - | 49% |
| `Sk-Gridlock` | - | 61% |
| `Sk-HideNSneak` | - | 30% |
| `Sk-MizaMaze` | - | 46% |
| `Sk-SandCastles` | - | 56% |
| `Sk-ThePit` | - | 62% |
| `Sk-Wheel` | - | 57% |
| `Sk-YinYang` | - | 64% |
| `Sk-Ziggurat` | - | 39% |
| `Sk-Manhattan` | - | NC |

### 9 player (T2-NoScav)
* `Sk-WindFury` (*tested manually*)

### 10 player (T2-NoScav)
* `Emergence` (*tested manually*)
* ~~`WaterLoop`~~ - **not compatible**: sea map

## Recent updates
* **v0.5.3** - *released **xx Sep 2026***
    * Combat fixes:
        * Improved group cohesion during heavy fighting.
        * Improved VTOL utilisation when the match is neck-and-neck.
    * Improved the construction planner to reduce the chance that trucks oscillate back and forth doing nothing.
    * Unit designs & base construction tweaked.
    * New focused cannon research path added for 1v1 matches.
    * Excluding 10-player maps and sea maps, all other Warzone 2100 maps are now covered by automated E2E testing.

* **v0.5.2** - *released **01 Sep 2026***
    * Combat improvements, including a complete overhaul of group movement and targeting. 
        * This should result in smoother and seemingly more intentional group behaviour, with better handling of chokepoints.
    * Performance improvements, resulting in a smoother player experience on all base maps shipped with the game.
    * Fixed some long-standing construction issues related to oil capture.

* **v0.5.1** - *released **04 Aug 2026***
    * Now supports custom structure limits in skirmish settings.
    * Fixed other construction issues e.g. trying to build behind destroyable features, and trucks ignoring (some) dangerous situations.
    * Improved research transition from T2 to T3 (Cannon path). FishBot will now unlock Tiger / Vengeance bodies and Rail Gun / Gauss Cannon earlier.

* **v0.5.0** - *released **29 Jul 2026***
    * Now compatible with most maps shipped with Warzone 2100 v4.7.0 (validated by a new automatic testing pipeline).
    * Greatly improved combat effectiveness; now up to 4 combat groups are used.
    * Major overhaul of the production, resupply & repair systems to support the above.
    * Improved base construction efficiency & added build order adaptation for very low-oil maps.


Please see [`CHANGELOG.md`](CHANGELOG.md) for a detailed list of all past changes.

## Fair play
FishBot **v0.5.3** is a "fair-play" bot. Unlike most other bots, FishBot does not produce custom designs (e.g. Hover Trucks) nor combat units (including combat cyborgs) until the Command Center is built, keeping in line with human player rules. However, unlike a human player, FishBot is able to 'see' the whole map, ignoring the fog-of-war. The current iteration of FishBot does not make very good use of this information, so I believe this advantage is largely nullified, but future versions will address how to respect the FOW without creating excessive lag.

## Disclaimer: Use of AI
Prior to **v0.5.2**, ChatGPT was used sparsely to implement some of the math functions, but the majority of the logic and architecture was human-authored.

From **v0.5.2** onwards, Claude Code (Opus 5) has been actively used to make improvements to the bot. The work is still human-directed and reviewed though.

## Background and Goals
FishBot was initially forked from NullBot v3. I acknowledge and appreciate the work of the NullBot team in creating the foundation for this body of work. As of v0.5.3, probably only 1% of the original code remains, but I am grateful for the structural and spiritual influence of the original work.

I played Warzone 2100 many years ago, and I remember how much happiness it brought me as as a kid. 
It was so much fun to build up a little army, rush the AI and see the enemy base satisfyingly turn into little puffs of debris.
I am hoping that FishBot will bring a little bit of that happiness to our dedicated players by being a fun, fresh and challenging opponent (or ally) for your skirmish games.

My goal is to make FishBot a generally useful bot which could be packaged with the official game one day. 
As mentioned above, I'd like it to be genuinely fun to play with, both as a teammate and as an opponent! 
Admittedly, there is a long way to go to make this a true general purpose bot - but I am hoping that one day I am able to make this wish come true. 

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