import matplotlib.pyplot as plt
import numpy as np
from math import sin, cos, atan2, pi

import random

def clamp(value, min_val, max_val):
    return max(min_val, min(value, max_val))

def rand():
    # returns float between 0, 1, non-inclusive
    return random.uniform(np.nextafter(0, 1), 1)

fig, ax = plt.subplots(figsize=(8, 6))

# Particle initialization
XMAP_SIZE = 50
YMAP_SIZE = 50

PARTICLE_SIZE = 30
TARGET_SIZE = 100

n_particles = 18
x = np.random.rand(n_particles) * XMAP_SIZE
y = np.random.rand(n_particles) * YMAP_SIZE
vx = np.random.rand(n_particles) * 0.1
vy = np.random.rand(n_particles) * 0.1

# Group centroid
cx = 5
cy = 5
vcx = 0.0
vcy = 0.05

tx = 7
ty = 7
vtx = 0.5
vty = 0

# Compute ideal positions
offsets_wedge = np.array([
    [-3, 2], [-2, 3], [-1, 3], [0, 3], [1, 3], [2, 2],       # infantry
    [-2, 2], [-1, 2], [1, 2],                             # heavy cav
    [-3, 1], [2, 1], [0, 2],                                       # light cav
    [-1, 1], [0, 1], [-1, 0], [0, 0],                 # indirect fires
    [-2, 1], [1, 1],                                          # ADA
])
# 90 degrees clockwise rotation: New X = Old Y, New Y = -Old X
pointed_right = np.column_stack((offsets_wedge[:, 1], -offsets_wedge[:, 0]))

ref = np.array([[cx, cy]]) + pointed_right
refx = ref[:, 0]
refy = ref[:, 1]


# Color by dynamic value (e.g., initial speed metric)
speeds = np.sqrt(vx ** 2 + vy ** 2)
sc = ax.scatter(x, y, s=PARTICLE_SIZE, edgecolor='k', marker='s', c="blue") #c=speeds, cmap='plasma',)
centroid_sc = ax.scatter(cx, cy, s=TARGET_SIZE, edgecolor='k', c="blue", alpha=0.8)
formation_sc = ax.scatter(ref[:, 0], ref[:, 1], s=PARTICLE_SIZE, edgecolor='k', c="blue", alpha=0.3)
target_sc = ax.scatter(tx, ty, s=TARGET_SIZE, edgecolor='k', c="red", marker='d')       # red diamond
# plt.colorbar(sc, label='Speed')

ax.grid(True, alpha=0.5)
ax.set_xlim(0, XMAP_SIZE)
ax.set_ylim(0, YMAP_SIZE)
ax.set_title("Formation Movement Simulation")

# centroid parameter
kp_centroid = 0.05

# formation keeper parameters
kp_position = 0.8
kp_velocity = 0.3

UNIT_VMAX = 0.35
FORMATION_VMAX = UNIT_VMAX / 2      # empirically ~sqrt(2) seems to be about the ratio at which the units will always track the formation correctly
RANDOM_PERTURBATION = 0.1

# Place these outside your main simulation loop
target_time = 0
current_shape = "square"  # Options: 'square', 'circle', 'diagonal'

# Path parameters
CENTER_X = XMAP_SIZE / 2
CENTER_Y = YMAP_SIZE / 2
PATH_SIZE = 15      # Radius for circle, half-width for square
SPEED_MODIFIER = 0.008 # Lower is slower/smoother

# Simulation loop
for step in range(5000):

    #### KINEMATICS

    # Math updates
    x += vx + np.random.rand(n_particles) * RANDOM_PERTURBATION
    y += vy + np.random.rand(n_particles) * RANDOM_PERTURBATION
    cx += vcx
    cy += vcy
    tx += vtx
    ty += vty

    # Boundary logic
    vx = np.where((x < 0) | (x > XMAP_SIZE), -vx, vx)
    vy = np.where((y < 0) | (y > YMAP_SIZE), -vy, vy)
    vcx = np.where((cx < 0) | (cx > XMAP_SIZE), -vcx, vcx)
    vcy = np.where((cy < 0) | (cy > YMAP_SIZE), -vcy, vcy)

    #### TARGET SYSTEMATIC PATH GENERATOR
    target_time += SPEED_MODIFIER

    if current_shape == "square":
        # Divide time into 4 distinct phases for each edge of the square
        phase = (target_time) % 4
        if phase < 1:  # Top edge: moving Right
            tx = CENTER_X - PATH_SIZE + (phase * 2 * PATH_SIZE)
            ty = CENTER_Y - PATH_SIZE
        elif phase < 2:  # Right edge: moving Down
            tx = CENTER_X + PATH_SIZE
            ty = CENTER_Y - PATH_SIZE + ((phase - 1) * 2 * PATH_SIZE)
        elif phase < 3:  # Bottom edge: moving Left
            tx = CENTER_X + PATH_SIZE - ((phase - 2) * 2 * PATH_SIZE)
            ty = CENTER_Y + PATH_SIZE
        else:  # Left edge: moving Up
            tx = CENTER_X - PATH_SIZE
            ty = CENTER_Y + PATH_SIZE - ((phase - 3) * 2 * PATH_SIZE)

        # Switch to circle after NPHASES full loops
        NPHASES = 1
        if target_time > 4 * NPHASES:        # = number of phases
            current_shape = "circle"
            target_time = 0  # Reset time for smooth entry

    elif current_shape == "circle":
        # Pure parametric trigonometric circle logic
        tx = CENTER_X + PATH_SIZE * np.cos(target_time)
        ty = CENTER_Y + PATH_SIZE * np.sin(target_time)

        # Switch to diagonal lines after 3 full loops
        NPHASES = 1.5
        if target_time > NPHASES * 2 * 3:     # (3 * 2*pi approx 18.8)
            current_shape = "diagonal"
            target_time = 0

    elif current_shape == "diagonal":
        # Oscillates smoothly from bottom-left to top-right using a triangle wave
        ping_pong = np.abs((target_time % 2) - 1)  # Scales cleanly between 0 and 1

        tx = CENTER_X - PATH_SIZE + (ping_pong * 2 * PATH_SIZE)
        ty = CENTER_Y - PATH_SIZE + (ping_pong * 2 * PATH_SIZE)

        # Loop back to square after running for a bit
        if target_time > 15:
            current_shape = "square"
            target_time = 0

    if tx < 0 or tx > XMAP_SIZE:
        vtx = -vtx
        vty = rand()
    if ty < 0 or ty > YMAP_SIZE:
        vtx = rand()
        vty = -vty

    #### CONTROLLER

    #### FORMATION KEEPER
    # Compute position error terms vectorised :)
    ex = refx - x         # note: positive when further to the right. Want a positive adjustment to velocity
    ey = refy - y
    evx = vcx - vx      # note: positive when going faster to teh right, want a positive adjustment to velocity
    evy = vcy - vy

    # Compute error correction term
    ux_position = kp_position * ex
    uy_position = kp_position * ey
    ux_velocity = kp_velocity * evx
    uy_velocity = kp_velocity * evy

    vx += ux_position + ux_velocity
    vy += uy_position + uy_velocity

    #### CENTROID MODIFICATION (BASED ON TARGET LOCATION)
    etx = tx - cx
    ety = ty - cy

    ux_target_pos = kp_centroid * etx
    uy_target_pos = kp_centroid * ety

    # Modify existing vx with correction term; add *deadzone*
    if abs(etx) > 0.2:
        vcx += ux_target_pos
    else:
        vcx = 0.0

    if abs(ety) > 0.2:
        vcy += uy_target_pos
    else:
        vcy = 0.0

    if abs(etx) < 5.0 and abs(ety) < 5.0:
        vcx = vcx / 3
        vcy = vcy / 3

    # Create formation from centroid
    # Get angle of target to rotate the formation appropriately
    theta = atan2(ety, etx)     # atan2 implements this in both python (also exists in JS so lets not reinvent the wheel)

    rotation_matrix = np.array([
        [cos(theta), -sin(theta)],
        [sin(theta), cos(theta)]
    ])

    rotated_formation = pointed_right @ rotation_matrix.T

    ref = np.array([[cx, cy]]) + rotated_formation      # updates based on new cx, cy

    refx = ref[:, 0]
    refy = ref[:, 1]

    ## RENDER

    # Cap vx, vy
    vx = np.clip(vx, -UNIT_VMAX, UNIT_VMAX)
    vy = np.clip(vy, -UNIT_VMAX, UNIT_VMAX)

    vcx = clamp(vcx, -FORMATION_VMAX, FORMATION_VMAX)
    vcy = clamp(vcy, -FORMATION_VMAX, FORMATION_VMAX)

    # Update visual markers and colors dynamically
    current_speeds = vx ** 2 + vy ** 2                      # removed sqrt for speed
    sc.set_offsets(np.c_[x, y])
    sc.set_array(current_speeds)  # Dynamic recoloring

    # FIX 2: Update the centroid scatter plot position on the screen
    centroid_sc.set_offsets(np.c_[cx, cy])
    formation_sc.set_offsets(ref.reshape(-1, 2))        # Magic: Flatten the N targets and 6 offsets into a single sequence of points
    target_sc.set_offsets(np.c_[tx, ty])

    fig.canvas.draw()
    fig.canvas.flush_events()
    plt.pause(0.0001)  # Short pause to allow rendering
