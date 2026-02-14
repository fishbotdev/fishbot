/*
	This file is part of FishBot, a Warzone 2100 AI.

	FishBot is free software: you can redistribute it and/or modify it under the terms of the 
	GNU General Public License as published by the Free Software Foundation, either version 3 
	of the License, or (at your option) any later version.

	FishBot is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; 
	without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. 
	See the GNU General Public License for more details.

	You should have received a copy of the GNU General Public License along with this program. 
	If not, see <https://www.gnu.org/licenses/> or <https://www.gnu.org/licenses/gpl-3.0.html>.
*/


/*

	FishBot Introduction

	This is a bot designed for Tech Level 2+ duels (1v1) on low-oil maps (the maps that ship with WZ2100 as of v4.6.1+). 
	Ironically, it does not work on sea maps :D. FishBot was developed to win against Insane difficulty AI (while it is Medium difficulty). 

	FishBot's winning strategy revolves around intelligent, highly aggressive combined-arms warfare. It arranges each type of unit on 
	the battlefield in a way which maximises their destructive effects while protecting the friendly force (minimising casualties).
	
	For challengers - I recommend to play against FishBot on Easy mode (or at very low gamespeed) when first playing against it.

	Project started 15 Oct 2025
	
*/

var FISHBOT_VERSION = 3;

//	This file connects all remaining pieces of AI code together. It shouldn't contain any code itself.
//	NOTE: order matters!
const FISHBOT_PATH = "/multiplay/skirmish/";
const FB_INCLUDES = FISHBOT_PATH + "fb_includes/";

// Enable DEBUG_MODE_ON (global) to:
//	 - Show some useful debug information in the console
//	 - Automatically colour players 0, 1, 2
//	 - Transform Player 0 (forced human player slot) to spectator mode (used for automatated bot testing)
var DEBUG_MODE_ON = true;

// 
/*
	Fun stats:
	
	In git bash, cd to the code directory and 
	(1) "git ls-files "*.js" | xargs wc -l", OR: 
	(2) Can also do "git ls-files "*.js" | xargs cat | grep -v '^\s*$' | grep -v '^\s*#' | wc -l" 	which apparently counts without comments

	- 29 Nov 2025 (43e22ee): (1) 4170 line JS, 490 lines python (first command) OR (2) 3512 .js, 296 .py (second command)
	- 18 Jan 2026 (eae414d): (1) 5618 line JS, 717 lines python (first command) OR (2) 4567 .js, 448 .py (second command)
	- 15 Feb 2026 (296a137): (2) 4281 .js, 202 .py (second command)	-- v3 release
*/


////////////////////////////////////////////////////////////////////////////////////////////

{
	/*
		LOW-LEVEL DRIVERS FOR WZ2100			
 	
		The primary purpose of these files is to gather information from the WZ2100 game engine.
	*/
	include(FB_INCLUDES + "_wz_head.js");
	include(FB_INCLUDES + "_utils.js");

	/*
		TACTICAL-LEVEL

		The purpose of these files is to direct the tactical level functions e.g. "how to produce a standard FishBot droid".
		These can be considered as WZ2100-specific drivers.
	*/
	include(FB_INCLUDES + "__head.js");	

	// world_state stores persistent parameters that FishBot uses to make decisions. Its access and mutation is strictly controlled.
	include(FB_INCLUDES + "_world_state.js");

	include(FB_INCLUDES + "__tac_log_construction.js");
	include(FB_INCLUDES + "__tac_log_production.js");

	include(FB_INCLUDES + "__tac_com_aviation.js");
	include(FB_INCLUDES + "__tac_com_ground.js");
	include(FB_INCLUDES + "__tac_com_intelligence.js");

	/*
		OPERATIONAL-LEVEL

		The purpose of these files is to direct the "4 W's & how" (what, who, when, where and how), but only on a high level. 
		In other words, it specifies what is to be done, where it is to be done, who will do it, the right timing, and high-level details
		about implementation.
	*/
	include(FB_INCLUDES + "hq_g4_construction.js");
	include(FB_INCLUDES + "___op_log_production.js");
	include(FB_INCLUDES + "___op_log_research.js");	

	include(FB_INCLUDES + "hq_g3_aviation.js");
	include(FB_INCLUDES + "___op_com_ground.js");
	include(FB_INCLUDES + "hq_g2_intelligence.js");			
	
	/*
		STRATEGIC-LEVEL

		These files decide what FishBot will do. Their main job is reasoning and delegating the carrying-out
		of missions to the operational level functions.
	*/
	include(FB_INCLUDES + "hq_toc.js");
	include(FB_INCLUDES + "hq_command.js");		

	// (The following two files contain event handlers and the hook for starting the game)
	include(FB_INCLUDES + "_init.js");	
	include(FB_INCLUDES + "_events.js");						
}
