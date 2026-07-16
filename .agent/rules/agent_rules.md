# AI Agent Development Rules

When writing code or making architectural decisions for this project, the AI must strictly adhere to these rules:

1. **Always decouple logic from rendering:** Game logic, movement, and physics must be handled by the ECS and never tightly coupled to Three.js `Mesh` objects.
2. **Never build UI in WebGL:** All user interfaces, including the minimap, menus, and HUD, must be built using standard HTML and CSS overlaid on top of the canvas.
3. **Use Orthographic Cameras:** Do not use `PerspectiveCamera` unless explicitly requested. The game relies on an `OrthographicCamera` for its tilt-shift, isometric aesthetic.
4. **Prioritize Performance:** 
   - Collision maps must use a hidden 2D Canvas in CPU memory.
   - Minimaps must use the "cheap" CSS positioning method.
5. **Aesthetics are critical:** When implementing Three.js materials, always consider Subsurface Scattering, high roughness, and soft lighting over default basic materials.
6. **Code Structure:** Adhere to the Vite + Electron architecture. Keep logic modular. When adding entities, use the ECS pattern.
