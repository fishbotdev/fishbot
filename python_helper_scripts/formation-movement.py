import matplotlib.pyplot as plt
import numpy as np

# Turn on interactive mode
# plt.ion()
fig, ax = plt.subplots(figsize=(8, 6))

# Particle initialization
n_particles = 20
x = np.random.rand(n_particles) * 10
y = np.random.rand(n_particles) * 10
vx = np.random.rand(n_particles) * 0.1
vy = np.random.rand(n_particles) * 0.1

# Color by dynamic value (e.g., initial speed metric)
speeds = np.sqrt(vx ** 2 + vy ** 2)
sc = ax.scatter(x, y, s=100, edgecolor='k',) #c=speeds, cmap='plasma',)
# plt.colorbar(sc, label='Speed')

ax.set_xlim(0, 10)
ax.set_ylim(0, 10)
ax.set_title("Unit Movement Simulation")

# Simulation loop
for step in range(20000):
    # Math updates
    x += vx
    y += vy

    # Boundary logic
    vx = np.where((x < 0) | (x > 10), -vx, vx)
    vy = np.where((y < 0) | (y > 10), -vy, vy)

    # Update visual markers and colors dynamically
    current_speeds = np.sqrt(vx ** 2 + vy ** 2)
    sc.set_offsets(np.c_[x, y])
    sc.set_array(current_speeds)  # Dynamic recoloring

    fig.canvas.draw()
    fig.canvas.flush_events()
    plt.pause(0.01)  # Short pause to allow rendering