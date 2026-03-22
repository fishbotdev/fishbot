# Introduction
FishBot is a Warzone 2100 AI bot compatible with Warzone 2100 v4.6.1+. It was initially forked from NullBot v3.

## How to load the mod into Warzone 2100 v4.6.1+
1. Download the source code as .zip from GitHub: <https://github.com/fishbotdev/fishbot>.
2. Unzip the .zip file.
3. Place the unzipped folder contents into: `%MY_WARZONE2100_CONFIG_DIRECTORY_PATH% \ mods \ 4.6.x \ autoload`

To check if the path is correct, you should be able to find `FishBot.js` in this location:

`%MY_WARZONE2100_CONFIG_DIRECTORY_PATH% \ mods \ 4.6.x \ autoload \ fishbot \ multiplay \ skirmish \ FishBot.js`

If you can find `Fishbot.js` here, the mod should automatically load on the next startup of Warzone 2100.

## Changes
Please see `CHANGELOG.md` for a list of changes between major versions.

## Software Architecture
Please see `docs\ARCHITECTURE.md` for documentation of the software system architecture.

## Licensing Information

This file is part of FishBot, a Warzone 2100 AI.

FishBot is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License 
as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.

FishBot is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied 
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. 
If not, see <https://www.gnu.org/licenses/>.