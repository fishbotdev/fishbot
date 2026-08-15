import matplotlib.pyplot as plt
import numpy as np

# Turn on interactive mode
fig, ax = plt.subplots(figsize=(8, 6))

# Particle initialization
XMAP_SIZE = 10
YMAP_SIZE = 10

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
sc = ax.scatter(x, y, s=100, edgecolor='k',) #c=speeds, cmap='plasma',)
centroid_sc = ax.scatter(cx, cy, s=200, edgecolor='k', c="red", alpha=0.6)
formation_sc = ax.scatter(ref[:, 0], ref[:, 1], s=200, edgecolor='k', c="blue", alpha=0.4)
# plt.colorbar(sc, label='Speed')

ax.set_xlim(0, XMAP_SIZE)
ax.set_ylim(0, YMAP_SIZE)
ax.grid(True)
ax.set_title("Unit Movement Simulation")

kp_position = 1.2
kp_velocity = 0

VMAX = 1

# Simulation loop
for step in range(20000):

    #### KINEMATICS

    # Cap vx, vy
    vx = np.clip(vx, -VMAX, VMAX)
    vy = np.clip(vy, -VMAX, VMAX)

    # Math updates
    x += vx + np.random.rand(n_particles) * 0.1
    y += vy + np.random.rand(n_particles) * 0.1
    cx += vcx
    cy += vcy

    # Boundary logic
    vx = np.where((x < 0) | (x > 10), -vx, vx)
    vy = np.where((y < 0) | (y > 10), -vy, vy)
    vcx = np.where((cx < 0) | (cx > 10), -vcx, vcx)
    vcy = np.where((cy < 0) | (cy > 10), -vcy, vcy)

    ref = np.array([[cx, cy]]) + offsets_wedge
    refx = ref[:, 0]
    refy = ref[:, 1]

    #### CONTROLLER

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

    # Modify existing vx with correction term
    vx += ux_position + ux_velocity
    vy += uy_position + uy_velocity



    ## RENDER

    # Update visual markers and colors dynamically
    current_speeds = vx ** 2 + vy ** 2                      # removed sqrt for speed
    sc.set_offsets(np.c_[x, y])
    sc.set_array(current_speeds)  # Dynamic recoloring

    # FIX 2: Update the centroid scatter plot position on the screen
    centroid_sc.set_offsets(np.c_[cx, cy])
    formation_sc.set_offsets(ref.reshape(-1, 2))        # Magic: Flatten the N targets and 6 offsets into a single sequence of points

    fig.canvas.draw()
    fig.canvas.flush_events()
    plt.pause(0.01)  # Short pause to allow rendering
