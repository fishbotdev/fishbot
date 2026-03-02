"""
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
"""


def get_stats(file_path: str):
    import re

    # assumes Fishbot is in player "1" position and the enemy AI is in the player "2" position

    with open(file_path, "r", encoding="utf-8") as f:
        data = f.read()

    # Split by "Game ended" to count per game
    games = re.split(r"Game ended", data)
    games = games[1:len(games)]     # Truncate off the first entry
    cleaned_games = [g.split("[displayGameOver:388]")[0] for g in games]
    cleaned_games = [g.split("\n--------------------------------------------------------------------------------------\ninfo    |")[0] for g in cleaned_games]

    game_times_mins = [int(g.split("[gameTime: ")[1].split("]\n")[0]) / 1000 / 60 for g in cleaned_games]

    cleaned_stats = [g.split("Yellow-Fish |")[1] for g in cleaned_games]
    cleaned_stats = [g.split("\n--------------------------------------------------------------------------------------\n")[0] for g in cleaned_stats]

    del file_path, f, data, games, re

    # Separate fishbot vs other bot stats
    fishbot_stats = []
    opp_stats = []

    stat_column_definitions = [
        "Extracted Power",
        "Units Killed",
        "Structs (F/R)",
        "Units Alive",
        "Power",
        "Loss"
    ]

    for stat in cleaned_stats:
        split_stats = stat.split("\n")[0:2]     # Want 1st entry = Fishbot & second entry = opponent

        fishbot_raw_nums = [n.strip() for n in split_stats[0].split("|")]
        fishbot_raw_nums[-1] = False if fishbot_raw_nums[-1] == "" else True
        fishbot_formatted_nums = dict(zip(stat_column_definitions, fishbot_raw_nums))
        fishbot_stats.append(fishbot_formatted_nums)

        opp_raw_nums = [n.strip() for n in split_stats[1][19:].split("|")]  # Truncates off the first 18 characters = opponent bot name
        opp_raw_nums[-1] = False if opp_raw_nums[-1] == "" else True
        opp_formatted_nums = dict(zip(stat_column_definitions, opp_raw_nums))
        opp_stats.append(opp_formatted_nums)

    del cleaned_stats, stat_column_definitions, stat, split_stats, fishbot_raw_nums, fishbot_formatted_nums, opp_raw_nums, opp_formatted_nums

    """
    WIN / LOSS STATISTICS
    """
    fishbot_losses = []
    loss_counter = 0
    for s in fishbot_stats:
        fishbot_losses.append(s["Loss"])
        if s["Loss"]:
            loss_counter += 1

    print(f"FishBot lost {loss_counter} of {len(fishbot_stats)} games.")

    return [game_times_mins, fishbot_stats, opp_stats]

def show_stats(game_times_mins, fishbot_stats, opp_stats, title="", legend="", figNum=1):
    import matplotlib.pyplot as plt
    from math import floor

    """
    K/D STATISTICS
    """
    kd_stat = []

    # Get raw K/D data
    for i, stat in enumerate(fishbot_stats):
        d = opp_stats[i]["Units Killed"]
        k = stat["Units Killed"]
        if d == 0:
            d = 1       # prevent undef
        kd_stat.append(int(k) / int(d))

    del i, stat, k, d

    # Display raw K/D data
    plt.figure(1) # You can assign a figure number
    plt.hist(kd_stat, bins=floor(max(kd_stat))*2, alpha=0.7, align='left')
    plt.xlabel("K/D")
    plt.ylabel("Frequency")
    plt.title("Histogram of K/D")
    plt.legend(legend)
    plt.pause(0.1)

    """
    POWER STATISTICS
    """
    power_stat = []

    # Get raw K/D data
    for i, stat in enumerate(fishbot_stats):
        opp_power = opp_stats[i]["Extracted Power"]
        my_power = stat["Extracted Power"]
        if opp_power == 0:
            opp_power = 1       # prevent undef
        power_stat.append(int(my_power) / int(opp_power))

    del i, stat, opp_power, my_power

    # Display power extracted data
    plt.figure(4) # You can assign a figure number
    plt.hist(power_stat, bins=4, alpha=0.7, align='left')
    plt.xlabel("Power Extracted Ratio (FishBot / opponent)")
    plt.ylabel("Frequency")
    plt.title("Histogram of Ratio of Extracted Power")
    plt.legend(legend)
    plt.pause(0.1)

    """
    TIME TO WIN / LOSE STATISTICS
    """

    time_to_win = []
    time_to_lose = []
    for i, game_time in enumerate(game_times_mins):
        if not(fishbot_stats[i]["Loss"]):
            time_to_win.append(game_time)
        else:
            time_to_lose.append(game_time)

    plt.figure(figNum) # You can assign a figure number
    plt.hist(time_to_lose, bins=10, color='red', alpha=0.7, align='left')
    plt.hist(time_to_win, bins=10, color='green', alpha=0.7, align='left')
    plt.xlabel("Game times (mins) - wins (green) & losses (red)")
    plt.ylabel("Frequency")
    plt.ylim(bottom=0, top=40)
    plt.title(f"{title} - Histogram of Game times (mins)")
    # plt.show()
    plt.pause(0.1)

# TEST CODE
from os import getcwd


def show_medium_cobra_results():

    # file_path_test1_v2 = getcwd() + rf"\process_results/v3/test3_11_v2_d2c696a.txt"         # v2
    # file_path_test1_v2 = getcwd() + rf"\process_results/v3/test3_10_v3_1ce1841.txt"       # v3-dev: 4 / 100, basic rush strategy
    # file_path_test1_v2 = getcwd() + rf"\process_results/v3/test3_13_v3_c2f4e98_hard.txt"    # v3-dev: 1 / 100, after cyborg raiding + vtol optim
    # file_path_test1_v2 = getcwd() + rf"\process_results/v3/test3_14_hard_deadf9f.txt"       # v3 dev: 4.6.1
    # file_path_test1_v2 = getcwd() + rf"\process_results/v3/f761908,medium,462.txt"          # v3 dev: 4.6.2
    # file_path_test1_v2 = getcwd() + rf"\process_results/v3/eeeda14,medium,462.txt"          # v3 dev: 4.6.2, now with oil capping
    # file_path_test1_v2 = getcwd() + rf"\process_results/v3/b9a9e3a,medium,462.txt"          # v3 dev: 4.6.2, now with oil capping
    # file_path_test1_v2 = getcwd() + rf"\process_results/v3/83bc176,medium,462.txt"          # v3 dev: 4.6.2, improved oil capping
    # file_path_test1 = getcwd() + rf"\process_results/v3/7dc1d08,medium,462.txt"          # v3 dev: 4.6.2, optimised truck usage, research, heavy cannon + mortar strat, reverted to AG borgs
    # test_1 = getcwd() + rf"\process_results/v3/9ed8b2e,medium,462.txt"          # v3 dev: 4.6.2, optimised truck usage, research, safer fire support, raiding in main assault
    # test_1 = getcwd() + rf"\process_results/v3/ca092ce,medium,462.txt"          # v3 dev: 4.6.2, optimised research, TAC is back, 3rd factory
    # test_1 = getcwd() + rf"\process_results/v3/16279f6,medium,462.txt"          # v3 dev: 4.6.2, optimised research, TAC is back, 3rd factory
    # test_1 = getcwd() + rf"\process_results/v3/9bbccf2,medium,462.txt"          # v3 dev: 4.6.2, disabled Cobra teamplay personalities
    # test_1 = getcwd() + rf"\process_results/v3/8efda7a,medium,462.txt"          # v3 dev: 4.6.2, new (sector system & oil cap) have bugs    -> 28 / 50 were won (56%)
    # test_1 = getcwd() + rf"\process_results/v3/" + "2423a1e,medium,462" + ".txt"          # v3 dev: 4.6.2, fixed just sector system bugs              -> 83 / 100 games won (83%)
    # test_1 = getcwd() + rf"\process_results/v3/" + "f237739,medium,462" + ".txt"          # v3 dev: 4.6.2, fixed just sector system bugs              -> 83 / 100 games won (83%)
    # test_2 = getcwd() + rf"\process_results/v3/" + "9f3f181,medium,462" + ".txt"          # v3 dev: 4.6.2, fixed pickStructLoc bugs              -> 14 / 16 games won (83%)
    # test_1 = getcwd() + rf"\process_results/v3/" + "d383d0c,medium,462" + ".txt"          # v3 dev: 4.6.2, added mortar building
    # test_1 = getcwd() + rf"\process_results/v3/" + "a9e5915,medium,462" + ".txt"          # v3 dev: removed repairing when low  & optimised defence building
    # test_1 = getcwd() + rf"\process_results/v3/" + "5163c1c,medium,462" + ".txt"          # v3 dev: optimisations to construction & VTOL usage
    # test_1 = getcwd() + rf"\process_results/v3/" + "a5dd47e,medium,462" + ".txt"          # v3 dev: aborting construction missions when dangerous, VTOL unit optimisation
    # test_1 = getcwd() + rf"\process_results/v3/" + "1a6fac9,medium,462" + ".txt"          # v3 dev: (47/50 wins)
    # test_1 = getcwd() + rf"\process_results/v3/" + "3d6417d,medium,462" + ".txt"          # v3 dev: defence & oil cap optim (47/50 wins)
    # test_1 = getcwd() + rf"\process_results/v3/" + "a2ff8ab,medium,462" + ".txt"          # v3 dev: defence & oil cap optim (47/50 wins)
    # test_1 = getcwd() + rf"\process_results/v3/" + "f8094ef,medium" + ".txt"              # v3 dev: high prio oil cap optim [95 / 100 wins]
    # test_1 = getcwd() + rf"\process_results/v3/" + "68275e8,medium,463" + ".txt"            # v3 dev: [100 / 100 wins]
    # test_1 = getcwd() + rf"\process_results/v3/" + "29ceeb0,med,463" + ".txt"               # v3 dev: [143 / 150 wins]
    # test_1 = getcwd() + rf"\process_results/v4/" + "a2e13b4,med,cobra_v3_release" + ".txt"    # v3 release: retesting [98 / 100 wins]
    # test_1 = getcwd() + rf"\process_results/v4/" + "1e3edc5,med,cobra" + ".txt"               # v4 dev: before perf optimisations [96 / 100 won]
    test_1 = getcwd() + rf"\process_results/v4/" + "0c6d165,med,cobra,100g" + ".txt"               # perf: removed getAllBaseTargets [95 / 100 won]
    test_2 = getcwd() + rf"\process_results/v4/" + "2167472,med,cobra,50g" + ".txt"               # perf: before merging performance-improvements [49 / 49 won]
    
    commit1 = test_1.split(rf"v4/")[1].split(",")[0]
    commit2 = test_2.split(rf"v4/")[1].split(",")[0]

    show_stats(*get_stats(test_1), title=f"{commit1} (before)", figNum=2)                             
    show_stats(*get_stats(test_2), title=f"{commit2} (after)", legend=[commit1, commit2], figNum=3)   

def show_hard_cobra_results():

    # test_1 = getcwd() + rf"\process_results/v3/d2c696a,hard,461,v2fishbot.txt"       # v2
    # file_path_test1_v2 = getcwd() + rf"\process_results/v3/test3_10_v3_1ce1841.txt"       # v3-dev: 4 / 100, basic rush strategy
    # file_path_test1_v2 = getcwd() + rf"\process_results/v3/test3_13_v3_c2f4e98_hard.txt"  # v3-dev: 1 / 100, after cyborg raiding + vtol optim
    # test_1 = getcwd() + rf"\process_results/v3/deadf9f,hard,461.txt"                      # v3 dev: 
    # test_1 = getcwd() + rf"\process_results/v3/f761908,hard,462.txt"                      # v3 dev: initial update to 4.6.2 
    # test_1 = getcwd() + rf"\process_results/v3/" + "9ed8b2e,hard,462" + ".txt"              # v3 dev: 4.6.2, optimised truck usage, research, safer fire support, raiding in main assault
    # test_1 = getcwd() + rf"\process_results/v3/" + "a5dd47e,hard,462" + ".txt"              # v3 dev: 4.6.2, cobra teamplay removed, 2.5wks later, sector system + general constr + vtol updates
    # test_1 = getcwd() + rf"\process_results/v3/" + "88bc305,hard,462" + ".txt"              # v3 dev: 4.6.2, 
    # test_1 = getcwd() + rf"\process_results/v3/" + "de46989,hard,462" + ".txt"              # v3 dev: 4.6.2,
    # test_1 = getcwd() + rf"\process_results/v3/" + "e924a24,hard,462_2" + ".txt"              # v3 dev: 4.6.2, super ac borgs, more cyborgs
    # test_2 = getcwd() + rf"\process_results/v3/" + "78b6601,hard,462" + ".txt"              # v3 dev: 4.6.2, cyborg factories rebalanced, VTOL targeting includes CAS earlier
    # test_2 = getcwd() + rf"\process_results/v3/" + "b45b64a,hard,462" + ".txt"              # v3 dev: 4.6.2, VTOL targeting updated to match with capitalisation potential
    # test_1 = getcwd() + rf"\process_results/v3/" + "1a6fac9,hard,462" + ".txt"              # v3 dev: 4.6.2, VTOL targeting updated to match with capitalisation potential
    # test_1 = getcwd() + rf"\process_results/v3/" + "3d6417d,hard,462" + ".txt"              # v3 dev: 4.6.2, defence & oil cap optim (36/50 wins)
    # test_1 = getcwd() + rf"\process_results/v3/" + "a2ff8ab,hard,462" + ".txt"              # v3 dev: 4.6.2, 
    # test_1 = getcwd() + rf"\process_results/v3/" + "517541d,hard" + ".txt"              # v3 dev: 4.6.2, 
    # test_1 = getcwd() + rf"\process_results/v3/" + "1261742,hard" + ".txt"              # v3 dev: 4.6.2, 
    # test_1 = getcwd() + rf"\process_results/v3/" + "6f04840,hard" + ".txt"              # v3 dev: 4.6.2, 
    # test_1 = getcwd() + rf"\process_results/v3/" + "5c6703a,hard" + ".txt"              # v3 dev: 4.6.2, 
    # test_1 = getcwd() + rf"\process_results/v3/" + "68275e8,hard" + ".txt"              # v3 dev: 4.6.2, [40/50 wins] optimised oil cap, optimised cyborgs and research
    test_1 = getcwd() + rf"\process_results/v3/" + "29ceeb0,hard,463" + ".txt"              # v3 dev: 4.6.3, [63/86 wins] long term test
    test_2 = getcwd() + rf"\process_results/v4/" + "ca33b28,hard,cobra,100g" + ".txt"              # v4 dev: 4.6.3, [55 / 100 wins] regression after perf-optimisation

    commit1 = test_1.split(rf"v3/")[1].split(",")[0]
    commit2 = test_2.split(rf"v4/")[1].split(",")[0]

    show_stats(*get_stats(test_1), title=f"{commit1} (before)", figNum=2)                             
    show_stats(*get_stats(test_2), title=f"{commit2} (after)", legend=[commit1, commit2], figNum=3)     

def show_insane_diff_results():

    # test_1 = getcwd() + rf"\process_results/v4/" + "5c757ab,ins,2v1" + ".txt"               # v4 dev: v3 skrush against 2x nexus @insane
    
    # test_1 = getcwd() + rf"\process_results/v4/" + "5c757ab,hardins,1v2" + ".txt"           # v4 dev: v3 skrush 1x hard, 1x insane nexus        [39 / 50 wins]
    # test_1 = getcwd() + rf"\process_results/v4/" + "1df2117,hardins,1v2" + ".txt"           # v4 dev: v3 skrush 1x hard, 1x insane nexus, after perf optimisations [42 / 50 wins]
    test_1 = getcwd() + rf"\process_results/v4/" + "c7d8eb7,hardins,1v2,targoptim" + ".txt"           # v4 dev: v3 skrush 1x hard, 1x ins nexus, targeting optimisations - cancelVtol [33 / 50 wins]
    test_2 = getcwd() + rf"\process_results/v4/" + "4aee90e,hardins,1v2,vtolfix" + ".txt"           # v4 dev: v3 skrush 1x hard, 1x ins nexus, fixed vtol usage [38 / 50 wins]
    
    commit1 = test_1.split(rf"v4/")[1].split(",")[0]
    commit2 = test_2.split(rf"v4/")[1].split(",")[0]

    show_stats(*get_stats(test_1), title=f"{commit1} (earlier)", legend=[commit1, commit2], figNum=2)            
    show_stats(*get_stats(test_2), title=f"{commit2} (newer)", legend=[commit1, commit2], figNum=3)    


# show_medium_cobra_results()
# show_hard_cobra_results()
show_insane_diff_results()

import matplotlib.pyplot as plt
plt.show()
