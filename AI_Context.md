# AI_Context.md — Reference Frames & Conventions (RC Flight Sim)

This document is **persistent context for LLMs** working on this repo.

Its purpose is to:
- Lock in **reference-frame conventions** that are now *implemented and working*
- Prevent regressions as new features are added
- Provide a single source of truth for variable naming, transforms, and semantics

Everything here reflects the **current, correct state of the codebase**.

---

## 1) Frames in use (canonical, implemented)

There are **four explicit frames** in the system:

### 1.1 World frame — **W (ENU, right‑handed)**
Simulation meaning lives here.

- **+Xᴡ = East**
- **+Yᴡ = North**
- **+Zᴡ = Up**

Used for:
- Aircraft position (`position_W`)
- Velocity (`v_W`)
- Global navigation / motion

---

### 1.2 Aircraft body frame — **B (FRD, right‑handed)**
All aircraft-centric meaning lives here.

- **+Xʙ = Forward (nose)**
- **+Yʙ = Right (starboard)**
- **+Zʙ = Down**

Right‑hand rule conventions:
- **Roll (p)** about **+Xʙ** → right wing down
- **Pitch (q)** about **+Yʙ** → nose *down* for positive rotation
- **Yaw (r)** about **+Zʙ** → nose right

⚠️ Important: Because FRD uses +Z = Down, **pitch command signs must be handled carefully**.

---

### 1.3 Three.js render frame — **T (right‑handed, Y‑up)**
Rendering-only frame.

- **+Xᵀ = right**
- **+Yᵀ = up**
- **+Zᵀ = backward** (Three.js camera looks down −Z)

Used only for:
- Scene graph transforms
- Visual debugging

No physics meaning should originate in this frame.

---

### 1.4 Model frame — **M (AC3D authored frame)**
Raw mesh orientation as authored in AC3D.

Observed aircraft model axes:
- Forward ≈ **−Xᴍ**
- Up ≈ **+Yᴍ**
- Right ≈ **−Zᴍ**

This frame must **never leak into physics logic**.

---

## 2) Fixed, canonical frame mappings (DO NOT CHANGE)

### 2.1 World (ENU) → Three.js mapping

This mapping is implemented in `Frames.js` and is a **proper rotation** (det = +1).

```
xᵀ =  xᴡ   (East)
yᵀ =  zᴡ   (Up)
zᵀ = −yᴡ   (−North)
```

Meaning:
- Three.js +Y remains Up
- North points toward −Z in Three.js

Utilities:
- `worldToThreeVec(v_W) → v_T`
- `threeToWorldVec(v_T) → v_W`
- `worldToThreeQuat(q_WB) → q_TB`

---

### 2.2 Model → Body mapping (AC3D → FRD)

Applied **once** at the model root via a constant quaternion:

```
xʙ = −xᴍ
yʙ = −zᴍ
zʙ = −yᴍ
```

Name:
- `q_BM` = rotation mapping **Model → Body**

This transform:
- Makes the aircraft visually point along +Xʙ
- Preserves hinge-axis correctness

---

## 3) Scene graph (actual implemented structure)

```
Scene (Three.js)
└── root_T                 // driven by World state (position_W, q_WB)
    └── ac3dRoot_B         // fixed Model→Body correction (q_BM)
        ├── visual meshes
        ├── fmodel meshes
        └── control surfaces (hinged)
```

Rules:
- `root_T` is the **only node** that moves in world space
- `ac3dRoot_B` is static except for its fixed correction
- Control surfaces rotate **only in mesh-local coordinates**

---

## 4) State variables (current, implemented)

### 4.1 Rigid-body state

- `position_W : Vector3` — aircraft position in World ENU
- `velocity_W : Vector3` — aircraft linear velocity in World ENU
- `q_WB : Quaternion` — **Body → World** attitude
- `omega_B : Vector3` — aircraft angular velocity in Body FRD

Implementation note:
- Physics state is stored as **previous/current** snapshots (`statePrev`, `stateCurr`) to support render interpolation.

Initialization:
- Aircraft starts **pointing North**
- Aircraft starts **upright**

---

### 4.2 Angular motion (body rates)

Body-frame angular velocity commands:

- `p` (roll rate about +Xʙ) max **80 deg/s**
- `q` (pitch rate about +Yʙ) max **70 deg/s**
- `r` (yaw rate about +Zʙ) max **30 deg/s**

Integration:
- Rates are applied in **body frame**
- Quaternion update is **right-multiplication** (`q_WB ← q_WB ⊗ dq`)

⚠️ Sign rule (locked in):
- **Pitch command is negated** when mapped to `q`
  - Stick back → nose up

---

### 4.3 Translational motion (throttle → speed)

Throttle model (implemented):

- Input throttle ∈ **[−1, +1]**
- Mapped to **[0, 1]**
- Forward speed range: **0 → 20 m/s**

State:
- `velocity_W`

Motion:
- Desired velocity is along **+Xʙ** (forward), rotated by `q_WB` into World ENU.
- The aircraft approaches the desired velocity under an acceleration limit (`maxForwardAccelMps2`).
- Integration happens in the fixed physics step:

```
velocity_W += clamp(desiredVel_W - velocity_W, maxForwardAccelMps2 * dt)
position_W += velocity_W * dt
```

---

## 5) Control surfaces vs physics (important distinction)

Control surface deflections:
- `deltaA` (ailerons)
- `deltaE` (elevator)
- `deltaR` (rudder)
- `throttle`

These are:
- **Commands**, not attitude
- Expressed conceptually in **Body FRD** terms

---

## 6) Simulation timing & update phases (fixed-step physics)

This repo uses a **fixed physics timestep** with an accumulator.

Rules:
- Physics stepping runs at `fixedDt` (e.g. 1/120 s), independent of render FPS.
- Each render frame may run **0..N** physics substeps.
- Rendering uses **interpolation** between the previous and current physics states.

### 6.1 Update phase separation (strict)

1) **Input sampling** (render-rate)
   - Read/condition raw input devices.
   - Produces stable command values (roll/pitch/yaw/throttle).

2) **Physics stepping** (fixed-rate)
   - Updates authoritative state only: `position_W`, `velocity_W`, `q_WB`, `omega_B`.
   - Must not call Three.js scene graph APIs.

3) **Render / animation** (render-rate)
   - Interpolates pose (position lerp, quaternion slerp) and applies to `root_T`.
   - Visual-only animation is allowed here (control surfaces, prop spin, etc.).

Rigid-body attitude and motion come **only** from integrated rates and velocity.

---

## 7) Mandatory variable naming rules (DO NOT VIOLATE)

### 7.1 Frame suffixes

Every non-trivial quantity must be labeled with the frame it is expressed in:

- `_W` — World ENU
- `_B` — Body FRD
- `_T` — Three.js render frame
- `_M` — Model (AC3D) frame

Examples:
- `position_W`, `v_W`
- `omega_B`, `forwardDir_B`
- `hingeAxis_M`

---

### 7.2 Quaternion naming (direction matters)

Rule:
- `q_AB` maps **B → A**

Examples:
- `q_WB` — Body → World (aircraft attitude)
- `q_TW` — World → Three
- `q_BM` — Model → Body

---

### 7.3 Allowed exceptions

Only these may omit suffixes:
- `tmpVec`, `tmpQuat` (very short scope)
- Loop locals (`i`, `v0`, `v1`)

Everything else: **suffix required**.

---

## 8) Visual debugging aids (present in code)

### 8.1 Frame indicators

- **Three.js frame**:
  - +X red, +Y green, +Z blue

- **World ENU frame**:
  - East magenta
  - North cyan
  - Up yellow
  - Thicker + shorter than Three.js axes

- **Body frame (attached to aircraft)**:
  - Forward black
  - Right white
  - Up gray

These are trusted sanity checks.

---

## 9) Things you should NOT do

- ❌ Do not mix ENU and Three.js axes directly
- ❌ Do not apply Euler angles directly to the aircraft
- ❌ Do not bake Model→Body transforms into geometry *and* also rotate parents
- ❌ Do not create unlabeled vectors/quaternions in shared scope

---

## 10) Definition of done (current phase)

This phase is complete because:

- Frames are explicit and implemented
- Body rates integrate correctly
- Throttle produces forward motion in World frame
- Visual axes confirm correctness

Future work (lift, drag, gravity, wind, etc.) must **respect everything above**.

---

**If you are an LLM reading this:**
Before adding features, re-read Sections 1–4 and follow the naming rules in Section 7.

