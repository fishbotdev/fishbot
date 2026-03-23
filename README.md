# FishBot, a capable T2 Warzone 2100 bot 
FishBot is a Warzone 2100 AI bot compatible with Warzone 2100 **v4.6.1+**. 

## Upcoming features
* **v0.3.1** -- *to be released on **27 Mar 2026***
    * Significantly fewer lag spikes (performance improvements).
    * Made it easier to import FishBot into your mods folder.
    * Added initial list of supported maps and modes.
    * Small behavioural improvements.

## Previous update
* **v3 (relabeled as v0.3.0)** -- *released **15 Feb 2026*** 
    * Significant improvements in capturing oil.
    * Significant improvements in VTOL targeting and handling.

## Background and Goals
FishBot was initially forked from NullBot v3. I acknowledge and appreciate the work of the NullBot team in creating the foundation for this work.

I played Warzone 2100 many years ago, and I remember how much happiness it brought me as as a kid. 
It was so much fun to build up a little army, rush the AI and see the enemy base satisfyingly turn into little puffs of debris.
I am hoping that FishBot will bring a little bit of that happiness to our dedicated players by being a fun, fresh and challenging opponent (and ally) for your skirmish games.

My goal is to make FishBot a generally useful bot which could be packaged with the official game. 
As mentioned above, I'd like it to be genuinely fun to play with, both as a teammate and as an opponent. 
Admittedly, there is a long way to go - but I am hoping that one day I am able to make this wish come true! 

## List of supported technology levels
Currently, only T2 (**Technology Level 2**) starts are supported.

Further support for other technology levels might be added in a future version. 

However, at the moment I feel like Cobra already fills the gap in the other technology levels excellently.
In particular, I think Cobra performs really well on T1 in Warzone 2100 v4.6.3+. Even as a human player, I think I would struggle to win against T1 Cobra (Warzone 2100 v4.6.3+) without decidedly human strategies (e.g. walls and heavy-MG guard towers in chokepoints during army build-up).

## List of supported maps
As of the most current version **v0.3.0**, FishBot works best on large, standard game maps with up to ~10 derricks per player. 

### 2 player
* `Sk-Startup`
* `Roughness`
* `Vision`

### 3 player
* `Monocot`
* `Gamma` (FishBot has been optimised for this map)

The current method for determining whether or not a map is "supported" is:
* For 2P & 3P maps, FishBot can win against a single Cobra @ Medium difficulty on that map
* For higher player-count maps, it can win in a team with other FishBots (I'd like to know if it can be a good teammate for the player)

Official support for other maps will be included in future versions. The current limitations are:
* On very small maps with very low oil, FishBot runs out of power (and gets stuck) due to a fixed rigid build order. It can also get stuck if it doesn't claim enough derricks in the early game.
* There may be some performance issues (lag spikes) on high-player-count games with lots of game objects; these are being worked on in the background to deliver a smoother player experience.
* On maps where derricks are not easily accessible, trucks may get stuck trying to path to the derricks, or when building defences around the derricks.

## How to load the mod into Warzone 2100 v4.6.1+
1. Download the source code as .zip from GitHub: <https://github.com/fishbotdev/fishbot>.
2. Unzip the .zip file.
3. Place the unzipped folder contents into: **`%MY_WARZONE2100_CONFIG_DIRECTORY_PATH% \ mods \ 4.6.x \ autoload \ fishbot`**

To check if the path is correct, you should be able to find `FishBot.js` in this location:

**`%MY_WARZONE2100_CONFIG_DIRECTORY_PATH% \ mods \ 4.6.x \ autoload \ fishbot \ multiplay \ skirmish \ FishBot.js`**

If you can find `Fishbot.js` here, FishBot should automatically load on the next startup of Warzone 2100. It will then be available to select as an AI bot.

## Detailed Changelog
Please see `CHANGELOG.md` for a detailed list of changes between major versions.

## Software Documentation
jsdocs are used throughout the code, along with with a `.d.ts` file to indicate the typing of commonly used JS API functions and global variables from the Warzone 2100 game engine. The intent of this documentation is to make changing the software easier.
For a higher-level view of the software system, please see `docs\ARCHITECTURE.md` for some documentation of the software system architecture.

## Licensing Information (GPL 2.0)

This file is part of FishBot, a Warzone 2100 AI.

FishBot is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License 
as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.

FishBot is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied 
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. 
If not, see <https://www.gnu.org/licenses/>.