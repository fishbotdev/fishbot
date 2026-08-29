/*
	This file is part of FishBot, a Warzone 2100 AI.

	FishBot is free software; you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation; either version 2 of the License, or
	(at your option) any later version.

	FishBot is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License along with this program. 
	If not, see <https://www.gnu.org/licenses/>.
*/


/*
	FishBot Introduction

	This is a Warzone 2100 bot designed for Tech Level 2 starts on low oil maps (no scavengers).
	Ironically, it does not work on sea maps :D. 
	FishBot was originally developed to win against Insane difficulty AI (while it is Medium difficulty). 

	FishBot's winning strategy revolves around intelligent, highly aggressive, combined-arms warfare. It arranges each type of unit on 
	the battlefield in a way which maximises their destructive effects while protecting the friendly force.
	
	For challengers - I recommend to play against FishBot on Easy mode (or at very low gamespeed) when first playing against it!

	Project started: 15 Oct 2025

	=== Fun stats: LINES OF CODE ===
	FishBot uses cloc to count lines of code (https://github.com/aldanial/cloc). More info can be found in `fishbot\software_tools\run_cloc.bat`.
	- 3845 JS @ 30 Mar 2026: v0.3.1 release (commit `0565344`)
	- 4420 JS @ 04 Apr 2026: v0.3.2 release (commit `69c4754`)
	- 4437 JS @ 07 Apr 2026: v0.3.3 release (commit `b6c85a5`)
	- 5097 JS @ 02 May 2026: v0.4.0 release (commit `2c79f5f`)
	- 5237 JS @ 27 Jun 2026: v0.4.1 release (commit `03a99ae`)
	- 5330 JS @ 10 Jul 2026: v0.4.2 release (commit `3781360`)
	- 5315 JS @ 29 Jul 2026: v0.5.0 release 
	- 5580 JS @ 04 Aug 2026: v0.5.1 release
	- 5626 JS @ 29 Aug 2026: v0.5.2 release
*/

const FISHBOT_VERSION = "0.5.2";

//	This file connects all remaining pieces of AI code together. It shouldn't contain any code itself.
//	NOTE: order matters!
const FISHBOT_PATH = "/multiplay/skirmish/";
const FB_INCLUDES = FISHBOT_PATH + "fb_includes_v0_5_2/";

// Enable DEBUG_MODE_ON (global) to:
//	 - Show some useful debug information in the console
//	 - Automatically colour players 0, 1, 2
//	 - Transform Player 0 (forced human player slot) to spectator mode (used for automated bot testing)
const DEBUG_MODE_ON = true;

// For developers, please refer to `docs/DEVELOPMENT.md` for important info e.g. release checklist.

////////////////////////////////////////////////////////////////////////////////////////////

{
	/*
		LOW-LEVEL DRIVERS FOR WZ2100			
 	
		The primary purpose of these files is to gather information from the WZ2100 game engine.
	*/
	include(FB_INCLUDES + "__wz_head.js");
	include(FB_INCLUDES + "_head.js");	
	include(FB_INCLUDES + "_utils.js");

	/*
		TACTICAL-LEVEL

		The purpose of these files is to direct the tactical level functions e.g. "how to produce a standard FishBot droid".
		These can be considered as WZ2100-specific drivers.
	*/


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
	include(FB_INCLUDES + "hq_g4_production.js");
	include(FB_INCLUDES + "hq_g4_research.js");	

	include(FB_INCLUDES + "hq_g3_aviation.js");
	include(FB_INCLUDES + "hq_g3_ground_ops.js");
	include(FB_INCLUDES + "hq_g2_intelligence.js");			
	
	/*
		STRATEGIC-LEVEL

		These files reason about, and then decide on next action that FishBot should take.
	*/
	include(FB_INCLUDES + "hq_toc.js");
	include(FB_INCLUDES + "hq_command.js");		

	// The following three files contain event handlers and the hook for starting the game. 
	// The files must be included in this order.
	include(FB_INCLUDES + "_init.js");	
	include(FB_INCLUDES + "_events.js");						
	include(FB_INCLUDES + "_run.js");						
}
