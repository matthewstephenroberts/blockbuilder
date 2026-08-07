# BlockBuilder Coordinate System & Orientation

## Grid Editor ↔ 3D View Mapping

The coordinate system maps the 2D grid editor to the 3D isometric view as follows:

### Grid Editor Layout
- **Left side** = x = 0
- **Right side** = x = width-1 (e.g., x = 9 for 10×10)
- **Top row** = storage y = height-1 (displayed as row 0 after Y-flip)
- **Bottom row** = storage y = 0 (displayed as row 9 after Y-flip)

### 3D World Coordinates
```
cx = (x - (width-1) / 2) * STUD_PITCH        // X axis: -36mm (left) to +36mm (right)
cy = (y - (height-1) / 2) * STUD_PITCH       // Y axis: -36mm (close) to +36mm (far)
cz = layerBase + cellHeight / 2              // Z axis: height from layer base
```

### Isometric Home View Camera Position
```
Camera at: (-cameraDistance * 0.67, -cameraDistance * 0.67, cameraDistance * 0.75)
Looking at: center of geometry
Up vector: [0, 0, 1] (Z points up)
```

This camera position is from the **left-front-up** direction, which creates the correct isometric projection:
- **Grid top-left** → **3D far-left** ✓
- **Grid top-right** → **3D far-right** ✓
- **Grid bottom-left** → **3D close-left** ✓
- **Grid bottom-right** → **3D close-right** ✓

## Critical: Do Not Change

The following must remain consistent:
1. **Geometry builder coordinates** - Use original (x, y) to (cx, cy) mapping
2. **Grid editor Y-flip** - Display flip at `y = grid.height - 1 - row` in GridEditor.cellAt()
3. **Camera position** - Always (-0.67, -0.67, +0.75) for home isometric view
4. **Preview cameras** - All previews (brushes, catalog items) must use matching orientation

## Implementation Notes

- Grid storage uses y=0 at front, y=height-1 at back
- Grid display flips rows for usability (top = far)
- Camera position from left-front compensates for the coordinate system
- All THREE.js cameras rendering 3D previews must match the main viewport camera angle
