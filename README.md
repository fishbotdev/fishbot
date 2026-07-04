# FishBot, a capable T2 Warzone 2100 bot 
[![Hits](https://hits.sh/fishbotdev.github.io/fishbot.svg)](https://hits.sh/fishbotdev.github.io/fishbot/)
![GitHub downloads (all releases)](https://img.shields.io/github/downloads/fishbotdev/fishbot/total)

FishBot is a Warzone 2100 AI bot compatible with Warzone 2100 **v4.6.1+**.

It is designed for Tech Level 2, No-Base starts on the supported maps below. Tech Level 1 is currently not supported.

## Download

1. Start Warzone 2100. Click Options.
2. Click "Open Configuration Directory" in the bottom left corner.
3. Download 📦fishbot.zip from https://github.com/fishbotdev/fishbot/releases. 
4. Move the .zip file to 📁`mods/4.7.0/autoload/`.
5. Restart Warzone 2100.

To check if the path is correct, you should be able to find `FishBot.js` in this location:

**`%MY_WARZONE2100_CONFIG_DIRECTORY_PATH% \ mods \ 4.7.0 \ autoload \ fishbot \ multiplay \ skirmish \ FishBot.js`**

If you can find `Fishbot.js` here, FishBot should automatically load on the next startup of Warzone 2100. It will then be available to select as an AI bot.

## List of supported technology levels
Currently, only T2 (**Technology Level 2**) starts are supported. Further support for other technology levels might be added in a future version. 

However, at the moment I feel like Cobra already fills the gap in the other technology levels very well.

In particular, I think Cobra performs excellently on T1 in Warzone 2100 v4.6.3+. 

## List of supported maps (Warzone2100 4.7.0)
As of the most current version **v0.4.1**, FishBot works best on large, standard "low-oil" game maps with up to ~10 derricks per player. 
It currently only has been tested with scavengers disabled.

The current method for determining whether or not a map is *supported* is:
* For 2P & 3P maps, FishBot can win in T2 against a single Cobra @ Medium difficulty.
* For higher player-count maps, it can win in a team with other FishBots.

### 2 player (T2)
* `Sk-Startup`
* ~~`Sk-UrbanChasm`~~ -- bankrupts itself (rigid build order)
* ~~`Sk-HighGround`~~ -- bankrupts itself (rigid build order)
* `Roughness`
* `Vision`
* `DustyMaze (2P)`

### 3 player (T2)
* `Monocot`
* `Gamma`

Official support for other maps will be included in future versions. The current limitations are:
* On very small maps with very low oil, FishBot runs out of power (and gets stuck) due to a fixed rigid build order. It can also get stuck if it doesn't claim enough derricks in the early game.
* FishBot attempts to build forward-defences around derricks which are too dangerous to go and capture.

## Recent updates
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

* **v0.3.3** -- *released **07 Apr 2026***
    * Fixed research collisions: FishBot will now try to research other technologies if they are already being researched by an ally.

Please see [`CHANGELOG.md`](CHANGELOG.md) for a detailed list of past changes.

## Upcoming features
The current areas for improvement are:
* Strategic improvements (FishBot's current strategic level is: 'this is the closest target, go there').
* Support for T1 & T3.
* Increased support for popular skirmish maps.

## Background and Goals
FishBot was initially forked from NullBot v3. I acknowledge and appreciate the work of the NullBot team in creating the foundation for this body of work. As of v0.4.0, not much of the original code remains, but I am grateful for the structural and spiritual influence of the original work.

I played Warzone 2100 many years ago, and I remember how much happiness it brought me as as a kid. 
It was so much fun to build up a little army, rush the AI and see the enemy base satisfyingly turn into little puffs of debris.
I am hoping that FishBot will bring a little bit of that happiness to our dedicated players by being a fun, fresh and challenging opponent (or ally) for your skirmish games.

My goal is to make FishBot a generally useful bot which could be packaged with the official game one day. 
As mentioned above, I'd like it to be genuinely fun to play with, both as a teammate and as an opponent! 
Admittedly, there is a long way to go - but I am hoping that one day I am able to make this wish come true. 

## Software Documentation
jsdocs are used throughout the code. Additionally, `wz2100-js-api.d.ts` is used to indicate the typing of commonly used JS API functions and global variables from the Warzone 2100 game engine. The addition of `jsconfig.json` allows VSCode to understand the various symbols within the project, allowing for some type checking and code navigation. The intent of these documentation features is to make changing the software easier.

For a high-level view of the FishBot software system, please see `docs\ARCHITECTURE.md` for some documentation of the software system architecture.

## Licensing Information (GPL 2.0)

This file is part of FishBot, a Warzone 2100 AI.

FishBot is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License 
as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.

FishBot is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied 
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. 
If not, see <https://www.gnu.org/licenses/>.