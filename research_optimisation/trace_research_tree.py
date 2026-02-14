"""
	This file is part of FishBot, a Warzone 2100 AI.

	FishBot is free software: you can redistribute it and/or modify it under the terms of the 
	GNU General Public License as published by the Free Software Foundation, either version 3 
	of the License, or (at your option) any later version.

	FishBot is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; 
	without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. 
	See the GNU General Public License for more details.

	You should have received a copy of the GNU General Public License along with this program. 
	If not, see <https://www.gnu.org/licenses/> or <https://www.gnu.org/licenses/gpl-3.0.html>.
"""

import json
import os
import sys

# --------------------------
# CONFIGURATION
# --------------------------
SUPPORT_KEYWORDS = [
    "Res", "Fac", "Lab", "Eng", "Upg", "Sys", "Gen", "Struct", "Support"
]
INDENT = "    "  # 4 spaces per level

# --------------------------
# HELPER FUNCTIONS
# --------------------------

def is_support_tech(tech_id, tech_data):
    """Heuristic: identify likely 'support' technologies."""
    name = tech_data.get("name", "").lower()
    tech_id_lower = tech_id.lower()
    for kw in SUPPORT_KEYWORDS:
        if kw.lower() in name or kw.lower() in tech_id_lower:
            return True
    return False


def build_lookup(data):
    """Create a lookup table by research ID."""
    lookup = {}
    for _, research_data in data.items():
        res_id = research_data.get("id")
        if res_id:
            lookup[res_id] = research_data
    return lookup


def trace_tree(tech_id, lookup, depth=0, visited=None):
    """Recursively trace prerequisite tree backward."""
    if visited is None:
        visited = set()

    if tech_id not in lookup:
        print(f"{INDENT * depth}{tech_id} [UNKNOWN ID]")
        return

    if tech_id in visited:
        print(f"{INDENT * depth}{tech_id} [CYCLE DETECTED]")
        return
    visited.add(tech_id)

    data = lookup[tech_id]
    support_mark = " [SUPPORT]" if is_support_tech(tech_id, data) else ""
    print(f"{INDENT * depth}{tech_id}{support_mark}")

    prereqs = data.get("requiredResearch", [])
    for pre in prereqs:
        trace_tree(pre, lookup, depth + 1, visited)


def load_file(delete_unused_researches:bool = False):

    filename = "research.json"
    if not os.path.exists(filename):
        print(f"Error: Could not find '{filename}' in the current directory.")
        sys.exit(1)

    with open(filename, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not delete_unused_researches:
        return data

    def in_research_blacklist(res_id):
        research_blacklist = ["R-Defense", "Flame", "Rocket", "Missile", 'R-Wpn-PlasmaCannon']
        for blacklisted_item in research_blacklist:
            if blacklisted_item in res_id:
                return True
        else:
            return False     

    # Delete unnecessary
    data1 = data.copy()
    for researchName, research_data in data.items():
        res_id = research_data.get("id")
        if res_id is not None:
            if in_research_blacklist(res_id):
                del data1[researchName]

    print(f"pruned len {len(data1)} old len: {len(data)}")

    return data1

def lookup_prerequisites():
    data = load_file(delete_unused_researches=True)

    lookup = build_lookup(data)

    print("=== Warzone 2100 Research Tree Tracer ===")
    tech_id = "R-Wpn-HowitzerMk1"

    print(f"\nTracing backward dependencies for: {tech_id}\n")
    trace_tree(tech_id, lookup)
    print("\n=== End of Tree ===")

def classify_tech_tree():
    data = load_file(delete_unused_researches=True)


    

if __name__ == "__main__":
    lookup_prerequisites()

    # MG
    # R-Wpn-MG-Damage09


    # CANNON
    # R-Wpn-Cannon-Damage08
    # R-Wpn-Cannon-ROF04
    # R-Wpn-RailGun01  

    # COMBAT SUPPORT (CS)
    # R-Wpn-Howitzer-Accuracy02
    # R-Wpn-Howitzer-Damage02
    
    # COMBAT SERVICES SUPPORT / COMBAT SUSTAINMENT (CSS)
    # R-Struc-Power-Upgrade02
    # R-Struc-VTOLPad-Upgrade04
    # R-Struc-Research-Upgrade08

    # MOBILTIY
    # R-Vehicle-Engine06

    # ARMOR
    # R-Vehicle-Metals07
    # R-Vehicle-Armor-Heat04
    # R-Cyborg-Metals07
    # R-Cyborg-Armor-Heat05

