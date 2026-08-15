import matplotlib.pyplot as plt
import numpy as np

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

PARTICLE_SIZE = 20
TARGET_SIZE = 50

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
ref = np.array([[cx, cy]]) + offsets_wedge

# Color by dynamic value (e.g., initial speed metric)
speeds = np.sqrt(vx ** 2 + vy ** 2)
sc = ax.scatter(x, y, s=PARTICLE_SIZE, edgecolor='k',) #c=speeds, cmap='plasma',)
centroid_sc = ax.scatter(cx, cy, s=TARGET_SIZE, edgecolor='k', c="blue", alpha=0.8)
formation_sc = ax.scatter(ref[:, 0], ref[:, 1], s=PARTICLE_SIZE, edgecolor='k', c="blue", alpha=0.3)
target_sc = ax.scatter(tx, ty, s=TARGET_SIZE, edgecolor='k', c="red")
# plt.colorbar(sc, label='Speed')

ax.grid(True, alpha=0.5)
ax.set_xlim(0, XMAP_SIZE)
ax.set_ylim(0, YMAP_SIZE)
ax.set_title("Unit Movement Simulation")

kp_position = 1
kp_velocity = 0.2

UNIT_VMAX = 0.2
FORMATION_VMAX = 0.140      # empirically ~sqrt(2) seems to be about the ratio at which the units will always track the formation correctly

# Simulation loop
for step in range(20000):

    #### KINEMATICS

    # Cap vx, vy
    vx = np.clip(vx, -UNIT_VMAX, UNIT_VMAX)
    vy = np.clip(vy, -UNIT_VMAX, UNIT_VMAX)

    vcx = clamp(vcx, -FORMATION_VMAX, FORMATION_VMAX)
    vcy = clamp(vcy, -FORMATION_VMAX, FORMATION_VMAX)

    # Math updates
    x += vx + np.random.rand(n_particles) * 0.1
    y += vy + np.random.rand(n_particles) * 0.1
    cx += vcx
    cy += vcy
    tx += vtx
    ty += vty

    # Boundary logic
    vx = np.where((x < 0) | (x > XMAP_SIZE), -vx, vx)
    vy = np.where((y < 0) | (y > YMAP_SIZE), -vy, vy)
    vcx = np.where((cx < 0) | (cx > XMAP_SIZE), -vcx, vcx)
    vcy = np.where((cy < 0) | (cy > YMAP_SIZE), -vcy, vcy)

    if tx < 0 or tx > XMAP_SIZE:
        vtx = -vtx
        vty = rand() * UNIT_VMAX
    if ty < 0 or ty > YMAP_SIZE:
        vtx = rand() * UNIT_VMAX
        vty = -vty

    # Create formation from centroid
    ref = np.array([[cx, cy]]) + offsets_wedge
    refx = ref[:, 0]
    refy = ref[:, 1]

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
    ux_target_pos = kp_position * etx
    uy_target_pos = kp_position * ety

    # Modify existing vx with correction term
    vcx += ux_target_pos
    vcy += uy_target_pos



    ## RENDER

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
